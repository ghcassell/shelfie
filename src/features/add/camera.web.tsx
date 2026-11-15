// Browser stand-ins for camera.tsx: no scanning, photos are uploaded instead. Keep the exports in step with it.
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { OcrLine } from '../../domain/receipt';
import { Button, ProductTile, s } from '../../ui/components';
import { pickFile } from '../../ui/platform.web';
import { space } from '../../ui/theme';

/** Lets the user choose an image and returns it downscaled, as a JPEG data URI. Null if they cancel. */
async function uploadImage(width: number, quality: number): Promise<string | null> {
  const file = await pickFile('image/*');
  if (!file) return null;
  const image = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(width, image.width);
  canvas.height = Math.round(image.height * (canvas.width / image.width));
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function UploadButton({ label, width, quality, onImage }: { label: string; width: number; quality: number; onImage: (dataUri: string) => void }) {
  const [error, setError] = useState('');
  const upload = async () => {
    setError('');
    try {
      const image = await uploadImage(width, quality);
      if (image) onImage(image);
    } catch (e) {
      console.warn('Image upload', e);
      setError('Could not read that image. Try another file.');
    }
  };
  return (
    <>
      <Button label={label} icon="upload" kind="secondary" onPress={upload} />
      {!!error && <Text style={s.error}>{error}</Text>}
    </>
  );
}

/** No scanner in the browser: the screens that use this already offer a field for typing the barcode. */
export function BarcodeCamera(_props: { onScan: (barcode: string) => void }) {
  return <Text style={s.muted}>Scanning needs the phone app. Type the barcode here instead.</Text>;
}

export interface OcrResult { text: string; lines: OcrLine[] }

/** Nothing reads text in the browser, so the upload comes back with no lines; the receipt screen's "Improve with AI" reads it. */
export function TextCamera({ onText }: { label: string; onText: (result: OcrResult, photoPath: string) => void; tall?: boolean }) {
  return <UploadButton label="Upload a photo of the receipt" width={1000} quality={0.7} onImage={(image) => onText({ text: '', lines: [] }, image)} />;
}

/** Same sizes as the phone's photo, so it syncs inside the Product row. */
export function PhotoCamera({ onPhoto }: { onPhoto: (dataUri: string) => void }) {
  return <UploadButton label="Upload a photo" width={240} quality={0.6} onImage={onPhoto} />;
}

export function PhotoField({ name, category, imageUrl, onChange }: {
  name: string; category: string | null; imageUrl: string | null; onChange: (imageUrl: string | null) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <ProductTile name={name} category={category} imageUrl={imageUrl} size={72} />
      <View style={{ flex: 1, gap: space.sm }}>
        <PhotoCamera onPhoto={onChange} />
        {imageUrl?.startsWith('data:') && <Button label="Remove photo" kind="secondary" onPress={() => onChange(null)} />}
      </View>
    </View>
  );
}
