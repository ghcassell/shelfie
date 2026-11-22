import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useRef } from 'react';
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
import { color, edgeColor, space } from '../../ui/theme';

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

/**
 * One Batch in the Larder or Needs attention list. Long-press starts multi-select (for bulk move); while
 * selecting, a tap toggles instead of opening. `onToggle` takes the id rather than being pre-bound per row,
 * and the component is memoized, so a tap only re-renders the row that actually changed, not the whole visible list.
 */
export const BatchItem = memo(function BatchItem({ row, today, selectMode, selected, onToggle }: {
  row: Row; today: string; selectMode?: boolean; selected?: boolean; onToggle?: (id: string) => void;
}) {
  const { batch, product, remaining, urgency, date } = row;
  const amount = formatAmount(remaining, product.baseUnit);
  const pill = pillText(urgency, date, today);
  const subtitle = [amount, row.locationName, urgency === 'fine' && date ? formatDay(date) : null].filter(Boolean).join(' · ');
  // RN fires onPress right after onLongPress on the same touch, which would immediately undo the toggle
  // that started the selection. This flag swallows that one trailing onPress.
  const justLongPressed = useRef(false);
  return (
    <ListRow
      title={product.name}
      subtitle={subtitle}
      edge={selected ? color.brand : edgeColor(urgency)}
      left={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {selectMode && (
            <MaterialCommunityIcons name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={22} color={selected ? color.brand : color.inkMuted} />
          )}
          <ProductTile name={product.name} category={product.category} imageUrl={product.imageUrl} />
        </View>
      }
      accessibilityLabel={rowLabel(product.name, amount, row.locationName, spokenStatus(urgency, date, today))}
      onPress={() => {
        if (justLongPressed.current) { justLongPressed.current = false; return; }
        if (selectMode) onToggle?.(batch.id); else router.push(`/batch/${batch.id}`);
      }}
      onLongPress={selectMode ? undefined : () => { justLongPressed.current = true; onToggle?.(batch.id); }}
      right={
        <View style={{ alignItems: 'flex-end', gap: space.xs }}>
          <StatusPill state={urgency} text={pill} />
          {!selectMode && urgency === 'expired' && (
            // One tap: logs the rest as wasted with reason Expired. Undo is on the toast, and in the Product's history.
            <Button label="Wasted" kind="destructive" onPress={() => logUsage(row, 'wasted', remaining, 'expired')} />
          )}
        </View>
      }
    />
  );
});
