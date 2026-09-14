import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import type { EditScope } from '../types/task';

type Props = {
  visible: boolean;
  /** Distinguishes the wording between saving an edit and deleting. */
  intent: 'edit' | 'delete';
  dayLabel: string;
  onCancel: () => void;
  onChoose: (scope: EditScope) => void;
};

/**
 * Asks whether an action on a repeating task applies to one day or the whole
 * series — the choice is destructive enough that it must never be guessed.
 */
export function ScopeDialog({ visible, intent, dayLabel, onCancel, onChoose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const isDelete = intent === 'delete';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cancelar" />

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              marginBottom: insets.bottom + spacing.lg,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
            <Ionicons name="repeat" size={22} color={colors.primary} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>
            {isDelete ? 'Eliminar actividad repetida' : 'Guardar actividad repetida'}
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Esta actividad se repite en varios días. ¿Qué quieres cambiar?
          </Text>

          <Pressable
            onPress={() => onChoose('one')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: colors.muted,
                borderColor: colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Ionicons name="today-outline" size={19} color={colors.foreground} />
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.foreground }]}>
                {isDelete ? 'Quitar solo este día' : 'Solo este día'}
              </Text>
              <Text style={[styles.optionHint, { color: colors.mutedForeground }]}>{dayLabel}</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => onChoose('all')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: isDelete ? 'transparent' : colors.primary,
                borderColor: isDelete ? colors.destructive : colors.primary,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Ionicons
              name={isDelete ? 'trash-outline' : 'repeat'}
              size={19}
              color={isDelete ? colors.destructive : colors.onPrimary}
            />
            <View style={styles.optionText}>
              <Text
                style={[
                  styles.optionTitle,
                  { color: isDelete ? colors.destructive : colors.onPrimary },
                ]}
              >
                {isDelete ? 'Eliminar toda la rutina' : 'Todos los días'}
              </Text>
              <Text
                style={[
                  styles.optionHint,
                  {
                    color: isDelete ? colors.mutedForeground : colors.onPrimary,
                    opacity: isDelete ? 1 : 0.85,
                  },
                ]}
              >
                {isDelete ? 'Se quita de todos los días' : 'Aplica a toda la serie'}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.lg },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.callout },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.footnote,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 58,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  optionText: { flex: 1, gap: 1 },
  optionTitle: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  optionHint: { fontFamily: fontFamily.regular, fontSize: fontSize.caption },
  cancel: {
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  cancelText: { fontFamily: fontFamily.medium, fontSize: fontSize.footnote },
});
