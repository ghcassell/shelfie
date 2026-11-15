// Everything that differs between the phone and the browser, bar the camera and the digest. The browser's versions are in platform.web.ts.
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { Alert, type AlertButton } from 'react-native';

/** Small per-device settings that never sync. */
export { default as kv } from 'expo-sqlite/kv-store';

export const alert = (title: string, message?: string, buttons?: AlertButton[]) => Alert.alert(title, message, buttons);

export const pickDateTime = (mode: 'date' | 'time', value: Date, onChange: (picked: Date) => void) =>
  DateTimePickerAndroid.open({ value, mode, is24Hour: true, onValueChange: (_e, d) => onChange(d) });

const fileUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);

export const deletePhoto = (path: string) => {
  try { new File(fileUri(path)).delete(); } catch { /* already gone */ }
};

/** A photo downscaled to `width`, as base64 JPEG. */
export async function photoBase64(path: string, width: number) {
  const small = await manipulateAsync(fileUri(path), [{ resize: { width } }], { compress: 0.7, format: SaveFormat.JPEG });
  const file = new File(small.uri);
  const base64 = await file.base64();
  file.delete();
  return base64;
}

export async function shareFile(name: string, content: string | Uint8Array, mimeType: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType });
}

/** The text of a JSON file the user picks, or null if they cancel. */
export async function pickJsonText(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  return picked.canceled ? null : new File(picked.assets[0].uri).text();
}
