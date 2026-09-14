import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '../theme/icons';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive styling for irreversible actions. */
  destructive?: boolean;
  icon?: IconName;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Confirmation for an action that cannot be undone. Cancel sits last and is the
 * larger target, so the safe choice is the easy one after an accidental swipe.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive = false,
  icon = 'trash-outline',
  onCancel,
  onConfirm,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const accent = destructive ? colors.destructive : colors.primary;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
        />

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              marginBottom: insets.bottom + spacing.lg,
            },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
            <Ionicons name={icon} size={22} color={accent} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>

          <Pressable
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            style={({ pressed }) => [
              styles.confirmBtn,
              { backgroundColor: accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.confirmText, { color: colors.onPrimary }]}>{confirmLabel}</Text>
          </Pressable>

          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            style={({ pressed }) => [
              styles.cancelBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.cancelText, { color: colors.foreground }]}>{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.lg },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.callout },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.footnote,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  confirmBtn: {
    minHeight: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  cancelBtn: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontFamily: fontFamily.medium, fontSize: fontSize.footnote },
});
