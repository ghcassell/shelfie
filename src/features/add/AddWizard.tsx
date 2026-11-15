import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLarder } from '../../db/queries';
import { addBatch, addLocation, addProduct, bumpPackCount, findProductByBarcode, updateProduct } from '../../db/repositories';
import { formatAmount } from '../../domain/amount';
import { guessUnit } from '../../domain/receipt';
import type { BaseUnit } from '../../domain/types';
import { Button, Chip, Field, IconButton, s, Sheet, WizardStep } from '../../ui/components';
import { color, space } from '../../ui/theme';
import { ensureNotificationPermission } from '../settings/digest';
import { BarcodeCamera, PhotoField } from './camera';
import { type DateChoice, DateEditor, NEEDS_DATE } from './DateEditor';
import { gtinFromScan, isShopCode } from '../../domain/off';
import { lookupBarcode } from './off';

type Step = 'scan' | 'details' | 'quantity' | 'location' | 'date';
const ORDER: Step[] = ['scan', 'details', 'quantity', 'location', 'date'];
const TITLES: Record<Step, string> = {
  scan: 'Scan the barcode', details: 'Product details', quantity: 'How many?', location: 'Where is it kept?', date: 'Expiry date',
};
const EMPTY = { name: '', brand: '', size: '', category: '', baseUnit: 'count' as BaseUnit, packAmount: '1', imageUrl: null as string | null };

export default function AddWizard() {
  const params = useLocalSearchParams<{ several?: string }>();
  const { locations } = useLarder();
  const [several, setSeveral] = useState(params.several === '1');
  const [step, setStep] = useState<Step>('scan');
  const [barcode, setBarcode] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [note, setNote] = useState('');
  const [looking, setLooking] = useState(false);
  const [typed, setTyped] = useState('');
  const [packs, setPacks] = useState(1);
  const [price, setPrice] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [newLocation, setNewLocation] = useState('');
  const [date, setDate] = useState<DateChoice>(NEEDS_DATE);
  const [last, setLast] = useState<{ batchId: string; productId: string; date: DateChoice } | null>(null);
  const [tally, setTally] = useState({ added: 0, needDate: 0, noDetails: 0 });
  const [quickCreated, setQuickCreated] = useState(false);
  const [summary, setSummary] = useState(false);

  const packAmount = Math.max(parseFloat(draft.packAmount.replace(',', '.')) || 1, 0.01);
  const location = locations.find((l) => l.id === locationId);
  // In "Add several", Location carries over, so a scan goes straight to the date.
  const afterProduct = (): Step => (several && location ? 'date' : 'quantity');
  const quick = several && !productId && !!barcode; // unknown barcode: name-only quick create

  const onScan = async (raw: string) => {
    if (looking) return;
    const code = gtinFromScan(raw);
    if (!code) return setNote('No product number in that code. Try the striped barcode, or enter the details by hand.');
    setBarcode(code);
    setNote('');
    const known = findProductByBarcode(code);
    if (known) {
      setProductId(known.id);
      setDraft({ ...EMPTY, ...known, brand: known.brand ?? '', size: known.size ?? '', category: known.category ?? '', packAmount: String(known.packAmount) });
      return setStep(afterProduct());
    }
    setLooking(true);
    const found = await lookupBarcode(code);
    setLooking(false);
    if (typeof found === 'object') {
      // Cache every hit: the Product is saved (and synced) straight away, keyed by barcode.
      setProductId(addProduct({ ...found, barcode: code }));
      setDraft({ ...EMPTY, ...found, brand: found.brand ?? '', size: found.size ?? '', category: found.category ?? '', packAmount: String(found.packAmount) });
      // A shop's own number may be another shop's product in Open Food Facts, so always show what was found.
      const shopCode = isShopCode(code);
      if (shopCode) setNote('This is a shop’s own barcode, and other shops reuse the same numbers. Check this is the right product.');
      return setStep(several && location && !shopCode ? 'date' : 'details');
    }
    setProductId(null);
    setDraft(EMPTY);
    setNote(found === 'offline' ? 'Could not look that up just now. Enter the details by hand.' : 'Not in Open Food Facts yet. Enter the details by hand.');
    setStep('details');
  };

  const saveDetails = () => {
    const fields = {
      name: draft.name.trim(), brand: draft.brand.trim() || null, size: draft.size.trim() || null, category: draft.category.trim() || null,
      baseUnit: draft.baseUnit, packAmount, imageUrl: draft.imageUrl,
    };
    if (productId) updateProduct(productId, fields);
    else {
      setProductId(addProduct({ ...fields, barcode }));
      setQuickCreated(quick);
    }
    setStep(afterProduct());
  };

  const save = (scanNext: boolean) => {
    if (!productId || !locationId) return;
    const sameAsLast = several && !!barcode && last?.productId === productId &&
      last.date.expiryDate === date.expiryDate && last.date.noExpiry === date.noExpiry;
    if (sameAsLast) bumpPackCount(last.batchId, packAmount, packs);
    else {
      const pence = Math.round(parseFloat(price.replace(',', '.')) * 100);
      const batchId = addBatch({
        productId, locationId, startingAmount: packs * packAmount, packCount: packs, ...date, pricePence: isFinite(pence) ? pence : null,
      });
      setLast({ batchId, productId, date });
    }
    if (date.expiryDate) ensureNotificationPermission();
    const next = {
      added: tally.added + (sameAsLast ? 0 : 1),
      needDate: tally.needDate + (!sameAsLast && !date.expiryDate && !date.noExpiry ? 1 : 0),
      noDetails: tally.noDetails + (quickCreated ? 1 : 0),
    };
    setTally(next);
    if (!scanNext) return next.added >= 2 ? setSummary(true) : router.back();
    // Location and Date kind carry over; quantity resets to 1; the date never carries.
    setSeveral(true);
    setBarcode(null); setProductId(null); setDraft(EMPTY); setQuickCreated(false); setNote(''); setTyped('');
    setPacks(1); setPrice('');
    setDate({ ...NEEDS_DATE, dateKind: date.dateKind });
    setStep('scan');
  };

  const exit = () => (tally.added >= 2 ? setSummary(true) : router.back());
  const back = () => {
    const i = ORDER.indexOf(step);
    if (i === 0) return exit();
    // Skip the details step on the way back when it was skipped on the way in.
    setStep(step === 'date' && several && location ? 'scan' : ORDER[i - 1]);
  };
  const set = (patch: Partial<typeof EMPTY>) => setDraft((d) => ({ ...d, ...patch }));

  const common = { step: ORDER.indexOf(step) + 1, of: ORDER.length, title: TITLES[step], onBack: back };

  return (
    <>
      {step === 'scan' && (
        <WizardStep {...common}>
          {several && location && <Chip icon="map-marker" label={`Adding to: ${location.name}`} onPress={() => setStep('location')} />}
          <BarcodeCamera onScan={onScan} />
          {looking && <Text style={s.muted}>Looking it up…</Text>}
          {!!note && <Text style={s.muted}>{note}</Text>}
          <Field label="Or type the barcode" value={typed} onChangeText={setTyped} keyboardType="number-pad" onSubmitEditing={() => typed && onScan(typed)} />
          <Button label="No barcode: enter by hand" kind="secondary" onPress={() => { setBarcode(null); setProductId(null); setDraft(EMPTY); setNote(''); setStep('details'); }} />
        </WizardStep>
      )}

      {step === 'details' && (
        <WizardStep {...common} onNext={saveDetails} nextDisabled={!draft.name.trim()}>
          {!!note && <Text style={s.muted}>{note}</Text>}
          {!!barcode && <Text style={s.muted}>Barcode {barcode}</Text>}
          <Field label="Name" value={draft.name} onChangeText={(name) => set(quick || !productId ? { name, ...unitFrom(name, draft) } : { name })} autoFocus={!productId} />
          {quick ? (
            <Text style={s.muted}>Just the name for now. Brand and size can be filled in later on the Product screen.</Text>
          ) : (
            <>
              <PhotoField name={draft.name} category={draft.category} imageUrl={draft.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />
              <Field label="Brand" value={draft.brand} onChangeText={(brand) => set({ brand })} />
              <Field label="Size on the pack (e.g. 400 g)" value={draft.size} onChangeText={(size) => set({ size, ...unitFrom(size, draft) })} />
              <Field label="Category" value={draft.category} onChangeText={(category) => set({ category })} />
              <Text style={s.label}>Counted in</Text>
              <View style={s.chipRow}>
                {(['count', 'g', 'ml'] as const).map((u) => (
                  <Chip key={u} label={u === 'count' ? 'Items' : u === 'g' ? 'Grams' : 'Millilitres'} selected={draft.baseUnit === u} onPress={() => set({ baseUnit: u })} />
                ))}
              </View>
              <Field label={draft.baseUnit === 'count' ? 'Items in one pack' : `Amount in one pack (${draft.baseUnit})`} value={draft.packAmount} onChangeText={(v) => set({ packAmount: v })} keyboardType="numeric" />
            </>
          )}
        </WizardStep>
      )}

      {step === 'quantity' && (
        <WizardStep {...common} onNext={() => setStep(several && location ? 'date' : 'location')}>
          <Text style={s.text}>{draft.name}</Text>
          <View style={s.qtyRow}>
            <IconButton icon="minus-circle-outline" label="One pack fewer" tint={color.primary} onPress={() => setPacks(Math.max(1, packs - 1))} />
            <Text style={[s.qtyInput, { textAlignVertical: 'center' }]} accessibilityLabel={`${packs} packs`}>{packs}</Text>
            <IconButton icon="plus-circle-outline" label="One pack more" tint={color.primary} onPress={() => setPacks(packs + 1)} />
          </View>
          <Text style={s.muted}>
            {packs} {packs === 1 ? 'pack' : 'packs'}{draft.baseUnit === 'count' && packAmount === 1 ? '' : ` = ${formatAmount(packs * packAmount, draft.baseUnit)}`}
          </Text>
          <Field label="Price paid for all of it (£), optional" value={price} onChangeText={setPrice} keyboardType="numeric" />
        </WizardStep>
      )}

      {step === 'location' && (
        <WizardStep {...common} onNext={() => setStep('date')} nextDisabled={!location}>
          <View style={s.chipRow}>
            {locations.map((l) => <Chip key={l.id} label={l.name} selected={l.id === locationId} onPress={() => setLocationId(l.id)} />)}
          </View>
          <Field label="New location" value={newLocation} onChangeText={setNewLocation} placeholder="Fridge, freezer, cupboard…" />
          <Button label="Add location" kind="secondary" disabled={!newLocation.trim()} onPress={() => { setLocationId(addLocation(newLocation)); setNewLocation(''); }} />
        </WizardStep>
      )}

      {step === 'date' && (
        <WizardStep {...common} onNext={() => save(false)} nextLabel="Save" onSaveNext={() => save(true)} nextDisabled={!productId || !location}>
          <Text style={s.text}>{draft.name}</Text>
          <View style={s.chipRow}>
            {location && <Chip icon="map-marker" label={`Adding to: ${location.name}`} onPress={() => setStep('location')} />}
            <Chip icon="package-variant" label={`${packs} ${packs === 1 ? 'pack' : 'packs'}`} onPress={() => setStep('quantity')} />
          </View>
          {/* key: a fresh editor (and camera) for every Batch */}
          <DateEditor key={tally.added} value={date} onChange={setDate} startInCamera={several} />
        </WizardStep>
      )}

      <Sheet visible={summary} onClose={() => router.back()} title="All added">
        <Text style={s.text}>
          Added {tally.added} Batches · {tally.needDate} need a date · {tally.noDetails} new Products with no details
        </Text>
        <View style={{ gap: space.sm }}>
          <Button label="Go to Needs attention" onPress={() => router.replace('/attention')} />
          <Button label="Done" kind="secondary" onPress={() => router.back()} />
        </View>
      </Sheet>
    </>
  );
}

/** Guess the Base unit from a size typed into the name or size field, unless the user already set one. */
function unitFrom(text: string, draft: typeof EMPTY): Partial<typeof EMPTY> {
  const g = guessUnit(text);
  if (!g.size || (draft.baseUnit !== 'count' && draft.packAmount !== '1')) return {};
  return { baseUnit: g.baseUnit, packAmount: String(g.packAmount) };
}
