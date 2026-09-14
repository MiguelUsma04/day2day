import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildExport, buildSample, parseImport } from '../storage/importExport';
import { shadow } from '../theme/shadows';
import { MODES, useTheme, type ModePreference } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import type { Task, TaskDraft } from '../types/task';
import { toDayKey } from '../utils/date';
import {
  getPermission,
  isStandalone,
  requestPermission,
  sendTestNotification,
  type PermissionState,
} from '../utils/notifications';
import { isSoundEnabled, playComplete, setSoundEnabled } from '../utils/sound';

const MODE_LABELS: Record<ModePreference, string> = {
  system: 'Automático',
  light: 'Claro',
  dark: 'Oscuro',
};

type Props = {
  tasks: Task[];
  onImport: (tasks: TaskDraft[], replace: boolean) => number;
};

/** Triggers a file download in the browser; a no-op elsewhere. */
function downloadJson(filename: string, content: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  try {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke on the next tick so Safari has time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SettingsScreen({ tasks, onImport }: Props) {
  const { colors, isDark, themeId, mode, options, setThemeId, setMode } = useTheme();
  const insets = useSafeAreaInsets();

  const [permission, setPermission] = useState<PermissionState>('unsupported');
  const [sound, setSound] = useState(isSoundEnabled());
  const [importText, setImportText] = useState('');
  const [replaceAll, setReplaceAll] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setPermission(getPermission());
  }, []);

  const askPermission = useCallback(async () => {
    void Haptics.selectionAsync();
    const result = await requestPermission();
    setPermission(result);
    if (result === 'granted') {
      await sendTestNotification();
      setFeedback({ tone: 'ok', message: 'Listo. Te acabamos de enviar una notificación de prueba.' });
    } else if (result === 'denied') {
      setFeedback({
        tone: 'error',
        message: 'Las notificaciones están bloqueadas. Actívalas en Ajustes de iOS → day2day.',
      });
    }
  }, []);

  const handleImport = useCallback(() => {
    const result = parseImport(importText, toDayKey(new Date()));
    if (!result.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({ tone: 'error', message: result.error });
      return;
    }
    const count = onImport(result.tasks, replaceAll);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setImportText('');
    setFeedback({
      tone: 'ok',
      message:
        `Se importaron ${count} actividades.` +
        (result.warnings.length ? ` Avisos: ${result.warnings.slice(0, 3).join(' ')}` : ''),
    });
  }, [importText, replaceAll, onImport]);

  const handleSample = useCallback(async () => {
    void Haptics.selectionAsync();
    const sample = buildSample();
    if (downloadJson('day2day-ejemplo.json', sample)) {
      setFeedback({ tone: 'ok', message: 'Se descargó day2day-ejemplo.json.' });
      return;
    }
    // iOS standalone blocks downloads, so fall back to the clipboard.
    if (await copyToClipboard(sample)) {
      setFeedback({ tone: 'ok', message: 'Ejemplo copiado al portapapeles.' });
    } else {
      setImportText(sample);
      setFeedback({ tone: 'ok', message: 'Ejemplo cargado abajo para que lo veas.' });
    }
  }, []);

  const handleExport = useCallback(async () => {
    void Haptics.selectionAsync();
    if (tasks.length === 0) {
      setFeedback({ tone: 'error', message: 'Todavía no hay actividades que exportar.' });
      return;
    }
    const content = buildExport(tasks);
    if (downloadJson('day2day-cronograma.json', content)) {
      setFeedback({ tone: 'ok', message: 'Se descargó tu cronograma.' });
      return;
    }
    if (await copyToClipboard(content)) {
      setFeedback({ tone: 'ok', message: 'Cronograma copiado al portapapeles.' });
    } else {
      setFeedback({ tone: 'error', message: 'No se pudo exportar en este navegador.' });
    }
  }, [tasks]);

  const card = [
    styles.card,
    shadow('sm', isDark),
    { backgroundColor: colors.surface, borderColor: colors.border },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.screenTitle, { color: colors.foreground }]}>Ajustes</Text>

      {/* ---- Appearance ---- */}
      <View style={card}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Color de la app</Text>
        <Text style={[styles.cardHint, { color: colors.mutedForeground }]}>
          Cambia toda la interfaz, no solo un detalle.
        </Text>

        <View style={styles.swatchRow}>
          {options.map((option) => {
            const active = option.id === themeId;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setThemeId(option.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option.label}
                style={styles.swatchWrap}
              >
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: option.swatch,
                      borderColor: active ? colors.foreground : 'transparent',
                    },
                  ]}
                >
                  {active ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
                </View>
                <Text
                  style={[
                    styles.swatchLabel,
                    {
                      color: active ? colors.foreground : colors.mutedForeground,
                      fontFamily: active ? fontFamily.semibold : fontFamily.regular,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.cardTitle, { color: colors.foreground, marginTop: spacing.md }]}>
          Modo
        </Text>
        <View style={styles.chipRow}>
          {MODES.map((m) => {
            const active = m === mode;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMode(m);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.muted,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? colors.onPrimary : colors.foreground },
                  ]}
                >
                  {MODE_LABELS[m]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ---- Sound & notifications ---- */}
      <View style={card}>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Sonido</Text>
            <Text style={[styles.cardHint, { color: colors.mutedForeground }]}>
              Suena al completar una actividad.
            </Text>
          </View>
          <Switch
            value={sound}
            onValueChange={(value) => {
              setSound(value);
              setSoundEnabled(value);
              if (value) playComplete();
            }}
            accessibilityLabel="Sonido al completar"
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Notificaciones</Text>
        <Text style={[styles.cardHint, { color: colors.mutedForeground }]}>
          {permission === 'granted'
            ? 'Activadas. Los recordatorios llegan mientras la app haya estado abierta durante el día.'
            : permission === 'denied'
              ? 'Bloqueadas. Actívalas en Ajustes de iOS → day2day → Notificaciones.'
              : isStandalone()
                ? 'Activa los avisos para tus recordatorios.'
                : 'Para recibir avisos en el iPhone, primero añade la app a la pantalla de inicio desde Safari (Compartir → Añadir a pantalla de inicio).'}
        </Text>

        {permission !== 'granted' ? (
          <Pressable
            onPress={askPermission}
            accessibilityRole="button"
            disabled={permission === 'denied'}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: permission === 'denied' ? 0.4 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons name="notifications-outline" size={17} color={colors.onPrimary} />
            <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
              Activar notificaciones
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              void sendTestNotification();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
              Enviar notificación de prueba
            </Text>
          </Pressable>
        )}
      </View>

      {/* ---- Import / export ---- */}
      <View style={card}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Importar cronograma</Text>
        <Text style={[styles.cardHint, { color: colors.mutedForeground }]}>
          Pega aquí un JSON con todas tus actividades y se crean de una vez. Descarga el ejemplo
          para ver el formato exacto.
        </Text>

        <View style={styles.btnRow}>
          <Pressable
            onPress={handleSample}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.secondaryBtn,
              styles.flexBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="download-outline" size={16} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Ejemplo</Text>
          </Pressable>

          <Pressable
            onPress={handleExport}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.secondaryBtn,
              styles.flexBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="share-outline" size={16} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Exportar</Text>
          </Pressable>
        </View>

        <TextInput
          value={importText}
          onChangeText={setImportText}
          placeholder='[{"title": "Despertar", "time": "06:00", "repeat": "daily"}]'
          placeholderTextColor={colors.mutedForeground}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="JSON del cronograma"
          style={[
            styles.textarea,
            { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border },
          ]}
        />

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={[styles.optionLabel, { color: colors.foreground }]}>
              Reemplazar lo existente
            </Text>
            <Text style={[styles.cardHint, { color: colors.mutedForeground }]}>
              {replaceAll
                ? 'Se borrarán las actividades actuales.'
                : 'Las nuevas se suman a las que ya tienes.'}
            </Text>
          </View>
          <Switch
            value={replaceAll}
            onValueChange={setReplaceAll}
            accessibilityLabel="Reemplazar actividades existentes"
            trackColor={{ true: colors.destructive, false: colors.border }}
          />
        </View>

        <Pressable
          onPress={handleImport}
          accessibilityRole="button"
          accessibilityState={{ disabled: importText.trim().length === 0 }}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: colors.primary,
              opacity: importText.trim().length === 0 ? 0.4 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Ionicons name="cloud-upload-outline" size={17} color={colors.onPrimary} />
          <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Importar</Text>
        </Pressable>

        {feedback ? (
          <View
            style={[
              styles.feedback,
              {
                backgroundColor: feedback.tone === 'ok' ? colors.muted : 'transparent',
                borderColor: feedback.tone === 'ok' ? colors.border : colors.destructive,
              },
            ]}
          >
            <Ionicons
              name={feedback.tone === 'ok' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={17}
              color={feedback.tone === 'ok' ? colors.accent : colors.destructive}
            />
            <Text
              style={[
                styles.feedbackText,
                { color: feedback.tone === 'ok' ? colors.foreground : colors.destructive },
              ]}
            >
              {feedback.message}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.footer, { color: colors.mutedForeground }]}>
        Tus datos se guardan solo en este dispositivo.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  screenTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.headline },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  cardHint: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  swatchWrap: { alignItems: 'center', gap: 4, width: 62 },
  swatch: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.pill,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: { fontSize: fontSize.caption },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchText: { flex: 1, gap: 2 },
  optionLabel: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  divider: { height: 1, marginVertical: spacing.sm },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  primaryBtnText: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  secondaryBtnText: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  flexBtn: { flex: 1 },
  textarea: {
    minHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.label,
    textAlignVertical: 'top',
    marginTop: spacing.xs,
  },
  feedback: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  feedbackText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18 },
  footer: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, textAlign: 'center' },
});
