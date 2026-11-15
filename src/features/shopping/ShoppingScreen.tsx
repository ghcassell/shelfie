import { MaterialCommunityIcons } from '@expo/vector-icons';
import { isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Share, TextInput, View } from 'react-native';
import { db } from '../../db/client';
import { useLarder } from '../../db/queries';
import { addShoppingEntry, clearTicked, deleteShoppingEntry, setTicked } from '../../db/repositories';
import { members, shoppingEntries } from '../../db/schema';
import { sync, useSyncStatus } from '../../sync';
import { Button, Chip, EmptyState, IconButton, ListRow, s, ScreenHeader } from '../../ui/components';
import { color, space, TOUCH } from '../../ui/theme';

export default function ShoppingScreen() {
  const entries = useLiveQuery(db.select().from(shoppingEntries).where(isNull(shoppingEntries.deletedAt))).data;
  const people = useLiveQuery(db.select().from(members)).data;
  const { products } = useLarder();
  const { status } = useSyncStatus();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');

  const sorted = [...entries].sort((a, b) => Number(a.ticked) - Number(b.ticked) || a.name.localeCompare(b.name));
  const q = name.trim().toLowerCase();
  const suggestions = q.length < 2 ? [] : products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4);
  const add = (productName = name, productId: string | null = null) => {
    if (!productName.trim()) return;
    addShoppingEntry(productName, productId, quantity.trim() || null);
    setName('');
    setQuantity('');
  };
  const who = (addedBy: string) => (addedBy === 'auto' ? 'Running low' : people.find((m) => m.id === addedBy)?.displayName);
  const share = () => Share.share({
    message: sorted.filter((e) => !e.ticked).map((e) => `- ${e.name}${e.quantity ? ` (${e.quantity})` : ''}`).join('\n'),
  });

  return (
    <View style={s.screen}>
      <ScreenHeader
        title="Shopping"
        right={entries.some((e) => !e.ticked) ? <IconButton icon="share-variant" label="Share the list" onPress={share} /> : undefined}
      >
      <View style={{ paddingHorizontal: space.screen, gap: space.sm }}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <TextInput style={[s.input, { flex: 2 }]} placeholder="Add something" placeholderTextColor={color.placeholder} value={name} onChangeText={setName} onSubmitEditing={() => add()} accessibilityLabel="Name" returnKeyType="done" />
          <TextInput style={[s.input, { flex: 1 }]} placeholder="2 tins" placeholderTextColor={color.placeholder} value={quantity} onChangeText={setQuantity} onSubmitEditing={() => add()} accessibilityLabel="Quantity, optional" />
          <IconButton icon="plus-circle" label="Add to the list" tint={color.primary} size={40} disabled={!name.trim()} onPress={() => add()} />
        </View>
        {suggestions.length > 0 && (
          <View style={s.chipRow}>
            {suggestions.map((p) => <Chip key={p.id} icon="link-variant" label={p.name} onPress={() => add(p.name, p.id)} />)}
          </View>
        )}
      </View>
      </ScreenHeader>
      <FlatList
        data={sorted}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={status === 'syncing'} onRefresh={sync} />}
        ListEmptyComponent={<EmptyState icon="cart-outline" text="Nothing to buy." />}
        renderItem={({ item }) => (
          <ListRow
            title={item.name + (item.quantity ? ` (${item.quantity})` : '')}
            subtitle={[item.ticked ? 'In the basket' : null, who(item.addedBy)].filter(Boolean).join(' · ')}
            left={
              <Pressable
                onPress={() => setTicked(item.id, !item.ticked)} accessibilityRole="checkbox" accessibilityState={{ checked: item.ticked }}
                accessibilityLabel={`${item.name} in basket`} style={{ minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' }}
              >
                <MaterialCommunityIcons name={item.ticked ? 'checkbox-marked' : 'checkbox-blank-outline'} size={26} color={color.primary} />
              </Pressable>
            }
            right={<IconButton icon="close" label={`Remove ${item.name}`} tint={color.inkMuted} onPress={() => deleteShoppingEntry(item.id)} />}
          />
        )}
        ListFooterComponent={entries.some((e) => e.ticked)
          ? <View style={{ padding: space.screen }}><Button label="Clear ticked" kind="secondary" onPress={clearTicked} /></View> : undefined}
      />
    </View>
  );
}
