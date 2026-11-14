import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLarder } from '../../db/queries';
import { updateBatch } from '../../db/repositories';
import { formatAmount } from '../../domain/amount';
import { Button, EmptyState, ProductTile, s, ScreenHeader } from '../../ui/components';
import { space } from '../../ui/theme';
import { ensureNotificationPermission } from '../settings/digest';
import { BarcodeCamera } from './camera';
import { type DateChoice, DateEditor, NEEDS_DATE } from './DateEditor';

/** Walks through Batches that need a date. Scanning a pack's barcode jumps to its Batch. */
export default function FillDatesScreen() {
  const { larder } = useLarder();
  const undated = larder.filter((r) => r.urgency === 'needs_date');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [date, setDate] = useState<DateChoice>(NEEDS_DATE);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState('');

  const index = Math.max(0, undated.findIndex((r) => r.batch.id === currentId));
  const row = undated[index];
  const goTo = (id: string | null) => { setCurrentId(id); setDate({ ...NEEDS_DATE, dateKind: date.dateKind }); setNote(''); };
  const next = () => goTo(undated[(index + 1) % undated.length]?.batch.id ?? null);

  if (!row) {
    return (
      <View style={s.screen}>
        <ScreenHeader title="Fill in dates" back />
        <EmptyState icon="check-circle-outline" text="Every Batch has a date." actionLabel="Done" onAction={() => router.back()} />
      </View>
    );
  }

  const save = () => {
    const after = undated[index + 1]?.batch.id ?? null; // this Batch drops out of the list once dated
    updateBatch(row.batch.id, date);
    if (date.expiryDate) ensureNotificationPermission();
    goTo(after);
  };

  return (
    <View style={s.screen}>
      <ScreenHeader title="Fill in dates" back />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.muted}>{index + 1} of {undated.length} without a date</Text>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <ProductTile name={row.product.name} imageUrl={row.product.imageUrl} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={[s.text, { fontWeight: '600' }]}>{row.product.name}</Text>
            <Text style={s.muted}>{formatAmount(row.remaining, row.product.baseUnit)} · {row.locationName}</Text>
          </View>
        </View>

        {scanning ? (
          <>
            <BarcodeCamera
              onScan={(code) => {
                const hit = undated.find((r) => r.product.barcode === code);
                setScanning(false);
                if (hit) goTo(hit.batch.id);
                else setNote('No undated Batch for that barcode.');
              }}
            />
            <Button label="Cancel" kind="secondary" onPress={() => setScanning(false)} />
          </>
        ) : (
          <>
            <Button label="Scan a pack to jump to it" icon="barcode-scan" kind="secondary" onPress={() => setScanning(true)} />
            {!!note && <Text style={s.muted}>{note}</Text>}
            <DateEditor key={row.batch.id} value={date} onChange={setDate} />
            <View style={s.chipRow}>
              <Button label="Save date" onPress={save} disabled={!date.expiryDate && !date.noExpiry} style={{ flex: 1 }} />
              <Button label="Next" kind="secondary" onPress={next} style={{ flex: 1 }} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
