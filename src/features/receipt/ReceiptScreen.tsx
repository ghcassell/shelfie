import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLarder } from '../../db/queries';
import { addBatch, addProduct, saveAlias } from '../../db/repositories';
import { db } from '../../db/client';
import { receiptAliases } from '../../db/schema';
import { TO_PUT_AWAY } from '../../domain/larder';
import { aliasKey, guessUnit, linesFromAi, matchProduct, parseReceipt, type ReceiptLine, rowsFromOcr, rowsFromText } from '../../domain/receipt';
import { improveReceipt } from '../../sync';
import { BottomBar, Button, Chip, Field, IconButton, ListRow, s, ScreenHeader, Sheet } from '../../ui/components';
import { deletePhoto, kv, photoBase64 } from '../../ui/platform';
import { color, space, TOUCH } from '../../ui/theme';
import { TextCamera } from '../add/camera';
import { addIgnored, getIgnored, removeIgnored } from './ignoreList';

type Mode = 'photo' | 'email';
const MODE_KEY = 'receiptMode'; // per-phone: whichever way this household usually gets receipts

interface Line extends ReceiptLine { key: number; original: string; productId: string | null; price: string; locationId?: string | null } // locationId undefined: goes wherever "Adding to" says; null: put away later

/** Capture, read on the phone, review one checklist, "Add ticked". No receipt record is kept. */
export default function ReceiptScreen() {
  const { products, locations } = useLarder();
  const [photo, setPhoto] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null); // null: put away later, the default after a big shop
  const [mode, setModeState] = useState<Mode>(() => (kv.getItemSync(MODE_KEY) === 'email' ? 'email' : 'photo'));
  const setMode = (m: Mode) => { kv.setItemSync(MODE_KEY, m); setModeState(m); };
  const [pasted, setPasted] = useState('');
  const [improved, setImproved] = useState(false);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [placing, setPlacing] = useState<number | null>(null); // the line whose own Location is being picked
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<{ count: number; later: number } | null>(null);
  const [ignored, setIgnored] = useState(getIgnored);
  const photoRef = useRef<string | null>(null);
  useEffect(() => { photoRef.current = photo; }, [photo]);
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
    if (!photo && !pasted.trim()) return;
    setBusy(true);
    setError('');
    try {
      // Photo downscaled before it leaves the phone; either is sent only on this explicit tap.
      const found = linesFromAi(await improveReceipt(photo ? { image: await photoBase64(photo, 1000) } : { text: pasted }), ignored);
      if (found.length === 0) setError(`The AI found no priced lines in this ${photo ? 'photo' : 'text'}. Is it a receipt?`);
      else { setLines(toLines(found)); setImproved(true); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not improve this receipt.');
    } finally {
      setBusy(false);
    }
  };

  const addTicked = () => {
    if (!lines) return;
    let count = 0, later = 0;
    const created = new Map<string, string>(); // the same new item twice on one receipt is one Product
    for (const l of lines.filter((x) => x.ticked && x.name.trim())) {
      const lineLocation = l.locationId === undefined ? locationId : l.locationId;
      const existing = products.find((p) => p.id === l.productId);
      const guess = guessUnit(l.name);
      const name = l.name.trim();
      const productId = existing?.id ?? created.get(name.toLowerCase())
        ?? addProduct({ name, baseUnit: guess.baseUnit, packAmount: guess.packAmount, size: guess.size, category: l.category ?? null });
      if (!existing) created.set(name.toLowerCase(), productId);
      saveAlias(l.original, productId); // the same receipt line maps automatically next time
      const pence = Math.round(parseFloat(l.price.replace(',', '.')) * 100);
      addBatch({
        productId, locationId: lineLocation, packCount: l.quantity, startingAmount: l.quantity * (existing?.packAmount ?? guess.packAmount),
        expiryDate: null, noExpiry: false, dateKind: 'best_before', pricePence: isFinite(pence) ? pence : null,
      });
      count++;
      if (!lineLocation) later++;
    }
    if (photo) deletePhoto(photo);
    setPhoto(null);
    setAdded({ count, later });
  };

  const choosingLine = lines?.find((l) => l.key === choosing);

  return (
    <View style={s.screen}>
      <ScreenHeader title="Add from a receipt" back />
      {!lines ? (
        <ScrollView contentContainerStyle={[s.body, { paddingBottom: space.xxl }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={s.chipRow}>
            <Chip big icon="camera-outline" label="Photo" selected={mode === 'photo'} onPress={() => setMode('photo')} />
            <Chip big icon="email-outline" label="Emailed receipt" selected={mode === 'email'} onPress={() => setMode('email')} />
          </View>
          {mode === 'photo' ? (
            <>
              <Text style={s.muted}>
                {Platform.OS === 'web'
                  ? 'Upload a photo of the receipt. Nothing is sent anywhere unless you choose "Improve with AI" on the next step.'
                  : 'Lay the receipt flat and fit it in the frame. It is read on this phone; nothing is sent anywhere unless you choose "Improve with AI".'}
              </Text>
              <TextCamera
                tall label="Read receipt"
                onText={({ lines: ocr }, path) => { setPhoto(path); setLines(toLines(parseReceipt(rowsFromOcr(ocr), ignored))); }}
              />
            </>
          ) : (
            <>
              <Text style={s.muted}>Copy the items from the receipt email and paste them below. It is read on this phone; nothing is sent anywhere unless you choose &quot;Improve with AI&quot;.</Text>
              <Field
                label="Pasted receipt" value={pasted} onChangeText={setPasted} multiline
                placeholder="Paste the receipt here" style={{ minHeight: 160, textAlignVertical: 'top' }}
              />
              <Button label="Read pasted text" icon="clipboard-text-outline" disabled={!pasted.trim()} onPress={() => setLines(toLines(parseReceipt(rowsFromText(pasted), ignored)))} />
            </>
          )}
        </ScrollView>
      ) : (
        <>
          <ScrollView contentContainerStyle={[s.body, { paddingBottom: space.xxl }]} keyboardShouldPersistTaps="handled">
            {lines.length === 0 && <Text style={s.muted}>{photo ? 'No lines with a price were found. Let the AI have a go, or retake the photo.' : 'No lines with a price were found in the pasted text. Let the AI have a go, or go back and check it includes the items.'}</Text>}
            {/* At the top, not under a long list: right after reading is when you know it needs help. */}
            <View style={{ gap: space.sm }}>
              <Button
                label={busy ? 'Asking…' : improved ? 'Improved with AI' : lines.length ? 'Not quite right? Improve with AI' : 'Find items with AI'}
                icon="auto-fix" kind={lines.length ? 'secondary' : 'primary'} onPress={improve} disabled={busy || improved}
              />
              <Text style={s.muted}>Sends this receipt {photo ? 'photo' : 'text'} to Google Gemini to read it. Needs a connection.</Text>
              {!!error && <Text style={s.error}>{error}</Text>}
            </View>

            {lines.length > 0 && (
              <>
                <Text style={s.label}>Adding to (tap an item’s location to change just that one)</Text>
                <View style={s.chipRow}>
                  <Chip warn label="Put away later" selected={locationId === null} onPress={() => setLocationId(null)} />
                  {locations.map((l) => <Chip key={l.id} label={l.name} selected={l.id === locationId} onPress={() => setLocationId(l.id)} />)}
                </View>
              </>
            )}
            {lines.map((l) => {
              const product = products.find((p) => p.id === l.productId);
              const place = l.locationId === undefined ? locationId : l.locationId;
              return (
                <View key={l.key} style={{ gap: space.sm, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.brand, opacity: l.ticked ? 1 : 0.55 }}>
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
                    <Chip icon="map-marker" warn={!place} label={locations.find((x) => x.id === place)?.name ?? 'Put away later'} selected={l.locationId !== undefined} onPress={() => setPlacing(l.key)} />
                    {/* One block, so the stepper never wraps apart. */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <IconButton icon="minus" ring label="One fewer" tint={color.primary} size={40} disabled={l.quantity <= 1} onPress={() => patch(l.key, { quantity: Math.max(1, l.quantity - 1) })} />
                      <Text style={[s.text, { minWidth: 20, textAlign: 'center' }]} accessibilityLabel={`Quantity ${l.quantity}`}>{l.quantity}</Text>
                      <IconButton icon="plus" ring label="One more" tint={color.primary} size={40} onPress={() => patch(l.key, { quantity: l.quantity + 1 })} />
                    </View>
                    <TextInput style={[s.input, { width: 88 }]} value={l.price} onChangeText={(price) => patch(l.key, { price })} keyboardType="numeric" placeholder="£" placeholderTextColor={color.placeholder} accessibilityLabel="Price in pounds" />
                    <Chip icon="eye-off-outline" label={ignored.includes(aliasKey(l.original)) ? 'Always ignored' : 'Always ignore'} selected={ignored.includes(aliasKey(l.original))} onPress={() => toggleIgnore(l.original)} />
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <BottomBar paddingBottom={space.lg}>
            <Button label={photo ? 'Retake' : 'Back'} kind="secondary" onPress={() => { if (photo) deletePhoto(photo); setPhoto(null); setLines(null); setImproved(false); setError(''); }} />
            <View style={{ flex: 1 }} />
            <Button label={`Add ticked (${lines.filter((l) => l.ticked).length})`} onPress={addTicked} disabled={!lines.some((l) => l.ticked)} />
          </BottomBar>
        </>
      )}

      <Sheet visible={choosing != null} onClose={() => setChoosing(null)} title={choosingLine ? `"${choosingLine.original}" is` : ''}>
        <ListRow title="A new Product" onPress={() => { patch(choosing!, choosingLine?.productId ? { productId: null, name: choosingLine.original } : { productId: null }); setChoosing(null); }} />
        {products.map((p) => (
          <ListRow key={p.id} title={p.name} subtitle={[p.brand, p.size].filter(Boolean).join(' · ')} onPress={() => { patch(choosing!, { productId: p.id, name: p.name }); setChoosing(null); }} />
        ))}
      </Sheet>

      <Sheet visible={placing != null} onClose={() => setPlacing(null)} title="Keep this one in">
        <ListRow title="Put away later" onPress={() => { patch(placing!, { locationId: null }); setPlacing(null); }} />
        {locations.map((x) => (
          <ListRow key={x.id} title={x.name} onPress={() => { patch(placing!, { locationId: x.id }); setPlacing(null); }} />
        ))}
      </Sheet>

      <Sheet visible={added != null} onClose={() => router.back()} title="Added">
        <Text style={s.text}>
          Added {added?.count} {added?.count === 1 ? 'Batch' : 'Batches'}{added?.later ? `, ${added.later} ${TO_PUT_AWAY.toLowerCase()}` : ''}. They need a date: scan each pack when you put it away.
        </Text>
        <Button label="Fill in dates" onPress={() => router.replace('/fill-dates')} />
        <Button label="Done" kind="secondary" onPress={() => router.back()} />
      </Sheet>
    </View>
  );
}
