import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ToastConfig, ToastConfigParams } from 'react-native-toast-message';
import { color, font, radius, space } from './theme';

type Accent = 'success' | 'error' | 'info';

const ACCENT: Record<Accent, string> = {
  success: color.primary,
  error: color.red,
  info: color.brand,
};

function AppToast({ text1, text2, hide, isVisible, accent, props }: {
  text1?: string; text2?: string; hide: () => void; isVisible: boolean; accent: Accent; props?: { onUndo?: () => void };
}) {
  const bar = ACCENT[accent];
  return (
    <View style={[styles.container, { borderColor: bar }]} aria-hidden={!isVisible}>
      <View style={[styles.accentBar, { backgroundColor: bar }]} />
      <View style={styles.textWrap}>
        {text1 ? <Text style={styles.text1}>{text1}</Text> : null}
        {text2 ? <Text style={styles.text2}>{text2}</Text> : null}
      </View>
      {props?.onUndo && (
        <Pressable onPress={() => { props.onUndo!(); hide(); }} accessibilityRole="button" style={styles.undoBtn} tabIndex={isVisible ? 0 : -1}>
          <Text style={styles.undo}>Undo</Text>
        </Pressable>
      )}
      <Pressable onPress={hide} accessibilityRole="button" accessibilityLabel="Dismiss"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.closeBtn}
        tabIndex={isVisible ? 0 : -1}
      >
        <MaterialCommunityIcons name="close" size={18} color={color.inkMuted} />
      </Pressable>
    </View>
  );
}

export const toastConfig: ToastConfig = {
  success: (p: ToastConfigParams<{ onUndo?: () => void }>) => <AppToast {...p} accent="success" />,
  error: (p: ToastConfigParams<{ onUndo?: () => void }>) => <AppToast {...p} accent="error" />,
  info: (p: ToastConfigParams<{ onUndo?: () => void }>) => <AppToast {...p} accent="info" />,
};

const styles = StyleSheet.create({
  container: {
    width: '90%',
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: color.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    // Shadow
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  accentBar: {
    width: 6,
  },
  textWrap: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    gap: 2,
  },
  closeBtn: {
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoBtn: {
    minWidth: 48,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undo: {
    fontSize: font.md,
    fontWeight: '600',
    color: color.primary,
  },
  text1: {
    fontSize: font.md,
    fontWeight: '600',
    color: color.ink,
  },
  text2: {
    fontSize: font.sm,
    color: color.inkMuted,
  },
});
