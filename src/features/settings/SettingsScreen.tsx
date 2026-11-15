import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { db } from '../../db/client';
import { useLarder } from '../../db/queries';
import { addLocation, deleteAllProducts, deleteLocation, renameLocation, setWarningDays } from '../../db/repositories';
import { households, members } from '../../db/schema';
import { sync, useSyncStatus } from '../../sync';
import { Button, Field, IconButton, ListRow, s, ScreenHeader, Section, Sheet } from '../../ui/components';
import { alert, pickDateTime } from '../../ui/platform';
import { color, space } from '../../ui/theme';
import { getDigestSettings, setDigestSettings } from './digest';
import { addIgnored, getIgnored, removeIgnored } from '../receipt/ignoreList';
import { exportCsv, exportJson, restoreFromFile } from './exportData';

const pad = (n: number) => String(n).padStart(2, '0');

export default function SettingsScreen() {
  const { locations, warningDays } = useLarder();
  const household = useLiveQuery(db.select().from(households)).data[0];
  const people = useLiveQuery(db.select().from(members)).data;
  const { status, lastSynced } = useSyncStatus();
  const [digest, setDigest] = useState(getDigestSettings);
  const [newLocation, setNewLocation] = useState('');
  const [ignored, setIgnored] = useState(getIgnored);
  const [newIgnore, setNewIgnore] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState('');
  const [dangerMessage, setDangerMessage] = useState('');

  const changeDigest = (patch: Partial<typeof digest>) => { setDigest({ ...digest, ...patch }); setDigestSettings(patch); };
  const run = (action: () => Promise<unknown>) => action().catch(() => setMessage('That did not work. Try again.'));
  const confirmDeleteAllProducts = () => alert(
    'Warning',
    'This will remove every product and batch for this Household on both phones.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () => alert(
          'Are you sure?',
          'This cannot be undone.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete all products',
              style: 'destructive',
              onPress: () => {
                deleteAllProducts();
                setDangerMessage('All products were deleted.');
              },
            },
          ],
        ),
      },
    ],
  );
  const syncText = status === 'syncing' ? 'Syncing…'
    : status === 'unavailable' ? 'Sync unavailable. Shelfie keeps working on this phone.'
    : lastSynced ? `Synced at ${pad(lastSynced.getHours())}:${pad(lastSynced.getMinutes())}` : 'Not synced yet';

  return (
    <View style={s.screen}>
      <ScreenHeader title="Settings" back />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Section title="Locations">
          {locations.map((l) => (
            <ListRow
              key={l.id} title={l.name} onPress={() => setRenaming({ id: l.id, name: l.name })}
              right={
                <IconButton
                  icon="trash-can-outline" label={`Delete ${l.name}`} tint={color.inkMuted}
                  onPress={() => { if (!deleteLocation(l.id)) alert('Still in use', `Move or finish what is in ${l.name} first.`); }}
                />
              }
            />
          ))}
          <Field label="New location" value={newLocation} onChangeText={setNewLocation} placeholder="Fridge, freezer, cupboard…" />
          <Button label="Add location" kind="secondary" disabled={!newLocation.trim()} onPress={() => { addLocation(newLocation); setNewLocation(''); }} />
        </Section>

        <Section title="Expiry warning (both phones)">
          <View style={s.qtyRow}>
            <IconButton icon="minus-circle-outline" label="One day fewer" tint={color.primary} size={40} disabled={warningDays <= 0} onPress={() => setWarningDays(Math.max(0, warningDays - 1))} />
            <Text style={[s.text, { flex: 1, textAlign: 'center' }]}>Warn {warningDays} {warningDays === 1 ? 'day' : 'days'} before</Text>
            <IconButton icon="plus-circle-outline" label="One day more" tint={color.primary} size={40} onPress={() => setWarningDays(warningDays + 1)} />
          </View>
          <Text style={s.muted}>Change it for one Product on its Product screen.</Text>
        </Section>

        {Platform.OS !== 'web' && <Section title="Daily digest (this phone)">
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
            <Text style={[s.text, { flex: 1 }]}>One notification a day</Text>
            <Switch value={digest.on} onValueChange={(on) => changeDigest({ on })} accessibilityLabel="Daily digest" trackColor={{ true: color.brand }} />
          </View>
          <ListRow
            title="Time" subtitle={`${pad(digest.hour)}:${pad(digest.minute)} (roughly; Android decides the exact minute)`}
            onPress={() => pickDateTime('time', new Date(2026, 0, 1, digest.hour, digest.minute), (d) => changeDigest({ hour: d.getHours(), minute: d.getMinutes() }))}
          />
        </Section>}

        <Section title="Receipt ignore list (this phone)">
          <Text style={s.muted}>Receipt lines containing these words are left unticked. Totals, bags, discounts and payment lines are always ignored.</Text>
          {ignored.map((p) => (
            <ListRow
              key={p} title={p}
              right={<IconButton icon="trash-can-outline" label={`Stop ignoring ${p}`} tint={color.inkMuted} onPress={() => setIgnored(removeIgnored(p))} />}
            />
          ))}
          <Field label="Ignore lines containing" value={newIgnore} onChangeText={setNewIgnore} placeholder="PRICE REDUCTION" autoCapitalize="characters" />
          <Button label="Add to ignore list" kind="secondary" disabled={!newIgnore.trim()} onPress={() => { setIgnored(addIgnored(newIgnore)); setNewIgnore(''); }} />
        </Section>

        <Section title="Reports and export">
          <ListRow title="Waste report" onPress={() => router.push('/waste')} />
          <ListRow title="Export a backup (JSON)" subtitle="Can be restored later" onPress={() => run(exportJson)} />
          <ListRow title="Export for reading (CSV)" subtitle="A zip of three spreadsheets" onPress={() => run(exportCsv)} />
          <ListRow
            title="Restore a backup" subtitle="Only into an empty Household"
            onPress={() => run(async () => setMessage((await restoreFromFile()) ?? ''))}
          />
          {!!message && <Text style={s.error}>{message}</Text>}
        </Section>

        <Section title="Empty Larder">
          <Text style={s.muted}>Removes every product and batch from this Household.</Text>
          <Button label="Delete all products" kind="destructive" onPress={confirmDeleteAllProducts} />
          {!!dangerMessage && <Text style={s.error}>{dangerMessage}</Text>}
        </Section>

        <Section title="Household and sync">
          <Text style={s.text}>{people.map((m) => m.displayName).join(' and ')}</Text>
          {household && people.length < 2 && <Text style={s.text}>Invite code: {household.inviteCode}</Text>}
          <Text style={s.muted} accessibilityLiveRegion="polite">{syncText}</Text>
          <Button label="Sync now" kind="secondary" onPress={sync} disabled={status === 'syncing'} />
        </Section>

        <Section title="About">
          <Text style={s.text}>Shelfie 1.0.0</Text>
          <Text style={s.muted}>
            Product data from Open Food Facts, made available under the Open Database License (ODbL). Product images are CC BY-SA.
          </Text>
          <Button label="openfoodfacts.org" kind="secondary" onPress={() => Linking.openURL('https://world.openfoodfacts.org')} />
        </Section>
      </ScrollView>

      <Sheet visible={!!renaming} onClose={() => setRenaming(null)} title="Rename location">
        <Field label="Name" value={renaming?.name ?? ''} onChangeText={(name) => setRenaming({ ...renaming!, name })} />
        <Button label="Save" disabled={!renaming?.name.trim()} onPress={() => { renameLocation(renaming!.id, renaming!.name); setRenaming(null); }} />
        <View style={{ height: space.sm }} />
      </Sheet>
    </View>
  );
}
