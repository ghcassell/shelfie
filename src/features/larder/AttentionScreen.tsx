import { router } from 'expo-router';
import { RefreshControl, SectionList, Text, View } from 'react-native';
import { useLarder } from '../../db/queries';
import type { Urgency } from '../../domain/types';
import { sync, useSyncStatus } from '../../sync';
import { Button, EmptyState, s, ScreenHeader } from '../../ui/components';
import { color, space } from '../../ui/theme';
import { BatchItem } from './BatchItem';

const GROUPS: [Urgency, string][] = [
  ['expired', 'Expired'], ['past_best', 'Past best'], ['expiring_soon', 'Expiring soon'], ['needs_date', 'Needs a date'],
];

export default function AttentionScreen() {
  const { attention, today } = useLarder();
  const { status } = useSyncStatus();
  const sections = GROUPS
    .map(([urgency, title]) => ({ urgency, title, data: attention.filter((r) => r.urgency === urgency) }))
    .filter((g) => g.data.length);

  return (
    <View style={s.screen}>
      <ScreenHeader title="Needs attention" />
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.batch.id}
        renderItem={({ item }) => <BatchItem row={item} today={today} />}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.screen, paddingVertical: space.sm, backgroundColor: color.surface }}>
            <Text style={[s.sectionTitle, { flex: 1 }]} accessibilityRole="header">{section.title} ({section.data.length})</Text>
            {section.urgency === 'needs_date' && <Button label="Fill in dates" kind="secondary" onPress={() => router.push('/fill-dates')} />}
          </View>
        )}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={status === 'syncing'} onRefresh={sync} />}
        ListEmptyComponent={<EmptyState icon="check-circle-outline" text="All clear. Nothing needs using up." />}
      />
    </View>
  );
}
