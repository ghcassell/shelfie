// Browser versions of platform.ts. Keep the exports in step with it: TypeScript only checks the native file.
import type { AlertButton } from 'react-native';

/** react-native-web's Alert does nothing, so the browser's own dialogs stand in: one action button plus Cancel. */
export function alert(title: string, message?: string, buttons?: AlertButton[]) {
  const text = [title, message].filter(Boolean).join('\n\n');
  const action = buttons?.find((b) => b.style !== 'cancel' && b.onPress);
  if (!action) window.alert(text);
  else if (window.confirm(text)) action.onPress!();
}

/** The browser's own store: a second SQLite database (the kv-store) fails to open beside the app's on web. */
export const kv = {
  getItemSync: (key: string) => localStorage.getItem(key),
  setItemSync: (key: string, value: string) => localStorage.setItem(key, value),
};

const pad = (n: number) => String(n).padStart(2, '0');
let input: HTMLInputElement | undefined;

/** The browser's own date or time picker, opened from one hidden input. */
export function pickDateTime(mode: 'date' | 'time', value: Date, onChange: (picked: Date) => void) {
  if (!input) {
    input = document.createElement('input');
    input.style.cssText = 'position:fixed;top:40%;left:50%;opacity:0;pointer-events:none';
    document.body.append(input);
  }
  const field = input;
  const day = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  field.type = mode;
  field.value = mode === 'date' ? day : `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  field.onchange = () => { if (field.value) onChange(new Date(mode === 'date' ? `${field.value}T12:00:00` : `${day}T${field.value}:00`)); };
  field.showPicker();
}

/** Uploaded photos are data URIs held in memory: nothing to delete. */
export const deletePhoto = (_path: string) => {};

/** camera.web.tsx already downscaled the upload, so this only strips the data URI header. */
export const photoBase64 = async (dataUri: string, _width: number) => dataUri.slice(dataUri.indexOf(',') + 1);

/** Downloads the file. */
export async function shareFile(name: string, content: string | Uint8Array, mimeType: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content as BlobPart], { type: mimeType }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** The browser's file chooser. Null if the user cancels. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const chooser = document.createElement('input');
    chooser.type = 'file';
    chooser.accept = accept;
    chooser.onchange = () => resolve(chooser.files?.[0] ?? null);
    chooser.oncancel = () => resolve(null);
    chooser.click();
  });
}

export const pickJsonText = async () => (await pickFile('application/json,.json'))?.text() ?? null;
