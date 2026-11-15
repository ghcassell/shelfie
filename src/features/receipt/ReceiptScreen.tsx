import { MaterialCommunityIcons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLarder } from '../../db/queries';
import { addBatch, addLocation, addProduct, saveAlias } from '../../db/repositories';
import { db } from '../../db/client';
import { receiptAliases } from '../../db/schema';
import { aliasKey, guessUnit, linesFromAi, matchProduct, parseReceipt, type ReceiptLine, rowsFromOcr } from '../../domain/receipt';
import { improveReceipt } from '../../sync';
import { BottomBar, Button, Chip, Field, IconButton, ListRow, s, ScreenHeader, Sheet } from '../../ui/components';
import { color, space, TOUCH } from '../../ui/theme';
import { TextCamera } from '../add/camera';
import { deletePhoto } from '../add/DateEditor';
import { addIgnored, getIgnored, removeIgnored } from './ignoreList';

interface Line extends ReceiptLine { key: number; original: string; productId: string | null; price: string }

/** Capture, read on the phone, review one checklist, "Add ticked". No receipt record is kept. */
export default function ReceiptScreen() {
  const { products, locations } = useLarder();
  const [photo, setPhoto] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [newLocation, setNewLocation] = useState('');
  const [choosing, setChoosing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<number | null>(null);
  const [ignored, setIgnored] = useState(getIgnored);
  const photoRef = useRef<string | null>(null);
  photoRef.current = photo;
  // The photo never outlives this screen.
  useEffect(() => () => { if (photoRef.current) deletePhoto(photoRef.current); }, []);

  const toLines = (parsed: ReceiptLine[]): Line[] => {
    const aliases = db.select().from(receiptAliases).all().filter((a) => !a.deletedAt);
    return parsed.map((l, key) => {
      const productId = matchProduct(l.name, products, aliases);
      return {
        ...l, key, original: l.name, productId,
        name: products.find((p) => p.id === productId)?.name ?? l.name, // show the linked Product, not the shop's abbreviation
        price: l.pricePence == null ? '' : (l.pricePence / 100).toFixed(2),
      };
    });
  };
  const patch = (key: number, change: Partial<Line>) => setLines((ls) => ls!.map((l) => (l.key === key ? { ...l, ...change } : l)));

  /** "Always ignore" a line like PRICE REDUCTION: remembered for future receipts; tap again to undo. */
  const toggleIgnore = (original: string) => {
    const key = aliasKey(original);
    const was = ignored.includes(key);
    setIgnored(was ? removeIgnored(key) : addIgnored(key));
    setLines((ls) => ls!.map((l) => (aliasKey(l.original) === key ? { ...l, ticked: was } : l)));
  };

  const improve = async () => {
    if (!photo) return;
    setBusy(true);
    setError('');
    try {
      // Downscaled before it leaves the phone; sent only on this explicit tap.
      const small = await manipulateAsync(photo.startsWith('file://') ? photo : `file://${photo}`, [{ resize: { width: 1000 } }], { compress: 0.7, format: SaveFormat.JPEG });
      const file = new File(small.uri);
      const base64 = await file.base64();
      file.delete();
      setLines(toLines(linesFromAi(await improveReceipt(base64), ignored)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not improve this receipt.');
    } finally {
      setBusy(false);
    }
  };

  const addTicked = () => {
    if (!lines || !locationId) return;
    let count = 0;
    const created = new Map<string, string>(); // the same new item twice on one receipt is one Product
    for (const l of lines.filter((x) => x.ticked && x.name.trim())) {
      const existing = products.find((p) => p.id === l.productId);
      const guess = guessUnit(l.name);
      const name = l.name.trim();
      const productId = existing?.id ?? created.get(name.toLowerCase())
        ?? addProduct({ name, baseUnit: guess.baseUnit, packAmount: guess.packAmount, size: guess.size });
      if (!existing) created.set(name.toLowerCase(), productId);
      saveAlias(l.original, productId); // the same receipt line maps automatically next time
      const pence = Math.round(parseFloat(l.price.replace(',', '.')) * 100);
      addBatch({
        productId, locationId, packCount: l.quantity, startingAmount: l.quantity * (existing?.packAmount ?? guess.packAmount),
        expiryDate: null, noExpiry: false, dateKind: 'best_before', pricePence: isFinite(pence) ? pence : null,
      });
      count++;
    }
    if (photo) deletePhoto(photo);
    setPhoto(null);
    setAdded(count);
  };

  const choosingLine = lines?.find((l) => l.key === choosing);

  return (
    <View style={s.screen}>
      <ScreenHeader title="Scan a receipt" back />
      {!lines ? (
        <View style={s.body}>
          <Text style={s.muted}>Lay the receipt flat and fit it in the frame. It is read on this phone; nothing is sent anywhere.</Text>
          <TextCamera
            tall label="Read receipt"
            onText={({ lines: ocr }, path) => { setPhoto(path); setLines(toLines(parseReceipt(rowsFromOcr(ocr), ignored))); }}
          />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={[s.body, { paddingBottom: space.xxl }]} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>Adding to</Text>
            <View style={s.chipRow}>
              {locations.map((l) => <Chip key={l.id} label={l.name} selected={l.id === locationId} onPress={() => setLocationId(l.id)} />)}
            </View>
            {locations.length === 0 && (
              <>
                <Field label="New location" value={newLocation} onChangeText={setNewLocation} placeholder="Fridge, freezer, cupboard…" />
                <Button label="Add location" kind="secondary" disabled={!newLocation.trim()} onPress={() => { setLocationId(addLocation(newLocation)); setNewLocation(''); }} />
              </>
            )}

            {lines.length === 0 && <Text style={s.muted}>No lines with a price were found. Try "Improve with AI", or go back and retake the photo.</Text>}
            {lines.map((l) => {
              const product = products.find((p) => p.id === l.productId);
              return (
                <View key={l.key} style={{ gap: space.sm, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.line, opacity: l.ticked ? 1 : 0.55 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Pressable
                      onPress={() => patch(l.key, { ticked: !l.ticked })} accessibilityRole="checkbox" accessibilityState={{ checked: l.ticked }}
                      accessibilityLabel={`Add ${l.name}`} style={{ minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <MaterialCommunityIcons name={l.ticked ? 'checkbox-marked' : 'checkbox-blank-outline'} size={26} color={color.primary} />
                    </Pressable>
                    <TextInput style={[s.input, { flex: 1 }]} value={l.name} onChangeText={(name) => patch(l.key, { name })} accessibilityLabel="Name" />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', paddingLeft: TOUCH + space.sm }}>
                    <Chip icon={product ? 'link-variant' : 'plus'} label={product ? product.name : 'New Product'} onPress={() => setChoosing(l.key)} />
                    <IconButton icon="minus-circle-outline" label="One fewer" tint={color.primary} onPress={() => patch(l.key, { quantity: Math.max(1, l.quantity - 1) })} />
                    <Text style={s.text} accessibilityLabel={`Quantity ${l.quantity}`}>{l.quantity}</Text>
                    <IconButton icon="plus-circle-outline" label="One more" tint={color.primary} onPress={() => patch(l.key, { quantity: l.quantity + 1 })} />
                    <TextInput style={[s.input, { width: 88 }]} value={l.price} onChangeText={(price) => patch(l.key, { price })} keyboardType="numeric" placeholder="£" placeholderTextColor={color.placeholder} accessibilityLabel="Price in pounds" />
                    <Chip icon="eye-off-outline" label={ignored.includes(aliasKey(l.original)) ? 'Always ignored' : 'Always ignore'} selected={ignored.includes(aliasKey(l.original))} onPress={() => toggleIgnore(l.original)} />
                  </View>
                </View>
              );
            })}
            {!!error && <Text style={s.error}>{error}</Text>}
            {photo && (
              <>
                <Button label={busy ? 'Asking…' : 'Improve with AI'} icon="auto-fix" kind="secondary" onPress={improve} disabled={busy} />
                <Text style={s.muted}>Sends this receipt photo to Claude to read it better. Needs a connection.</Text>
              </>
            )}
          </ScrollView>
          <BottomBar paddingBottom={space.lg}>
            <Button label="Retake" kind="secondary" onPress={() => { if (photo) deletePhoto(photo); setPhoto(null); setLines(null); }} />
            <View style={{ flex: 1 }} />
            <Button label={`Add ticked (${lines.filter((l) => l.ticked).length})`} onPress={addTicked} disabled={!locationId || !lines.some((l) => l.ticked)} />
          </BottomBar>
        </>
      )}

      <Sheet visible={choosing != null} onClose={() => setChoosing(null)} title={choosingLine ? `"${choosingLine.original}" is` : ''}>
        <ListRow title="A new Product" onPress={() => { patch(choosing!, choosingLine?.productId ? { productId: null, name: choosingLine.original } : { productId: null }); setChoosing(null); }} />
        {products.map((p) => (
          <ListRow key={p.id} title={p.name} subtitle={[p.brand, p.size].filter(Boolean).join(' · ')} onPress={() => { patch(choosing!, { productId: p.id, name: p.name }); setChoosing(null); }} />
        ))}
      </Sheet>

      <Sheet visible={added != null} onClose={() => router.back()} title="Added">
        <Text style={s.text}>Added {added} {added === 1 ? 'Batch' : 'Batches'}. They need a date: scan each pack when you put it away.</Text>
        <Button label="Fill in dates" onPress={() => router.replace('/fill-dates')} />
        <Button label="Done" kind="secondary" onPress={() => router.back()} />
      </Sheet>
    </View>
  );
}
