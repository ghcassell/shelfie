import { router } from 'expo-router';
import { View } from 'react-native';
import type { Row } from '../../db/queries';
import Toast from 'react-native-toast-message';
import { addShoppingEntry, addUsage, undoEntry } from '../../db/repositories';
import type { WasteReason } from '../../domain/types';
import { formatAmount } from '../../domain/amount';
import { formatDay } from '../../domain/dates';
import { pillText, rowLabel, spokenStatus } from '../../domain/expiry';
import { Button, ListRow, ProductTile, StatusPill } from '../../ui/components';
import { showDialog } from '../../ui/Dialog';
import { edgeColor, space } from '../../ui/theme';

/** "Add to shopping list?" when the last Batch of a Product with no threshold finishes. */
export function offerShopping(result: 'prompt' | null, product: { id: string; name: string }) {
  if (result !== 'prompt') return;
  showDialog({
    title: 'Add to shopping list?',
    message: `That was the last of the ${product.name}.`,
    buttons: [
      { label: 'No' },
      { label: 'Add', variant: 'primary', onPress: () => addShoppingEntry(product.name, product.id) },
    ],
  });
}

/** Logs a use or a waste, with Undo on the toast (a mis-tap is one tap to fix), then applies the shopping list rules. */
export function logUsage(row: Pick<Row, 'batch' | 'product'>, kind: 'used' | 'wasted', amount: number, reason: WasteReason | null = null) {
  const { entryId, shopping } = addUsage(row.batch, kind, amount, reason);
  // "Throw away" closes its waste-reason Sheet right here: a Sheet is a native Modal, which on Android always
  // paints above a plain view (the toast) regardless of mount order, so a toast shown mid-close sits underneath
  // it and Undo is untappable until the close animation (220ms, see Sheet in ui/components.tsx) finishes.
  setTimeout(() => Toast.show({
    type: 'success', text1: `${kind === 'used' ? 'Used' : 'Thrown away'}: ${row.product.name}`, text2: formatAmount(amount, row.product.baseUnit),
    visibilityTime: 6000, props: { onUndo: () => undoEntry(entryId) },
  }), 250);
  offerShopping(shopping, row.product);
}

/** One Batch in the Larder or Needs attention list. */
export function BatchItem({ row, today }: { row: Row; today: string }) {
  const { batch, product, remaining, urgency, date } = row;
  const amount = formatAmount(remaining, product.baseUnit);
  const pill = pillText(urgency, date, today);
  const subtitle = [amount, row.locationName, urgency === 'fine' && date ? formatDay(date) : null].filter(Boolean).join(' · ');
  return (
    <ListRow
      title={product.name}
      subtitle={subtitle}
      edge={edgeColor(urgency)}
      left={<ProductTile name={product.name} category={product.category} imageUrl={product.imageUrl} />}
      accessibilityLabel={rowLabel(product.name, amount, row.locationName, spokenStatus(urgency, date, today))}
      onPress={() => router.push(`/batch/${batch.id}`)}
      right={
        <View style={{ alignItems: 'flex-end', gap: space.xs }}>
          <StatusPill state={urgency} text={pill} />
          {urgency === 'expired' && (
            // One tap: logs the rest as wasted with reason Expired. Undo is on the toast, and in the Product's history.
            <Button label="Wasted" kind="destructive" onPress={() => logUsage(row, 'wasted', remaining, 'expired')} />
          )}
        </View>
      }
    />
  );
}
