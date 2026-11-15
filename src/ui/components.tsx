import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { type ComponentProps, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Animated, Dimensions, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatAmount, stepFor } from '../domain/amount';
import { emojiFor } from '../domain/emoji';
import type { BaseUnit, Urgency } from '../domain/types';
import { color, font, radius, space, TOUCH, urgencyStyle } from './theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function IconButton({ icon, label, onPress, tint = color.dark }: { icon: IconName; label: string; onPress: () => void; tint?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={s.iconButton} hitSlop={4}>
      <MaterialCommunityIcons name={icon} size={24} color={tint} />
    </Pressable>
  );
}

export function ScreenHeader({ title, back, right, menu }: {
  title: string; back?: boolean; right?: ReactNode; menu?: { label: string; onPress: () => void }[];
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
      {back && <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />}
      <Text style={s.headerTitle} accessibilityRole="header" numberOfLines={2}>{title}</Text>
      {right}
      {menu && <IconButton icon="dots-vertical" label="More options" onPress={() => setOpen(true)} />}
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

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      style={[s.chip, selected && s.chipSelected]} hitSlop={{ top: 8, bottom: 8 }}
    >
      {icon && <MaterialCommunityIcons name={icon} size={16} color={selected ? '#fff' : color.ink} />}
      <Text style={[s.chipText, selected && { color: '#fff' }]}>{label}</Text>
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
  const box = { width: size, height: size, borderRadius: radius.sm };
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
    <Pressable
      onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={accessibilityLabel}
      style={[s.row, { borderLeftColor: edge ?? 'transparent' }]}
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {!!subtitle && <Text style={s.rowSubtitle}>{subtitle}</Text>}
      </View>
      {right}
    </Pressable>
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
export function WizardStep({ step, of, title, children, onBack, onNext, nextLabel = 'Next', nextDisabled, onSaveNext, scroll = true }: {
  step: number; of: number; title: string; children: ReactNode; onBack: () => void; onNext?: () => void; nextLabel?: string;
  nextDisabled?: boolean; onSaveNext?: () => void; scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  return (
    <View style={s.screen}>
      <View style={[s.wizardTop, { paddingTop: insets.top + space.sm }]}>
        <Text style={s.wizardCount}>Step {step} of {of}</Text>
        <View style={s.progressTrack}><View style={[s.progressFill, { width: `${(step / of) * 100}%` }]} /></View>
        <Text style={s.headerTitle} accessibilityRole="header">{title}</Text>
      </View>
      <Body style={{ flex: 1 }} {...(scroll ? { contentContainerStyle: s.wizardBody, keyboardShouldPersistTaps: 'handled' as const } : {})}>
        {children}
      </Body>
      <View style={[s.bottomBar, { paddingBottom: space.md }]}>
        <Button label="Back" kind="secondary" onPress={onBack} />
        <View style={{ flex: 1 }} />
        {onSaveNext && <Button label="Save & scan next" kind="secondary" onPress={onSaveNext} disabled={nextDisabled} />}
        {onNext && <Button label={nextLabel} onPress={onNext} disabled={nextDisabled} />}
      </View>
    </View>
  );
}

/** Numeric field in the Base unit, -/+ (step 1 for count, 50 for g/ml), quick chips quarter / half / All. */
export function QuantityPicker({ value, onChange, unit, max }: { value: number; onChange: (n: number) => void; unit: BaseUnit; max: number }) {
  const step = stepFor(unit);
  const clamp = (n: number) => Math.min(max, Math.max(0, Math.round(n * 100) / 100));
  return (
    <View style={{ gap: space.md }}>
      <View style={s.qtyRow}>
        <IconButton icon="minus-circle-outline" label={`Less by ${step}`} onPress={() => onChange(clamp(value - step))} tint={color.primary} />
        <TextInput
          style={s.qtyInput} keyboardType="numeric" value={String(value)} accessibilityLabel={`Amount in ${unit === 'count' ? 'items' : unit}`}
          onChangeText={(t) => onChange(clamp(parseFloat(t.replace(',', '.')) || 0))} selectTextOnFocus
        />
        <Text style={s.qtyUnit}>{unit === 'count' ? '' : unit}</Text>
        <IconButton icon="plus-circle-outline" label={`More by ${step}`} onPress={() => onChange(clamp(value + step))} tint={color.primary} />
      </View>
      <View style={s.chipRow}>
        <Chip label="¼" selected={value === clamp(max / 4)} onPress={() => onChange(clamp(max / 4))} />
        <Chip label="½" selected={value === clamp(max / 2)} onPress={() => onChange(clamp(max / 2))} />
        <Chip label={`All (${formatAmount(max, unit)})`} selected={value === max} onPress={() => onChange(max)} />
      </View>
    </View>
  );
}

export function Field({ label, style, ...input }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={s.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={color.inkMuted} style={[s.input, style]} {...input} />
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
      <View style={s.sheetDock} pointerEvents="box-none">
        <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + space.lg, transform: [{ translateY }] }]}>
          <View
            {...pan.panHandlers} style={s.sheetGrab}
            accessible accessibilityRole="button" accessibilityLabel="Close"
            accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={onClose}
          >
            <View style={s.sheetHandle} />
            {!!title && <Text style={s.sheetTitle} accessibilityRole="header">{title}</Text>}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.sm }}>{children}</ScrollView>
        </Animated.View>
      </View>
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
  body: { padding: space.screen, gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.screen, paddingBottom: space.sm, backgroundColor: color.surface },
  headerTitle: { flex: 1, fontFamily: font.title, fontSize: font.xl, color: color.dark },
  iconButton: { minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: TOUCH, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  buttonPrimary: { backgroundColor: color.primary },
  buttonOutline: { borderWidth: 1, borderColor: color.primary, backgroundColor: color.surface },
  buttonText: { fontSize: font.md, fontWeight: '600' },
  chip: { minHeight: 36, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.full, borderWidth: 1, borderColor: color.line, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: color.surface },
  chipSelected: { backgroundColor: color.primary, borderColor: color.primary },
  chipText: { fontSize: font.sm, color: color.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.full, alignSelf: 'flex-start' },
  pillText: { fontSize: font.xs, fontWeight: '600' },
  tile: { backgroundColor: color.tint, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingRight: space.screen, paddingLeft: space.screen - 4, minHeight: TOUCH, borderLeftWidth: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line, backgroundColor: color.surface },
  rowTitle: { fontSize: font.md, fontWeight: '600', color: color.ink },
  rowSubtitle: { fontSize: font.sm, color: color.inkMuted, marginTop: 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, marginHorizontal: space.screen, marginBottom: space.sm, borderRadius: radius.md, borderWidth: 1, minHeight: TOUCH },
  bannerText: { flex: 1, fontSize: font.md, color: color.ink, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xxl },
  emptyText: { fontSize: font.md, color: color.inkMuted, textAlign: 'center' },
  fab: { position: 'absolute', right: space.lg, bottom: space.lg, width: 56, height: 56, borderRadius: radius.full, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  wizardTop: { paddingHorizontal: space.screen, gap: space.sm, paddingBottom: space.sm },
  wizardCount: { fontSize: font.sm, color: color.inkMuted },
  wizardBody: { padding: space.screen, gap: space.lg },
  progressTrack: { height: 4, borderRadius: radius.full, backgroundColor: color.line },
  progressFill: { height: 4, borderRadius: radius.full, backgroundColor: color.brand },
  bottomBar: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.screen, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, backgroundColor: color.surface },
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
  sectionTitle: { fontSize: font.sm, fontWeight: '600', color: color.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  text: { fontSize: font.md, color: color.ink },
  muted: { fontSize: font.sm, color: color.inkMuted },
  error: { fontSize: font.sm, color: color.red },
});
