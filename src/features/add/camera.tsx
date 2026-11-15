import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useIsFocused } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, type CameraRef, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { CodeScanner } from 'react-native-vision-camera-barcode-scanner';
import { processImageTextRecognition } from 'react-native-vision-camera-mlkit';
import type { OcrLine } from '../../domain/receipt';
import { Button, IconButton, ProductTile, s, Sheet } from '../../ui/components';
import { color, radius, space } from '../../ui/theme';

/** Asks for the camera, or explains how to carry on without it. */
function CameraGate({ children }: { children: ReactNode }) {
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  useEffect(() => { if (!hasPermission && canRequestPermission) requestPermission(); }, [hasPermission, canRequestPermission, requestPermission]);
  if (hasPermission) return <>{children}</>;
  return (
    <View style={[st.frame, st.center]}>
      <Text style={[s.muted, { color: '#fff', textAlign: 'center' }]}>
        Shelfie needs the camera to scan. Allow it in Android settings, or enter the details by hand.
      </Text>
    </View>
  );
}

/** Live barcode scanner (ML Kit). Reports each distinct code once. QR and DataMatrix are for the newer GS1 codes that carry the product number. */
export function BarcodeCamera({ onScan }: { onScan: (barcode: string) => void }) {
  const focused = useIsFocused();
  const last = useRef('');
  const previous = useRef<string | undefined>(undefined);
  return (
    <CameraGate>
      <View style={st.frame}>
        <CodeScanner
          style={StyleSheet.absoluteFill}
          isActive={focused}
          // ponytail: no UPC-E (rare in the UK, and half-seen EAN-13s misread as it). Add it, expanded to UPC-A, if US imports matter.
          barcodeFormats={['ean-13', 'ean-8', 'upc-a', 'qr-code', 'data-matrix']}
          onBarcodeScanned={(codes) => {
            const value = codes[0]?.rawValue;
            // A blurry frame can be misread as a different, valid-looking number. Only a code read the same way twice running counts.
            const steady = value === previous.current;
            previous.current = value;
            if (value && steady && value !== last.current) { last.current = value; onScan(value); }
          }}
          onError={(e) => console.warn('Barcode scanner', e)}
        />
      </View>
    </CameraGate>
  );
}

export interface OcrResult { text: string; lines: OcrLine[] }

/** Takes a photo and reads its text on the phone (ML Kit). The photo path is handed back for the caller to delete. */
export function TextCamera({ label, onText, tall }: { label: string; onText: (result: OcrResult, photoPath: string) => void; tall?: boolean }) {
  const focused = useIsFocused();
  const device = useCameraDevice('back');
  const photo = usePhotoOutput({ qualityPrioritization: 'quality' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [frameWidth, setFrameWidth] = useState(0);
  const [torch, setTorch] = useState(false);
  const camera = useRef<CameraRef>(null);

  const capture = async () => {
    setBusy(true);
    setError('');
    try {
      // Focus on the middle of the frame and wait for it to settle, so the shot is not taken mid-hunt. A failed focus should not stop the photo.
      await camera.current?.focusTo({ x: frameWidth / 2, y: (tall ? TALL : FRAME) / 2 }).catch(() => {});
      const shot = await photo.capturePhoto({}, {});
      const full = await shot.saveToTemporaryFileAsync();
      shot.dispose();
      // ML Kit refuses still images over 4 MP, and a phone photo is several times that. 1440 wide stays under it for any phone aspect ratio.
      const fullUri = full.startsWith('file://') ? full : `file://${full}`;
      const save = { compress: 0.9, format: SaveFormat.JPEG };
      const whole = await manipulateAsync(fullUri, [{ resize: { width: 1440 } }], save);
      new File(fullUri).delete();
      let path = whole.uri;
      if (!tall && frameWidth) {
        // Read only what is inside the aiming box, so print around the date cannot be mistaken for it.
        // ponytail: assumes the photo covers the preview; the 1.3 margin absorbs the difference. Map through the preview's real field of view if dates get clipped.
        const scale = Math.max(frameWidth / whole.width, FRAME / whole.height);
        const width = Math.min(whole.width, (frameWidth * BOX.width * 1.3) / scale);
        const height = Math.min(whole.height, (BOX.height * 1.3) / scale);
        const crop = { originX: (whole.width - width) / 2, originY: (whole.height - height) / 2, width, height };
        path = (await manipulateAsync(whole.uri, [{ crop }], save)).uri;
        new File(whole.uri).delete();
      }
      const result = await processImageTextRecognition(path, { language: 'LATIN' });
      const lines = result.blocks.flatMap((b) => b.lines).map((l) => ({ text: l.text, x: l.bounds.x, y: l.bounds.y, height: l.bounds.height }));
      onText({ text: result.text, lines }, path);
    } catch (e) {
      console.warn('Text scan', e);
      setError('Could not read that. Try again, or enter it by hand.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <CameraGate>
      <View style={[st.frame, tall && { height: TALL }]} onLayout={(e) => setFrameWidth(e.nativeEvent.layout.width)}>
        {/* Phones cannot focus on small print up close. Zoomed in, the print fills the frame from a distance the lens can focus at; a tap refocuses. The torch keeps the shutter fast enough for sharp print indoors. */}
        {device && (
          <Camera
            ref={camera} torchMode={torch && focused ? 'on' : 'off'}
            style={StyleSheet.absoluteFill} device={device} isActive={focused} outputs={[photo]} resizeMode="cover"
            zoom={tall ? undefined : Math.min(ZOOM, device.maxZoom)} enableNativeTapToFocusGesture
            // VisionCamera sets the zoom a second time before the session has started, which CameraX rejects. The zoom is already applied as the initial zoom, so that one is noise.
            onError={(e) => { if (!e.message.includes('Camera is not active')) console.warn('Text camera', e); }}
          />
        )}
        {!tall && <View pointerEvents="none" style={st.box} accessibilityLabel="Put the date inside this box" />}
        {device?.hasTorch && (
          <View style={st.torch}>
            <IconButton icon={torch ? 'flashlight' : 'flashlight-off'} label={torch ? 'Turn torch off' : 'Turn torch on'} onPress={() => setTorch(!torch)} tint="#fff" />
          </View>
        )}
      </View>
      <Button label={busy ? 'Reading…' : label} icon="camera" onPress={capture} disabled={busy || !device} />
      {!!error && <Text style={s.error}>{error}</Text>}
    </CameraGate>
  );
}

/** Takes the user's own photo of a Product and hands it back as a small data URI. */
export function PhotoCamera({ onPhoto }: { onPhoto: (dataUri: string) => void }) {
  const focused = useIsFocused();
  const device = useCameraDevice('back');
  const photo = usePhotoOutput({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const capture = async () => {
    setBusy(true);
    setError('');
    try {
      const shot = await photo.capturePhoto({}, {});
      const full = await shot.saveToTemporaryFileAsync();
      shot.dispose();
      const uri = full.startsWith('file://') ? full : `file://${full}`;
      // ponytail: the photo is stored in the Product row itself (about 10 KB), so it syncs to the other phone with no file storage to run.
      // Move to Supabase Storage if photos ever need to be bigger than a tile.
      const small = await manipulateAsync(uri, [{ resize: { width: 240 } }], { compress: 0.6, format: SaveFormat.JPEG, base64: true });
      new File(uri).delete();
      new File(small.uri).delete();
      if (!small.base64) throw new Error('No image data');
      onPhoto(`data:image/jpeg;base64,${small.base64}`);
    } catch (e) {
      console.warn('Product photo', e);
      setError('Could not take that photo. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <CameraGate>
      <View style={st.frame}>
        {device && <Camera style={StyleSheet.absoluteFill} device={device} isActive={focused} outputs={[photo]} resizeMode="cover" enableNativeTapToFocusGesture />}
      </View>
      <Button label={busy ? 'Saving…' : 'Take photo'} icon="camera" onPress={capture} disabled={busy || !device} />
      {!!error && <Text style={s.error}>{error}</Text>}
    </CameraGate>
  );
}

/** The Product's tile with its photo buttons. With no photo the tile shows the guessed emoji. */
export function PhotoField({ name, category, imageUrl, onChange }: {
  name: string; category: string | null; imageUrl: string | null; onChange: (imageUrl: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <ProductTile name={name} category={category} imageUrl={imageUrl} size={72} />
      <View style={{ flex: 1, gap: space.sm }}>
        <Button label={imageUrl ? 'Change photo' : 'Add a photo'} icon="camera" kind="secondary" onPress={() => setOpen(true)} />
        {/* Only the user's own photo can be removed: an Open Food Facts picture would be gone for good. */}
        {imageUrl?.startsWith('data:') && <Button label="Remove photo" kind="secondary" onPress={() => onChange(null)} />}
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Photo of the product">
        {open && <PhotoCamera onPhoto={(uri) => { setOpen(false); onChange(uri); }} />}
      </Sheet>
    </View>
  );
}

const FRAME = 260;
const TALL = 420;
const ZOOM = 3; // date camera only. Tune on a real phone: higher reads smaller print but shakes more.
const BOX = { width: 0.8, height: 100 }; // share of the frame's width, and points

const st = StyleSheet.create({
  frame: { height: FRAME, borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.ink },
  box: { position: 'absolute', left: '10%', width: '80%', top: (FRAME - BOX.height) / 2, height: BOX.height, borderWidth: 2, borderColor: '#fff', borderRadius: radius.sm },
  torch: { position: 'absolute', top: space.sm, right: space.sm, backgroundColor: '#000', borderWidth: 2, borderColor: '#fff', borderRadius: radius.full },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
