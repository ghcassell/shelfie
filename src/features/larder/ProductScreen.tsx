import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useLarder } from '../../db/queries';
import { undoEntry, updateProduct } from '../../db/repositories';
import { canUndo, formatAmount } from '../../domain/amount';
import { formatDay, toDay } from '../../domain/dates';
import { WASTE_REASONS } from '../../domain/types';
import { Button, Chip, Field, Form, ListRow, s, ScreenHeader, Section } from '../../ui/components';
import { PhotoField } from '../add/camera';

const num = (text: string) => { const n = parseFloat(text.replace(',', '.')); return isFinite(n) && n > 0 ? n : null; };
const KIND = { used: 'Used', wasted: 'Thrown away', corrected: 'Corrected', split: 'Opened part' } as const;

/** Product details, per-Product overrides, and the history of its Usage entries (with undo). */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { products, all, entries, warningDays } = useLarder();
  const product = products.find((p) => p.id === id);
  const [form, setForm] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (product && !form) {
      setForm({
        name: product.name, brand: product.brand ?? '', size: product.size ?? '', category: product.category ?? '',
        packAmount: String(product.packAmount), opened: product.openedShelfLifeDays?.toString() ?? '',
        warning: product.warningDays?.toString() ?? '', low: product.lowThreshold?.toString() ?? '',
      });
    }
  }, [product, form]);
  if (!product || !form) return <View style={s.screen}><ScreenHeader title="" back /></View>;

  const set = (key: string) => (value: string) => setForm({ ...form, [key]: value });
  const unit = product.baseUnit;
  const save = () => updateProduct(product.id, {
    name: form.name.trim() || product.name, brand: form.brand.trim() || null, size: form.size.trim() || null, category: form.category.trim() || null,
    packAmount: num(form.packAmount) ?? product.packAmount,
    openedShelfLifeDays: num(form.opened), warningDays: num(form.warning), lowThreshold: num(form.low),
  });

  const batchIds = new Set(all.filter((r) => r.product.id === product.id).map((r) => r.batch.id));
  const history = entries.filter((e) => batchIds.has(e.batchId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <View style={s.screen}>
      <ScreenHeader title={product.name} back />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Form>
        <Section title="Details">
          <PhotoField name={form.name} category={form.category} imageUrl={product.imageUrl} onChange={(imageUrl) => updateProduct(product.id, { imageUrl })} />
          <Field label="Name" value={form.name} onChangeText={set('name')} />
          <Field label="Brand" value={form.brand} onChangeText={set('brand')} />
          <Field label="Size on the pack" value={form.size} onChangeText={set('size')} />
          <Field label="Category" value={form.category} onChangeText={set('category')} />
          <Field label={unit === 'count' ? 'Items in one pack' : `Amount in one pack (${unit})`} value={form.packAmount} onChangeText={set('packAmount')} keyboardType="numeric" />
          {product.barcode && <Text style={s.muted}>Barcode {product.barcode}</Text>}
          {product.barcode && <Button label="View on Open Food Facts" kind="secondary" onPress={() => Linking.openURL(`https://world.openfoodfacts.org/product/${encodeURIComponent(product.barcode!)}`)} />}
        </Section>

        <Section title="Dates">
          <Field label="Once opened, use within (days)" value={form.opened} onChangeText={set('opened')} keyboardType="number-pad" />
          <Field label={`Warn this many days before (household default ${warningDays})`} value={form.warning} onChangeText={set('warning')} keyboardType="number-pad" />
        </Section>

        <Section title="Running low">
          <Field label="Add to the shopping list when stock falls to" value={form.low} onChangeText={set('low')} keyboardType="numeric" placeholder="Leave blank for never" />
          <View style={s.chipRow}>
            <Chip label={unit === 'count' ? 'Items' : unit === 'g' ? 'Grams' : 'Millilitres'} selected={product.lowThresholdUnit === 'base'} onPress={() => updateProduct(product.id, { lowThresholdUnit: 'base' })} />
            <Chip label="Packs" selected={product.lowThresholdUnit === 'packs'} onPress={() => updateProduct(product.id, { lowThresholdUnit: 'packs' })} />
          </View>
        </Section>
        </Form>

        <Button label="Save" onPress={save} />

        <Section title="History">
          {history.length === 0 && <Text style={s.muted}>Nothing used yet.</Text>}
          {history.map((e) => {
            const reason = WASTE_REASONS.find((r) => r.value === e.wasteReason)?.label;
            const undone = e.kind !== 'corrected' && entries.some((x) => x.reversesEntryId === e.id);
            const title = e.reversesEntryId ? 'Undo' : `${KIND[e.kind]} ${formatAmount(Math.abs(e.amount), unit)}`;
            return (
              <ListRow
                key={e.id}
                title={title + (undone ? ' (undone)' : '')}
                subtitle={[formatDay(toDay(e.createdAt)), reason].filter(Boolean).join(' · ')}
                right={canUndo(e, entries) && e.kind !== 'corrected'
                  ? <Button label="Undo" kind="secondary" onPress={() => undoEntry(e.id)} /> : undefined}
              />
            );
          })}
        </Section>
      </ScrollView>
    </View>
  );
}
