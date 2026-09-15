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

import {
  buildBackup,
  buildExport,
  buildSample,
  parseBackup,
  parseImport,
} from '../storage/importExport';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { shadow } from '../theme/shadows';
import { MODES, useTheme, type ModePreference } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import type { Task, TaskDraft, Todo } from '../types/task';
import { toDayKey } from '../utils/date';
import { armedCount } from '../utils/notifications';
import { isSoundEnabled, playComplete, setSoundEnabled } from '../utils/sound';
import {
  enablePush,
  getState as getPushState,
  isRegistered,
  lastSync,
  sendTestPush,
  type PushState,
} from '../utils/webpush';

const MODE_LABELS: Record<ModePreference, string> = {
  system: 'Automático',
  light: 'Claro',
  dark: 'Oscuro',
};

type Props = {
  tasks: Task[];
  todos: Todo[];
  onImport: (tasks: TaskDraft[], replace: boolean) => number;
  onRestore: (tasks: Task[], todos: Todo[]) => void;
  onClear: (what: { tasks?: boolean; todos?: boolean; history?: boolean }) => void;
};

/** What a bulk-delete option removes, and how it is described before doing it. */
type ClearKind = 'tasks' | 'todos' | 'history' | 'all';

const CLEAR_COPY: Record<ClearKind, { label: string; title: string; message: string }> = {
  tasks: {
    label: 'Borrar todas las actividades',
    title: '¿Borrar todas las actividades?',
    message:
      'Se eliminarán todas las actividades del cronograma, incluidas las rutinas que se repiten. Los pendientes se conservan.',
  },
  todos: {
    label: 'Borrar todos los pendientes',
    title: '¿Borrar todos los pendientes?',
    message: 'Se eliminará la lista de pendientes de todos los días. El cronograma se conserva.',
  },
  history: {
    label: 'Borrar solo el historial',
    title: '¿Borrar el historial?',
    message:
      'Las actividades se conservan, pero se olvidará qué días las cumpliste: el reporte de progreso empezará de cero.',
  },
  all: {
    label: 'Borrar todo',
    title: '¿Borrar absolutamente todo?',
    message:
      'Se eliminarán las actividades, los pendientes y el historial de rachas. Guarda un respaldo antes si quieres poder recuperarlo.',
  },
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

export function SettingsScreen({ tasks, todos, onImport, onRestore, onClear }: Props) {
  const { colors, isDark, themeId, mode, options, setThemeId, setMode } = useTheme();
  const insets = useSafeAreaInsets();

  const [sound, setSound] = useState(isSoundEnabled());
  const [importText, setImportText] = useState('');
  const [replaceAll, setReplaceAll] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);
  const [pendingClear, setPendingClear] = useState<ClearKind | null>(null);

  const [armed, setArmed] = useState(0);
  const [pushState, setPushState] = useState<PushState>('unsupported');
  const [pushSync, setPushSync] = useState<{ at: number; count: number } | null>(null);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Push state can change outside this screen (permission granted, a sync
    // completing), so poll rather than read once on mount.
    const sync = () => {
      setArmed(armedCount());
      setPushState(getPushState());
      setPushSync(lastSync());
    };
    sync();
    const id = setInterval(sync, 2000);
    return () => clearInterval(id);
  }, []);

  // Whether the *server* knows this device — the part that actually decides
  // if a reminder can be delivered.
  useEffect(() => {
    if (pushState !== 'subscribed') {
      setRegistered(null);
      return;
    }
    let active = true;
    const check = () => {
      void isRegistered().then((value) => {
        if (active) setRegistered(value);
      });
    };
    check();
    const id = setInterval(check, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pushState, pushSync]);

  // How many activities still have a reminder ahead of them today.
  const withReminder = tasks.filter(
    (t) => t.startMinutes !== null && t.reminderMinutes !== null,
  ).length;

  const handleEnablePush = useCallback(async () => {
    void Haptics.selectionAsync();
    setBusy(true);
    const next = await enablePush(tasks);
    setPushState(next);
    setPushSync(lastSync());
    setBusy(false);
    if (next === 'subscribed') {
      setFeedback({
        tone: 'ok',
        message: 'Avisos activados. Ahora llegan aunque la app esté cerrada.',
      });
    } else if (next === 'denied') {
      setFeedback({
        tone: 'error',
        message: 'Bloqueadas. Actívalas en Ajustes de iOS → day2day → Notificaciones.',
      });
    } else if (next === 'needs-install') {
      setFeedback({
        tone: 'error',
        message: 'Primero añade la app a la pantalla de inicio desde Safari.',
      });
    }
  }, [tasks]);

  const handleTestPush = useCallback(async () => {
    void Haptics.selectionAsync();
    setBusy(true);
    const result = await sendTestPush(tasks);
    setBusy(false);
    setFeedback(
      result.ok
        ? {
            tone: 'ok',
            message: 'Enviado desde el servidor. Cierra la app: debería llegar igual.',
          }
        : { tone: 'error', message: result.error ?? 'No se pudo enviar.' },
    );
  }, [tasks]);

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

  const handleBackup = useCallback(async () => {
    void Haptics.selectionAsync();
    if (tasks.length === 0 && todos.length === 0) {
      setFeedback({ tone: 'error', message: 'Todavía no hay nada que respaldar.' });
      return;
    }
    const content = buildBackup(tasks, todos);
    const stamp = toDayKey(new Date());
    if (downloadJson(`day2day-respaldo-${stamp}.json`, content)) {
      setFeedback({ tone: 'ok', message: 'Respaldo descargado. Guárdalo en Archivos o envíatelo.' });
      return;
    }
    if (await copyToClipboard(content)) {
      setFeedback({
        tone: 'ok',
        message: 'Respaldo copiado. Pégalo en Notas o envíatelo para tenerlo a salvo.',
      });
    } else {
      setFeedback({ tone: 'error', message: 'No se pudo generar el respaldo en este navegador.' });
    }
  }, [tasks, todos]);

  const handleRestore = useCallback(() => {
    const result = parseBackup(importText);
    if (!result.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({ tone: 'error', message: result.error });
      return;
    }
    onRestore(result.tasks, result.todos);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setImportText('');
    setFeedback({
      tone: 'ok',
      message: `Restaurado: ${result.tasks.length} actividades y ${result.todos.length} pendientes, con tu historial.`,
    });
  }, [importText, onRestore]);

  const confirmClear = useCallback(() => {
    if (!pendingClear) return;
    const removed =
      pendingClear === 'tasks'
        ? { tasks: true }
        : pendingClear === 'todos'
          ? { todos: true }
          : pendingClear === 'history'
            ? { history: true }
            : { tasks: true, todos: true, history: true };
    onClear(removed);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFeedback({ tone: 'ok', message: 'Listo, ya se borró.' });
    setPendingClear(null);
  }, [pendingClear, onClear]);

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
          {pushState === 'subscribed'
            ? 'Activadas. El servidor envía los avisos, así que llegan aunque la app esté cerrada.'
            : pushState === 'denied'
              ? 'Bloqueadas. Actívalas en Ajustes de iOS → day2day → Notificaciones.'
              : pushState === 'needs-install'
                ? 'Para recibir avisos, añade la app a la pantalla de inicio desde Safari (Compartir → Añadir a pantalla de inicio).'
                : pushState === 'unsupported'
                  ? 'Este navegador no admite avisos.'
                  : 'Activa los avisos para que te lleguen a la hora de cada actividad.'}
        </Text>

        {pushState === 'subscribed' ? (
          <>
            <View style={[styles.statusRow, { borderColor: colors.border }]}>
              <Ionicons
                name={
                  registered === false
                    ? 'alert-circle-outline'
                    : registered && withReminder > 0
                      ? 'checkmark-circle'
                      : 'information-circle-outline'
                }
                size={16}
                color={
                  registered === false
                    ? colors.destructive
                    : registered && withReminder > 0
                      ? colors.accent
                      : colors.mutedForeground
                }
              />
              <Text style={[styles.cardHint, { color: colors.mutedForeground, flex: 1 }]}>
                {registered === false
                  ? 'El servidor todavía no reconoce este dispositivo. Toca "Enviar prueba" para registrarlo.'
                  : withReminder === 0
                    ? 'Ninguna actividad tiene aviso configurado. Ábrela y elige cuándo avisarte.'
                    : `${withReminder} ${withReminder === 1 ? 'actividad avisa' : 'actividades avisan'} a su hora.` +
                      (registered ? ' Registrado en el servidor.' : '')}
              </Text>
            </View>

            <Pressable
              onPress={handleTestPush}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: colors.border, opacity: busy ? 0.5 : pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="paper-plane-outline" size={16} color={colors.foreground} />
              <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                Enviar prueba desde el servidor
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={handleEnablePush}
            disabled={busy || pushState === 'denied' || pushState === 'unsupported'}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || pushState === 'denied' }}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity:
                  busy || pushState === 'denied' || pushState === 'unsupported'
                    ? 0.4
                    : pressed
                      ? 0.85
                      : 1,
              },
            ]}
          >
            <Ionicons name="notifications-outline" size={17} color={colors.onPrimary} />
            <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
              Activar notificaciones
            </Text>
          </Pressable>
        )}
      </View>

      {/* ---- Backup ---- */}
      <View style={card}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Respaldo</Text>
        <Text style={[styles.cardHint, { color: colors.mutedForeground }]}>
          Tus datos viven solo en este dispositivo. Guarda un respaldo de vez en cuando: incluye
          el cronograma, los pendientes y tu historial de rachas.
        </Text>

        <Pressable
          onPress={handleBackup}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="save-outline" size={17} color={colors.onPrimary} />
          <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
            Guardar respaldo
          </Text>
        </Pressable>

        <Text style={[styles.cardHint, { color: colors.mutedForeground, marginTop: spacing.xs }]}>
          Para recuperarlo, pega el contenido del respaldo abajo y toca Restaurar.
        </Text>
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

        <Pressable
          onPress={handleRestore}
          accessibilityRole="button"
          accessibilityState={{ disabled: importText.trim().length === 0 }}
          style={({ pressed }) => [
            styles.secondaryBtn,
            {
              borderColor: colors.border,
              opacity: importText.trim().length === 0 ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.foreground} />
          <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
            Restaurar respaldo
          </Text>
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

      {/* ---- Danger zone ---- */}
      <View style={[...card, { borderColor: colors.destructive }]}>
        <Text style={[styles.cardTitle, { color: colors.destructive }]}>Borrar datos</Text>
        <Text style={[styles.cardHint, { color: colors.mutedForeground }]}>
          No se puede deshacer. Si quieres poder volver atrás, guarda un respaldo primero.
        </Text>

        {(['tasks', 'todos', 'history', 'all'] as ClearKind[]).map((kind) => {
          const isAll = kind === 'all';
          const disabled =
            (kind === 'tasks' && tasks.length === 0) ||
            (kind === 'todos' && todos.length === 0) ||
            (isAll && tasks.length === 0 && todos.length === 0);
          return (
            <Pressable
              key={kind}
              onPress={() => {
                void Haptics.selectionAsync();
                setPendingClear(kind);
              }}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                {
                  borderColor: isAll ? colors.destructive : colors.border,
                  opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons
                name={isAll ? 'trash' : 'trash-outline'}
                size={16}
                color={isAll ? colors.destructive : colors.foreground}
              />
              <Text
                style={[
                  styles.secondaryBtnText,
                  { color: isAll ? colors.destructive : colors.foreground },
                ]}
              >
                {CLEAR_COPY[kind].label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ConfirmDialog
        visible={pendingClear !== null}
        title={pendingClear ? CLEAR_COPY[pendingClear].title : ''}
        message={pendingClear ? CLEAR_COPY[pendingClear].message : ''}
        confirmLabel="Sí, borrar"
        destructive
        onCancel={() => setPendingClear(null)}
        onConfirm={confirmClear}
      />

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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
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
