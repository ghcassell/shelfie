import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLarder } from '../../db/queries';
import { addUsage, deleteBatch, openBatch, updateBatch, updateProduct } from '../../db/repositories';
import { formatAmount, packsRemaining } from '../../domain/amount';
import { formatDay } from '../../domain/dates';
import { pillText } from '../../domain/expiry';
import { WASTE_REASONS, type WasteReason } from '../../domain/types';
import { formatPence } from '../../domain/waste';
import Toast from 'react-native-toast-message';
import { Button, Chip, Field, ListRow, ProductTile, QuantityPicker, s, ScreenHeader, Section, Sheet, StatusPill } from '../../ui/components';
import { showDialog } from '../../ui/Dialog';
import { space } from '../../ui/theme';
import { type DateChoice, DateEditor } from '../add/DateEditor';
import { ensureNotificationPermission } from '../settings/digest';
import { offerShopping } from './BatchItem';

type Panel = 'waste' | 'open' | 'date' | 'move' | 'price' | null;

export default function BatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { all, locations, today } = useLarder();
  const row = all.find((r) => r.batch.id === id);
  const [amount, setAmount] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [within, setWithin] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState<DateChoice | null>(null);
  const [freezerNote, setFreezerNote] = useState(false);

  // Still loading, or deleted on the other phone.
  if (!row) return <View style={s.screen}><ScreenHeader title="" back /></View>;

  const { batch, product, remaining, urgency } = row;
  const unit = product.baseUnit;
  const picked = Math.min(amount ?? remaining, remaining);
  const packs = packsRemaining(batch, remaining);
  const dateLine = batch.noExpiry ? 'No expiry' : batch.expiryDate
    ? `${batch.dateKind === 'use_by' ? 'Use by' : 'Best before'} ${formatDay(batch.expiryDate)}` : 'Needs a date';

  const log = (kind: 'used' | 'wasted', reason: WasteReason | null = null) => {
    setPanel(null);
    setAmount(null);
    offerShopping(addUsage(batch, kind, picked, reason), product);
    if (picked >= remaining) router.back(); // Finished: hidden from the Larder, kept as history
  };

  const saveOpened = () => {
    const days = parseInt(within, 10);
    updateProduct(product.id, { openedShelfLifeDays: days > 0 ? days : null }); // remembered per Product
    openBatch(batch, picked);
    setPanel(null);
    setAmount(null);
  };

  const saveDate = () => {
    if (!date) return;
    updateBatch(batch.id, date);
    if (date.expiryDate) ensureNotificationPermission();
    setPanel(null);
    Toast.show({ type: 'success', text1: 'Date saved' });
  };

  const move = (locationId: string, name: string) => {
    updateBatch(batch.id, { locationId });
    // Moving to a freezer prompts for a new date; nothing is changed automatically.
    // ponytail: a Location is treated as a freezer if its name says so; add a flag on Location if that ever misfires.
    const freezer = /freez/i.test(name);
    setFreezerNote(freezer);
    if (freezer) { setDate(current()); setPanel('date'); } else { setPanel(null); Toast.show({ type: 'success', text1: `Moved to ${name}` }); }
  };

  const current = (): DateChoice => ({ expiryDate: batch.expiryDate, noExpiry: batch.noExpiry, dateKind: batch.dateKind });

  return (
    <View style={s.screen}>
      <ScreenHeader title={product.name} back />
      <ScrollView contentContainerStyle={s.body}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <ProductTile name={product.name} category={product.category} imageUrl={product.imageUrl} size={72} />
          <View style={{ flex: 1, gap: space.xs }}>
            <Text style={s.text}>
              {formatAmount(remaining, unit)} left{batch.packCount > 1 ? ` (${packs} of ${batch.packCount} packs)` : ''}
            </Text>
            <Text style={s.muted}>{[product.brand, product.size, row.locationName].filter(Boolean).join(' · ')}</Text>
            <Text style={s.muted}>{dateLine}</Text>
            {batch.openedOn && (
              <Text style={s.muted}>
                Opened {formatDay(batch.openedOn)}{product.openedShelfLifeDays != null ? `, use within ${product.openedShelfLifeDays} days` : ''}
              </Text>
            )}
            {batch.pricePence != null && <Text style={s.muted}>Paid {formatPence(batch.pricePence)}</Text>}
            <StatusPill state={urgency} text={pillText(urgency, row.date, today)} />
          </View>
        </View>

        {remaining > 0 && (
          <Section title="Use some or all">
            <QuantityPicker value={picked} onChange={setAmount} unit={unit} max={remaining} />
            <View style={s.chipRow}>
              <Button label="Use" icon="silverware-fork-knife" onPress={() => log('used')} disabled={picked <= 0} style={{ flex: 1 }} />
              <Button label="Throw away" icon="trash-can-outline" kind="destructive" onPress={() => setPanel('waste')} disabled={picked <= 0} style={{ flex: 1 }} />
            </View>
            {batch.openedOn
              ? <Button label="Mark as not opened" kind="secondary" onPress={() => updateBatch(batch.id, { openedOn: null })} />
              : <Button
                  label={picked >= remaining ? 'Mark as opened' : `Open ${formatAmount(picked, unit)} of it`} kind="secondary" disabled={picked <= 0}
                  onPress={() => { setWithin(product.openedShelfLifeDays?.toString() ?? ''); setPanel('open'); }}
                />}
          </Section>
        )}

        <Section title="This Batch">
          <ListRow title="Change the date" subtitle={dateLine} onPress={() => { setFreezerNote(false); setDate(current()); setPanel('date'); }} />
          <ListRow title="Move" subtitle={row.locationName} onPress={() => setPanel('move')} />
          <ListRow title="Price" subtitle={batch.pricePence == null ? 'Unknown' : formatPence(batch.pricePence)} onPress={() => { setPrice(batch.pricePence == null ? '' : (batch.pricePence / 100).toFixed(2)); setPanel('price'); }} />
          <ListRow title="Product details and history" subtitle="Name, size, running-low level, what was used" onPress={() => router.push(`/product/${product.id}`)} />
        </Section>

        <Button
          label="Delete (added by mistake)" kind="destructive"
          onPress={() => showDialog({
            title: 'Delete this Batch?',
            message: 'Only for something added by mistake. To record it as eaten or thrown away, use the buttons above.',
            buttons: [
              { label: 'Cancel' },
              { label: 'Delete', variant: 'destructive', onPress: () => { deleteBatch(batch.id); router.back(); } },
            ],
          })}
        />
      </ScrollView>

      <Sheet visible={panel === 'waste'} onClose={() => setPanel(null)} title={`Throw away ${formatAmount(picked, unit)}. Why?`}>
        {WASTE_REASONS.map((r) => (
          <Button key={r.value} label={r.label} kind={r.value === 'expired' ? 'primary' : 'secondary'} onPress={() => log('wasted', r.value)} />
        ))}
        <Button label="Skip" kind="secondary" onPress={() => log('wasted', null)} />
      </Sheet>

      <Sheet visible={panel === 'open'} onClose={() => setPanel(null)} title="Opened today">
        <Field label="Use within how many days? (optional)" value={within} onChangeText={setWithin} keyboardType="number-pad" />
        <Text style={s.muted}>Remembered for every {product.name}.</Text>
        <Button label="Save" onPress={saveOpened} />
      </Sheet>

      <Sheet visible={panel === 'date'} onClose={() => setPanel(null)} title={freezerNote ? 'Moved to the freezer. New date?' : 'Change the date'}>
        {date && <DateEditor value={date} onChange={setDate} />}
        <Button label="Save date" onPress={saveDate} />
      </Sheet>

      <Sheet visible={panel === 'move'} onClose={() => setPanel(null)} title="Move to">
        <View style={s.chipRow}>
          {locations.map((l) => <Chip key={l.id} label={l.name} selected={l.id === batch.locationId} onPress={() => move(l.id, l.name)} />)}
        </View>
      </Sheet>

      <Sheet visible={panel === 'price'} onClose={() => setPanel(null)} title="Price paid">
        <Field label="Price for the whole Batch (£). Leave blank if unknown." value={price} onChangeText={setPrice} keyboardType="numeric" />
        <Button
          label="Save" onPress={() => {
            const pence = Math.round(parseFloat(price.replace(',', '.')) * 100);
            updateBatch(batch.id, { pricePence: isFinite(pence) ? pence : null });
            setPanel(null);
            Toast.show({ type: 'success', text1: 'Price saved' });
          }}
        />
      </Sheet>
    </View>
  );
}
