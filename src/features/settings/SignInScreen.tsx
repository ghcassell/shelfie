import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adoptMembership, createHousehold, joinHousehold, sendCode, verifyCode } from '../../sync';
import { Button, Field, s } from '../../ui/components';
import { color, font, space } from '../../ui/theme';

type Stage = 'email' | 'code' | 'household';

/** First launch (needs a connection): email code, then create a Household or join one with an invite code. */
export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = (action: () => Promise<void>) => async () => {
    setBusy(true);
    setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Check your connection.'); }
    setBusy(false);
  };

  const sendEmail = run(async () => { await sendCode(email); setStage('code'); });
  // Already a Member (new phone or reinstall): straight in; the Larder re-pulls.
  const verify = run(async () => { await verifyCode(email, code); if (!(await adoptMembership())) setStage('household'); });
  const create = run(() => createHousehold(name));
  const join = run(() => joinHousehold(invite, name));
  const canEmail = !busy && email.includes('@');
  const canVerify = !busy && code.trim().length >= 6;
  const canCreate = !busy && !!name.trim();
  const canJoin = canCreate && !!invite.trim();

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.body, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.screen }]} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={s.headerLogoShadow}>
          <Image source={require('../../../assets/icon.png')} style={s.headerLogo} accessibilityIgnoresInvertColors />
        </View>
        <Text style={{ fontFamily: font.title, fontSize: 40, color: color.dark }} accessibilityRole="header">Shelfie</Text>
      </View>
      <Text style={s.muted}>Know what is in your larder, and use it before it goes off.</Text>

      {stage === 'email' && (
        <>
          <Field label="Your email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" onSubmitEditing={() => canEmail && sendEmail()} />
          <Button label="Send me a code" disabled={!canEmail} onPress={sendEmail} />
        </>
      )}

      {stage === 'code' && (
        <>
          <Text style={s.text}>We sent a code to {email.trim()}.</Text>
          <Field label="Code from the email" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" onSubmitEditing={() => canVerify && verify()} />
          <Button
            label="Sign in" disabled={!canVerify} onPress={verify}
          />
          <Button label="Use a different email" kind="secondary" onPress={() => setStage('email')} />
        </>
      )}

      {stage === 'household' && (
        <>
          <Field label="Your name (shown to the other person)" value={name} onChangeText={setName} autoComplete="given-name" onSubmitEditing={() => (invite.trim() ? canJoin && join() : canCreate && create())} />
          <Button label="Start a new Household" disabled={!canCreate} onPress={create} />
          <View style={{ height: space.sm }} />
          <Field label="Or enter an invite code" value={invite} onChangeText={setInvite} autoCapitalize="characters" onSubmitEditing={() => canJoin && join()} />
          <Button label="Join their Household" kind="secondary" disabled={!canJoin} onPress={join} />
          <Text style={s.muted}>The invite code is in Settings on the first person’s phone.</Text>
        </>
      )}

      {!!error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
    </ScrollView>
  );
}
