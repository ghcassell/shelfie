import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Children, type ComponentProps, type ComponentRef, createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Dimensions, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatAmount, stepFor } from '../domain/amount';
import { emojiFor } from '../domain/emoji';
import type { BaseUnit, Urgency } from '../domain/types';
import { color, font, radius, space, TOUCH, urgencyStyle } from './theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** `ring`: a 1px circle of `size` around a half-size glyph — the font's own *-circle-outline glyphs are much heavier than our other outlines. */
export function IconButton({ icon, label, onPress, tint = color.dark, size = 24, disabled, ring }: {
  icon: IconName; label: string; onPress: () => void; tint?: string; size?: number; disabled?: boolean; ring?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      style={[s.iconButton, disabled && { opacity: 0.45 }]} hitSlop={4}
    >
      {ring ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: tint, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name={icon} size={size / 2} color={tint} />
        </View>
      ) : <MaterialCommunityIcons name={icon} size={size} color={tint} />}
    </Pressable>
  );
}

/** Fixed top of a screen: title row, then any `children` that stay put (search, filters), then a divider line. */
export function ScreenHeader({ title, back, right, menu, logo, children }: {
  title: string; back?: boolean | (() => void); right?: ReactNode; menu?: { label: string; onPress: () => void }[]; logo?: boolean; children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    // A bit more room above the divider when it sits under fixed content rather than the title. toArray drops the false of an unmet `cond && <X />`.
    <View style={[s.header, { paddingTop: insets.top + space.sm }, Children.toArray(children).length > 0 && { paddingBottom: space.md }]}>
      <View style={s.headerRow}>
      {back && <IconButton icon="arrow-left" label="Back" onPress={typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'))} />}
      {logo && (
        // The shadow sits on a wrapper: expo-image clips to its own rounded bounds.
        <View style={s.headerLogoShadow}>
          <Image source={require('../../assets/icon.png')} style={s.headerLogo} accessibilityIgnoresInvertColors />
        </View>
      )}
      <Text style={[s.headerTitle, logo && { fontSize: 32 }]} accessibilityRole="header" numberOfLines={2}>{title}</Text>
      {right}
      {menu && <IconButton icon="dots-vertical" label="More options" onPress={() => setOpen(true)} />}
      </View>
      {children}
      {menu && (
        <Sheet visible={open} onClose={() => setOpen(false)}>
          {menu.map((m) => (
            <ListRow key={m.label} title={m.label} onPress={() => { setOpen(false); m.onPress(); }} />
          ))}
        </Sheet>
      )}
    </View>
  );
}

export function Button({ label, onPress, kind = 'primary', icon, disabled, style }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'destructive'; icon?: IconName; disabled?: boolean; style?: ViewStyle;
}) {
  const fg = kind === 'primary' ? '#fff' : kind === 'destructive' ? color.red : color.primary;
  return (
    <Pressable
      onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      style={[s.button, kind === 'primary' ? s.buttonPrimary : s.buttonOutline, kind === 'destructive' && { borderColor: color.red }, disabled && { opacity: 0.45 }, style]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={20} color={fg} />}
      <Text style={[s.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** `warn` is the orange chip for To put away; the label carries the meaning too, never colour alone. */
export function Chip({ label, selected, onPress, icon, big, warn }: { label: string; big?: boolean; selected?: boolean; warn?: boolean; onPress?: () => void; icon?: IconName }) {
  const ink = selected ? '#fff' : warn ? color.orange : color.ink;
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      style={[s.chip, selected && s.chipSelected, warn && { borderColor: color.orange }, warn && selected && { backgroundColor: color.orange }]} hitSlop={{ top: 8, bottom: 8 }}
    >
      {icon && <MaterialCommunityIcons name={icon} size={16} color={ink} />}
      <Text style={[s.chipText, { color: ink }, big && { fontSize: font.lg }]}>{label}</Text>
    </Pressable>
  );
}

/** Colour + icon + text, always. Renders nothing for Fine and No expiry. */
export function StatusPill({ state, text }: { state: Urgency; text: string | null }) {
  const u = urgencyStyle[state];
  if (!u || !text) return null;
  return (
    <View style={[s.pill, { backgroundColor: u.fill }, u.outline && { borderWidth: 1, borderColor: color.inkMuted }]}>
      <MaterialCommunityIcons name={u.icon} size={14} color={u.text} />
      <Text style={[s.pillText, { color: u.text }]}>{text}</Text>
    </View>
  );
}

/** The Product's photo (Open Food Facts or the user's own), else a tint tile with an emoji guessed from its name. */
export function ProductTile({ name, category, imageUrl, size = 44 }: { name: string; category?: string | null; imageUrl: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null); // e.g. offline before the photo was ever cached
  const box = { width: size, height: size, borderRadius: radius.sm, borderWidth: 0.2, borderColor: color.brand };
  if (imageUrl && failed !== imageUrl) {
    return <Image source={imageUrl} style={box} contentFit="cover" cachePolicy="disk" accessibilityIgnoresInvertColors onError={() => setFailed(imageUrl)} />;
  }
  return (
    <View style={[box, s.tile]}>
      <Text style={{ fontSize: size * 0.55 }}>{emojiFor(name, category)}</Text>
    </View>
  );
}

export function ListRow({ title, subtitle, left, right, edge, onPress, accessibilityLabel }: {
  title: string; subtitle?: string; left?: ReactNode; right?: ReactNode; edge?: string; onPress?: () => void; accessibilityLabel?: string;
}) {
  return (
    // `right` is a sibling of the Pressable, not a child: on web a <button> can't nest another <button>.
    <View style={s.row}>
      {/* The urgency edge is its own strip, not a left border: Android drops the divider on rows whose borders differ in colour and width. */}
      {edge && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: edge }} />}
      <Pressable
        onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={accessibilityLabel}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }}
      >
        {left}
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>{title}</Text>
          {!!subtitle && <Text style={s.rowSubtitle}>{subtitle}</Text>}
        </View>
      </Pressable>
      {right}
    </View>
  );
}

/** Needs-attention banner: red-tinted if anything is Expired, else amber. */
export function Banner({ text, tone, onPress }: { text: string; tone: 'red' | 'amber'; onPress: () => void }) {
  const red = tone === 'red';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[s.banner, { backgroundColor: red ? '#FBE9E7' : '#FFF4D6', borderColor: red ? color.red : color.amber }]}>
      <MaterialCommunityIcons name={red ? 'alert-circle' : 'clock-alert-outline'} size={22} color={red ? color.red : color.ink} />
      <Text style={s.bannerText}>{text}</Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={color.ink} />
    </Pressable>
  );
}

export function EmptyState({ icon, text, actionLabel, onAction }: { icon: IconName; text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={s.empty}>
      <MaterialCommunityIcons name={icon} size={56} color={color.brand} />
      <Text style={s.emptyText}>{text}</Text>
      {actionLabel && onAction && <Button label={actionLabel} onPress={onAction} />}
    </View>
  );
}

export function FAB({ icon = 'plus', label, onPress }: { icon?: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={s.fab}>
      <MaterialCommunityIcons name={icon} size={28} color="#fff" />
    </Pressable>
  );
}

/** One step of the add wizard: "Step n of m", scrolling body, fixed bottom bar. */
export function WizardStep({ heading, onExit, step, of, title, children, onBack, onNext, nextLabel = 'Next', nextDisabled, onSaveNext, scroll = true }: {
  heading: string; onExit: () => void; step: number; of: number; title: string; children: ReactNode; onBack: () => void; onNext?: () => void; nextLabel?: string;
  nextDisabled?: boolean; onSaveNext?: () => void; scroll?: boolean;
}) {
  const Body = scroll ? ScrollView : View;
  return (
    <View style={s.screen}>
      <ScreenHeader title={heading} back={onExit}>
        <View style={s.wizardTop}>
          <Text style={s.wizardCount}>Step {step} of {of}</Text>
          <View style={s.progressTrack}><View style={[s.progressFill, { width: `${(step / of) * 100}%` }]} /></View>
          <Text style={s.sheetTitle} accessibilityRole="header">{title}</Text>
        </View>
      </ScreenHeader>
      <Body style={{ flex: 1 }} {...(scroll ? { contentContainerStyle: s.wizardBody, keyboardShouldPersistTaps: 'handled' as const } : {})}>
        <Form>{children}</Form>
      </Body>
      <BottomBar>
        <Button label="Back" kind="secondary" onPress={onBack} />
        <View style={{ flex: 1 }} />
        {onSaveNext && <Button label="Save & scan next" kind="secondary" onPress={onSaveNext} disabled={nextDisabled} />}
        {onNext && <Button label={nextLabel} onPress={onNext} disabled={nextDisabled} />}
      </BottomBar>
    </View>
  );
}

/** A screen's fixed bottom button bar. Hidden while typing: riding on top of the keyboard it looked like the end of the form. */
export function BottomBar({ children, paddingBottom = space.md }: { children: ReactNode; paddingBottom?: number }) {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const subs = [Keyboard.addListener('keyboardDidShow', () => setTyping(true)), Keyboard.addListener('keyboardDidHide', () => setTyping(false))];
    return () => subs.forEach((sub) => sub.remove());
  }, []);
  return typing ? null : <View style={[s.bottomBar, { paddingBottom }]}>{children}</View>;
}

/** Numeric field in the Base unit, -/+ (step 1 for count, 50 for g/ml), quick chips quarter / half / All. */
export function QuantityPicker({ value, onChange, unit, max }: { value: number; onChange: (n: number) => void; unit: BaseUnit; max: number }) {
  const step = stepFor(unit);
  const clamp = (n: number) => Math.min(max, Math.max(0, Math.round(n * 100) / 100));
  return (
    <View style={{ gap: space.md }}>
      <View style={s.qtyRow}>
        <IconButton icon="minus" ring label={`Less by ${step}`} onPress={() => onChange(clamp(value - step))} tint={color.primary} size={40} disabled={value <= 0} />
        <TextInput
          style={s.qtyInput} keyboardType="numeric" value={String(value)} accessibilityLabel={`Amount in ${unit === 'count' ? 'items' : unit}`}
          onChangeText={(t) => onChange(clamp(parseFloat(t.replace(',', '.')) || 0))} selectTextOnFocus
        />
        <Text style={s.qtyUnit}>{unit === 'count' ? '' : unit}</Text>
        <IconButton icon="plus" ring label={`More by ${step}`} onPress={() => onChange(clamp(value + step))} tint={color.primary} size={40} disabled={value >= max} />
      </View>
      <View style={s.chipRow}>
        <Chip big label="¼" selected={value === clamp(max / 4)} onPress={() => onChange(clamp(max / 4))} />
        <Chip big label="½" selected={value === clamp(max / 2)} onPress={() => onChange(clamp(max / 2))} />
        <Chip label={`All (${formatAmount(max, unit)})`} selected={value === max} onPress={() => onChange(max)} />
      </View>
    </View>
  );
}

type Input = ComponentRef<typeof TextInput>;
const FormContext = createContext<Set<Input> | null>(null);

/** Wrap a multi-field form: the keyboard's action key then moves to the Field below, and closes the keyboard on the last one. Adds no view. */
export function Form({ children }: { children: ReactNode }) {
  const [fields] = useState(() => new Set<Input>());
  return <FormContext.Provider value={fields}>{children}</FormContext.Provider>;
}

export function Field({ label, style, ...input }: TextInputProps & { label: string }) {
  const fields = useContext(FormContext);
  const ref = useRef<Input>(null);
  useEffect(() => {
    const me = ref.current;
    if (!fields || !me) return;
    fields.add(me);
    return () => { fields.delete(me); };
  }, [fields]);

  // "Below" is measured when the key is pressed, not tracked in mount order: Fields come and go as the form changes.
  const focusNext = async () => {
    const me = ref.current;
    if (!fields || !me) return;
    const tops = await Promise.all([...fields].map((f) => new Promise<[Input, number]>((done) => f.measureInWindow((_x, y) => done([f, y])))));
    const mine = tops.find(([f]) => f === me)?.[1] ?? Infinity;
    const next = tops.filter(([, y]) => y > mine).sort((a, b) => a[1] - b[1])[0]?.[0];
    if (next) next.focus(); else me.blur();
  };
  // A Field with its own submit action (e.g. the typed barcode) keeps it.
  const chain = fields && !input.onSubmitEditing ? { submitBehavior: 'submit' as const, onSubmitEditing: focusNext } : null;

  return (
    <View style={{ gap: space.xs }}>
      <Text style={s.label}>{label}</Text>
      <TextInput ref={ref} accessibilityLabel={label} placeholderTextColor={color.placeholder} style={[s.input, style]} {...input} {...chain} />
    </View>
  );
}

/** Bottom sheet for pickers and menus. Scrim fades; sheet slides — animated separately so the scrim doesn't travel with the sheet. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  if (visible && !rendered) setRendered(true); // stays mounted after close until the slide-out finishes
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [drag] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) drag.setValue(0);
    Animated.timing(progress, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true })
      .start(({ finished }) => { if (finished && !visible) setRendered(false); });
  }, [visible, progress, drag]);

  // Grab bar: tap or swipe down to close; a short swipe springs back.
  // Dragging only moves an Animated.Value (no re-render), so recreating this per onClose never interrupts a gesture.
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_e, g) => {
      if (Math.abs(g.dy) < 5 || g.dy > 80 || g.vy > 0.5) onClose();
      else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
  }), [drag, onClose]);

  if (!rendered) return null;
  const offscreen = Dimensions.get('window').height;
  const translateY = Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [offscreen, 0] }), drag);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Animated.View style={[s.scrim, { opacity: progress }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      </Animated.View>
      {/* A Modal is its own window, so the root KeyboardAvoidingView doesn't reach in here. */}
      <KeyboardAvoidingView behavior="padding" style={s.sheetDock} pointerEvents="box-none">
        <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + space.lg, transform: [{ translateY }] }]}>
          <View
            {...pan.panHandlers} style={[s.sheetGrab, !title && { minHeight: 0 }]}
            accessible accessibilityRole="button" accessibilityLabel="Close"
            accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={onClose}
          >
            <View style={s.sheetHandle} />
            {!!title && <Text style={s.sheetTitle} accessibilityRole="header">{title}</Text>}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.sm }}>{children}</ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={{ gap: space.sm }}>
    <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>
    {children}
  </View>
);

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  body: { padding: space.screen, gap: space.xxl },
  header: { gap: space.sm, paddingBottom: space.sm, backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.brand },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.screen, minHeight: TOUCH, paddingBottom: 3 }, // as tall as an icon button, so titles line up with or without one
  headerLogo: { width: TOUCH, height: TOUCH, borderRadius: radius.md },
  headerLogoShadow: { borderRadius: radius.md, boxShadow: '0 1px 4px #0c6b58' },
  headerTitle: { flex: 1, fontFamily: font.title, fontSize: font.xl, color: color.dark, fontWeight: '900', marginBottom: 1 },
  iconButton: { minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: TOUCH, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  buttonPrimary: { backgroundColor: color.primary },
  buttonOutline: { borderWidth: 1, borderColor: color.primary, backgroundColor: color.surface },
  buttonText: { fontSize: font.md, fontWeight: '600' },
  chip: { minHeight: 36, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.full, borderWidth: 1, borderColor: color.brand, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: color.surface },
  chipSelected: { backgroundColor: color.primary, borderColor: color.primary },
  chipText: { fontSize: font.sm, color: color.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.full, alignSelf: 'flex-start' },
  pillText: { fontSize: font.xs, fontWeight: '600' },
  tile: { backgroundColor: color.tint, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingRight: space.screen, paddingLeft: space.screen, minHeight: TOUCH, borderBottomWidth: 1, borderBottomColor: color.line, backgroundColor: color.surface },
  rowTitle: { fontSize: font.md, fontWeight: '600', color: color.ink },
  rowSubtitle: { fontSize: font.sm, color: color.inkMuted, marginTop: 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, marginHorizontal: space.screen, borderRadius: radius.md, borderWidth: 1, minHeight: TOUCH },
  bannerText: { flex: 1, fontSize: font.md, color: color.ink, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xxl },
  emptyText: { fontSize: font.md, color: color.inkMuted, textAlign: 'center' },
  fab: { position: 'absolute', right: space.lg, bottom: space.lg, width: 56, height: 56, borderRadius: radius.full, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  wizardTop: { paddingHorizontal: space.screen, gap: space.sm },
  wizardCount: { fontSize: font.sm, color: color.inkMuted },
  wizardBody: { padding: space.screen, gap: space.lg },
  progressTrack: { height: 4, borderRadius: radius.full, backgroundColor: color.line },
  progressFill: { height: 4, borderRadius: radius.full, backgroundColor: color.brand },
  bottomBar: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.screen, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.primary, backgroundColor: color.surface },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  qtyInput: { flex: 1, minHeight: TOUCH, borderWidth: 1, borderColor: color.line, borderRadius: radius.sm, paddingHorizontal: space.md, fontSize: font.lg, color: color.ink, textAlign: 'center' },
  qtyUnit: { fontSize: font.md, color: color.inkMuted },
  label: { fontSize: font.sm, color: color.inkMuted },
  input: { minHeight: TOUCH, borderWidth: 1, borderColor: color.line, borderRadius: radius.sm, paddingHorizontal: space.md, fontSize: font.md, color: color.ink },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(22,48,42,0.4)' },
  sheetDock: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space.lg, gap: space.md, maxHeight: '80%', elevation: 12 },
  sheetGrab: { paddingTop: space.sm, paddingBottom: space.xs, gap: space.md, minHeight: TOUCH },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.full, backgroundColor: color.line },
  sheetTitle: { fontFamily: font.title, fontSize: font.lg, color: color.dark },
  sectionTitle: { fontSize: font.sm, fontWeight: '600', color: color.dark, textTransform: 'uppercase', letterSpacing: 0.5 },
  text: { fontSize: font.md, color: color.ink },
  muted: { fontSize: font.sm, color: color.inkMuted },
  error: { fontSize: font.sm, color: color.red },
});
