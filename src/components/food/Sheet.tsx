import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '../../theme/Ionicons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, PHONE_MAX_WIDTH, radius, spacing, TOUCH_TARGET } from '../../theme/tokens';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Pinned under the scrolling body (e.g. the save button). */
  footer?: React.ReactNode;
};

/** Bottom sheet with the same frame as TaskEditor: scrim, grabber, title, close button. */
export function Sheet({ visible, title, onClose, children, footer }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={styles.scrimTap} onPress={onClose} accessibilityLabel="Cerrar" accessibilityRole="button" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <View style={styles.header}>
              <Text style={[styles.heading, { color: colors.foreground }]}>{title}</Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
              contentContainerStyle={styles.body}
            >
              {children}
            </ScrollView>
            {footer}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Pill chip shared by the food sheets. */
export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.surface,
          borderColor: active ? colors.primary : colors.border,
          opacity: pressed && !active ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

/** Full-width primary action at the bottom of a sheet. */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: colors.primary, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.primaryText, { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

export const sheetStyles = StyleSheet.create({
  field: { gap: spacing.sm },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  scrimTap: { flex: 1 },
  sheetWrap: { flexShrink: 1, width: '100%', maxWidth: PHONE_MAX_WIDTH, alignSelf: 'center' },
  sheet: {
    flexShrink: 1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  grabber: { width: 38, height: 4, borderRadius: 999, alignSelf: 'center', marginBottom: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontFamily: fontFamily.bold, fontSize: fontSize.title },
  closeBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'flex-end', justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { gap: spacing.xl, paddingBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  primary: { minHeight: 50, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
});
