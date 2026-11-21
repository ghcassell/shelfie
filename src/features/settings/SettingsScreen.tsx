import { useLive } from '../../db/useLive';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, Share, Switch, Text, View } from 'react-native';
import { db } from '../../db/client';
import { useLarder } from '../../db/queries';
import { addLocation, deleteAllProducts, deleteLocation, moveLocation, renameLocation, setWarningDays } from '../../db/repositories';
import { households, members } from '../../db/schema';
import { sendCode, signedInEmail, signInAgain, signOut, sync, useSyncStatus } from '../../sync';
import Toast from 'react-native-toast-message';
import { Button, Field, IconButton, ListRow, s, ScreenHeader, Section, Sheet } from '../../ui/components';
import Dialog from '../../ui/Dialog';
import { pickDateTime } from '../../ui/platform';
import { color, space } from '../../ui/theme';
import { getDigestSettings, setDigestSettings } from './digest';
import { addIgnored, getIgnored, removeIgnored } from '../receipt/ignoreList';
import { exportCsv, exportJson, restoreFromFile } from './exportData';

const pad = (n: number) => String(n).padStart(2, '0');

export default function SettingsScreen() {
  const { locations, warningDays } = useLarder();
  const household = useLive(db.select().from(households))[0];
  const people = useLive(db.select().from(members));
  const { status, lastSynced, signedOut } = useSyncStatus();
  const [email, setEmail] = useState<string | null>(null);
  // Read again whenever sync settles, so it follows "Sign in again".
  useEffect(() => { signedInEmail().then(setEmail, () => {}); }, [status]);
  const [signIn, setSignIn] = useState<{ email: string; code: string; sent: boolean; busy?: boolean; error?: string } | null>(null);
  const signInStep = (action: () => Promise<unknown>, then: () => void) => {
    setSignIn((v) => v && { ...v, busy: true, error: '' });
    action().then(then, (e: unknown) => setSignIn((v) => v && { ...v, busy: false, error: e instanceof Error ? e.message : 'That did not work. Check your connection.' }));
  };
  const [digest, setDigest] = useState(getDigestSettings);
  const [newLocation, setNewLocation] = useState('');
  const [ignored, setIgnored] = useState(getIgnored);
  const [newIgnore, setNewIgnore] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [locationInUse, setLocationInUse] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const changeDigest = (patch: Partial<typeof digest>) => { setDigest({ ...digest, ...patch }); setDigestSettings(patch); };
  const run = (action: () => Promise<unknown>) => action().catch((e: unknown) => Toast.show({ type: 'error', text1: e instanceof Error ? e.message : 'That did not work. Try again.' }));
  const confirmDeleteAllProducts = () => setDeleteStep(1);
  const syncText = status === 'syncing' ? 'Syncing…'
    : signedOut ? 'This phone has been signed out, so it is not syncing. Shelfie keeps working on this phone.'
    : status === 'unavailable' ? 'Sync unavailable. Shelfie keeps working on this phone.'
    : lastSynced ? `Synced at ${pad(lastSynced.getHours())}:${pad(lastSynced.getMinutes())}` : 'Not synced yet';

  return (
    <View style={s.screen}>
      <ScreenHeader title="Settings" back />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Section title="Locations">
          {locations.map((l, i) => (
            <ListRow
              key={l.id} title={l.name} onPress={() => setRenaming({ id: l.id, name: l.name })}
              right={
                <>
                  <IconButton icon="arrow-up" label={`Move ${l.name} up`} tint={color.inkMuted} disabled={i === 0} onPress={() => moveLocation(l.id, -1)} />
                  <IconButton icon="arrow-down" label={`Move ${l.name} down`} tint={color.inkMuted} disabled={i === locations.length - 1} onPress={() => moveLocation(l.id, 1)} />
                  <IconButton
                    icon="trash-can-outline" label={`Delete ${l.name}`} tint={color.inkMuted}
                    onPress={() => setPendingDelete({ id: l.id, name: l.name })}
                  />
                </>
              }
            />
          ))}
          <Field label="New location" value={newLocation} onChangeText={setNewLocation} placeholder="Fridge, freezer, cupboard…" />
          <Button label="Add location" kind="secondary" disabled={!newLocation.trim()} onPress={() => { addLocation(newLocation); setNewLocation(''); }} />
        </Section>

        <Section title="Expiry warning (both phones)">
          <View style={s.qtyRow}>
            <IconButton icon="minus" ring label="One day fewer" tint={color.primary} size={40} disabled={warningDays <= 0} onPress={() => setWarningDays(Math.max(0, warningDays - 1))} />
            <Text style={[s.text, { flex: 1, textAlign: 'center' }]}>Warn {warningDays} {warningDays === 1 ? 'day' : 'days'} before</Text>
            <IconButton icon="plus" ring label="One day more" tint={color.primary} size={40} onPress={() => setWarningDays(warningDays + 1)} />
          </View>
          <Text style={s.muted}>Change it for one Product on its Product screen.</Text>
        </Section>

        {Platform.OS !== 'web' && <Section title="Daily digest (this phone)">
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
            <Text style={[s.text, { flex: 1 }]}>One notification a day</Text>
            <Switch value={digest.on} onValueChange={(on) => changeDigest({ on })} accessibilityLabel="Daily digest" trackColor={{ true: color.tint }} />
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
            onPress={() => run(async () => {
              const err = await restoreFromFile();
              if (err) Toast.show({ type: 'error', text1: err });
              else Toast.show({ type: 'success', text1: 'Backup restored' });
            })}
          />
        </Section>

        <Section title="Empty Larder">
          <Text style={s.muted}>Removes every product and batch from this Household.</Text>
          <Button label="Delete all products" kind="destructive" onPress={confirmDeleteAllProducts} />
        </Section>

        <Section title="Household and sync">
          <Text style={s.text}>{people.map((m) => m.displayName).join(' and ')}</Text>
          {household && people.length < 2 && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[s.text, { flex: 1 }]} selectable>Invite code: {household.inviteCode}</Text>
              {/* The share sheet has Copy on it; no clipboard module needed. */}
              <IconButton icon="share-variant" label="Copy or share the invite code" onPress={() => Share.share({ message: household.inviteCode })} />
            </View>
          )}
          {!!email && <Text style={s.muted}>Signed in as {email}</Text>}
          <Text style={s.muted} accessibilityLiveRegion="polite">{syncText}</Text>
          {signedOut
            ? <Button label="Sign in again" onPress={() => setSignIn({ email: '', code: '', sent: false })} />
            : <Button label="Sync now" kind="secondary" onPress={sync} disabled={status === 'syncing'} />}
          <Button label="Sign out" kind="secondary" onPress={() => setConfirmSignOut(true)} />
        </Section>

        <Section title="About">
          <Text style={s.text}>Shelfie 1.0.0</Text>
          <Text style={s.muted}>
            Product data from Open Food Facts, made available under the Open Database License (ODbL). Product images are CC BY-SA.
          </Text>
          <Button label="openfoodfacts.org" kind="secondary" onPress={() => Linking.openURL('https://world.openfoodfacts.org')} />
        </Section>
      </ScrollView>

      <Dialog
        visible={confirmSignOut} onDismiss={() => setConfirmSignOut(false)} title="Sign out?"
        message="This removes Shelfie's data from this device. Anything not yet synced is lost. Sign back in to get the Household back."
        buttons={[
          { label: 'Cancel', onPress: () => setConfirmSignOut(false) },
          { label: 'Sign out', variant: 'destructive', onPress: () => { setConfirmSignOut(false); run(signOut); } },
        ]}
      />

      <Sheet visible={!!renaming}onClose={() => setRenaming(null)} title="Rename location">
        <Field label="Name" value={renaming?.name ?? ''} onChangeText={(name) => setRenaming({ ...renaming!, name })} />
        <Button label="Save" disabled={!renaming?.name.trim()} onPress={() => { renameLocation(renaming!.id, renaming!.name); setRenaming(null); }} />
        <View style={{ height: space.sm }} />
      </Sheet>

      <Sheet visible={!!signIn} onClose={() => setSignIn(null)} title="Sign in again">
        {!signIn?.sent ? (
          <>
            <Field label="Your email" value={signIn?.email ?? ''} onChangeText={(email) => setSignIn({ ...signIn!, email })} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Button
              label="Send me a code" disabled={signIn?.busy || !signIn?.email.includes('@')}
              onPress={() => signInStep(() => sendCode(signIn!.email, false), () => setSignIn((v) => v && { ...v, sent: true, busy: false }))}
            />
            {/* Asking again cancels the code already sent, and the email sender allows only a few an hour. */}
            <Button label="I already have a code" kind="secondary" disabled={!signIn?.email.includes('@')} onPress={() => setSignIn({ ...signIn!, sent: true, error: '' })} />
          </>
        ) : (
          <>
            <Field label="Code from the email" value={signIn.code} onChangeText={(code) => setSignIn({ ...signIn, code })} keyboardType="number-pad" autoComplete="one-time-code" />
            <Button
              label="Sign in" disabled={signIn.busy || signIn.code.trim().length < 6}
              onPress={() => signInStep(() => signInAgain(signIn.email, signIn.code), () => { setSignIn(null); Toast.show({ type: 'success', text1: 'Signed in' }); })}
            />
          </>
        )}
        {!!signIn?.error && <Text style={s.error} accessibilityLiveRegion="polite">{signIn.error}</Text>}
        <View style={{ height: space.sm }} />
      </Sheet>

      <Dialog
        visible={!!pendingDelete}
        onDismiss={() => setPendingDelete(null)}
        title="Remove location?"
        message={`Remove "${pendingDelete?.name}"? This cannot be undone.`}
        buttons={[
          { label: 'Cancel', onPress: () => setPendingDelete(null) },
          {
            label: 'Remove', variant: 'destructive', onPress: () => {
              if (!deleteLocation(pendingDelete!.id)) setLocationInUse(pendingDelete!.name);
              setPendingDelete(null);
            },
          },
        ]}
      />

      <Dialog
        visible={!!locationInUse}
        onDismiss={() => setLocationInUse(null)}
        title="Still in use"
        message={`Move or finish what is in ${locationInUse} first.`}
        buttons={[{ label: 'OK', variant: 'primary', onPress: () => setLocationInUse(null) }]}
      />

      <Dialog
        visible={deleteStep === 1}
        onDismiss={() => setDeleteStep(null)}
        title="Warning"
        message="This will remove every product and batch for this Household on both phones."
        buttons={[
          { label: 'Cancel', onPress: () => setDeleteStep(null) },
          { label: 'Continue', variant: 'destructive', onPress: () => setDeleteStep(2) },
        ]}
      />

      <Dialog
        visible={deleteStep === 2}
        onDismiss={() => setDeleteStep(null)}
        title="Are you sure?"
        message="This cannot be undone."
        buttons={[
          { label: 'Cancel', onPress: () => setDeleteStep(null) },
          { label: 'Delete all products', variant: 'destructive', onPress: () => { deleteAllProducts(); Toast.show({ type: 'info', text1: 'All products deleted' }); setDeleteStep(null); } },
        ]}
      />
    </View>
  );
}
