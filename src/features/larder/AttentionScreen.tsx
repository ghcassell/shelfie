import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, SectionList, Text, View } from 'react-native';
import { useLarder } from '../../db/queries';
import { larderForAi, type Recipe, recipesFromAi } from '../../domain/recipes';
import type { Urgency } from '../../domain/types';
import { suggestRecipes, sync, useSyncStatus } from '../../sync';
import { Button, EmptyState, IconButton, s, ScreenHeader, Sheet } from '../../ui/components';
import { color, space } from '../../ui/theme';
import { BatchItem } from './BatchItem';

const GROUPS: [Urgency, string][] = [
  ['expired', 'Expired'], ['past_best', 'Past best'], ['expiring_soon', 'Expiring soon'], ['needs_date', 'Needs a date'],
];

export default function AttentionScreen() {
  const { attention, larder, today } = useLarder();
  const { status } = useSyncStatus();
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sections = GROUPS
    .map(([urgency, title]) => ({ urgency, title, data: attention.filter((r) => r.urgency === urgency) }))
    .filter((g) => g.data.length);

  const ask = async () => {
    const items = larderForAi(larder, today);
    if (!items.length) { setError('Nothing in the Larder to cook with yet.'); return; }
    setBusy(true);
    setError('');
    try {
      const found = recipesFromAi(await suggestRecipes(items));
      if (!found.length) setError('The AI had no ideas this time. Try again.');
      setRecipes(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get recipe ideas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <ScreenHeader title="Needs attention" right={<IconButton icon="chef-hat" label="Recipe ideas" onPress={() => setRecipesOpen(true)} />} />
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

      <Sheet visible={recipesOpen} onClose={() => setRecipesOpen(false)} title="Recipe ideas">
        <Text style={s.muted}>Sends the names of what is in your Larder, and when each expires, to Google Gemini. Things past their use-by are left out. Needs a connection.</Text>
        <Button label={busy ? 'Asking…' : recipes ? 'Different ideas' : 'Suggest recipes'} icon="auto-fix" kind={recipes?.length ? 'secondary' : 'primary'} onPress={ask} disabled={busy} />
        {!!error && <Text style={s.error}>{error}</Text>}
        {recipes?.map((r) => (
          <View key={r.title} style={{ gap: space.xs, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: color.brand }}>
            <Text style={s.sectionTitle} accessibilityRole="header">{r.title}</Text>
            {r.uses.length > 0 && <Text style={s.text}>Uses: {r.uses.join(', ')}</Text>}
            {r.missing.length > 0 && <Text style={s.muted}>You’ll also need: {r.missing.join(', ')}</Text>}
            {r.steps.map((step, i) => <Text key={i} style={s.text}>{i + 1}. {step}</Text>)}
          </View>
        ))}
      </Sheet>
    </View>
  );
}
