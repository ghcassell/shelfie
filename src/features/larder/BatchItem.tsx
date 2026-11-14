import { router } from 'expo-router';
import { Alert, View } from 'react-native';
import type { Row } from '../../db/queries';
import { addShoppingEntry, addUsage } from '../../db/repositories';
import { formatAmount } from '../../domain/amount';
import { formatDay } from '../../domain/dates';
import { pillText, rowLabel, spokenStatus } from '../../domain/expiry';
import { Button, ListRow, ProductTile, StatusPill } from '../../ui/components';
import { edgeColor, space } from '../../ui/theme';

/** "Add to shopping list?" when the last Batch of a Product with no threshold finishes. */
export function offerShopping(result: 'prompt' | null, product: { id: string; name: string }) {
  if (result !== 'prompt') return;
  Alert.alert('Add to shopping list?', `That was the last of the ${product.name}.`, [
    { text: 'No', style: 'cancel' },
    { text: 'Add', onPress: () => addShoppingEntry(product.name, product.id) },
  ]);
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
      left={<ProductTile name={product.name} imageUrl={product.imageUrl} />}
      accessibilityLabel={rowLabel(product.name, amount, row.locationName, spokenStatus(urgency, date, today))}
      onPress={() => router.push(`/batch/${batch.id}`)}
      right={
        <View style={{ alignItems: 'flex-end', gap: space.xs }}>
          <StatusPill state={urgency} text={pill} />
          {urgency === 'expired' && (
            // One tap: logs the rest as wasted with reason Expired. Undo lives in the Product's history.
            <Button label="Wasted" kind="destructive" onPress={() => offerShopping(addUsage(batch, 'wasted', remaining, 'expired'), product)} />
          )}
        </View>
      }
    />
  );
}
