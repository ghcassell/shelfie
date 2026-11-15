import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, font, radius, space } from './theme';

export type DialogButton = {
  label: string;
  onPress?: () => void;
  /** 'primary' fills with the brand color; 'destructive' fills red; default is a text button. */
  variant?: 'primary' | 'destructive' | 'default';
};

type DialogProps = {
  visible: boolean;
  /** Backdrop tap and Android back button. Buttons should also call this to close. */
  onDismiss: () => void;
  title: string;
  message?: string;
  /** Extra content below the message. */
  children?: React.ReactNode;
  /** Defaults to a single "OK" that dismisses. */
  buttons?: DialogButton[];
};

export default function Dialog({ visible, onDismiss, title, message, children, buttons }: DialogProps) {
  const actions = buttons ?? [{ label: 'OK', variant: 'primary' as const, onPress: onDismiss }];

  return (
    // Fade, not "none": Android edge-to-edge first lays the modal out minus the system bars, then
    // resizes to full height, so centred content jumps down. The fade hides that first frame.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.root}>
        {/* Plain View, not Pressable: avoids always-focusable tabIndex on web; Esc/back still dismiss. */}
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onResponderRelease={onDismiss}
        />
        <View style={styles.card} accessibilityViewIsModal role="alertdialog" accessibilityLabel={title}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <ScrollView style={styles.body}>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            {children}
          </ScrollView>
          <View style={styles.actions}>
            {actions.map((b) => (
              <Pressable
                key={b.label}
                onPress={b.onPress}
                accessibilityRole="button"
                accessibilityLabel={b.label}
                style={({ pressed }) => [
                  styles.actionButton,
                  b.variant === 'primary' && styles.actionButtonPrimary,
                  b.variant === 'destructive' && styles.actionButtonDestructive,
                  pressed && styles.actionButtonPressed,
                ]}
              >
                <Text style={[
                  styles.actionText,
                  b.variant === 'primary' && styles.actionTextOnFill,
                  b.variant === 'destructive' && styles.actionTextOnFill,
                ]}>
                  {b.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: space.xl },
  card: { width: '100%', maxWidth: 420, maxHeight: '80%', borderRadius: radius.lg, padding: space.xl, backgroundColor: color.surface },
  title: { fontSize: font.lg, fontWeight: '800', color: color.ink, marginBottom: space.sm },
  body: { flexGrow: 0 },
  message: { fontSize: font.md, lineHeight: 22, color: color.inkMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.sm, marginTop: space.lg },
  actionButton: { paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderRadius: radius.sm },
  actionButtonPrimary: { backgroundColor: color.primary },
  actionButtonDestructive: { backgroundColor: color.red },
  actionButtonPressed: { opacity: 0.75 },
  actionText: { fontSize: font.sm, fontWeight: '700', color: color.primary },
  actionTextOnFill: { color: '#fff' },
});
