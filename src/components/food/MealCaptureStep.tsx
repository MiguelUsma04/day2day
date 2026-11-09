import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { slotLabel } from '../../lib/nutrition/format';
import { Ionicons } from '../../theme/Ionicons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../../theme/tokens';
import { MEAL_SLOTS, type MealSlot } from '../../types/nutrition';
import { Chip, sheetStyles } from './Sheet';

/** Minimal Web Speech API surface we use (not in the TS DOM lib). */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Dictation in es-CO; `supported` is false where the browser has no Web Speech API. */
function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const ref = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const Ctor = recognitionCtor();

  useEffect(() => () => ref.current?.stop(), []);

  const toggle = () => {
    if (!Ctor) return;
    if (listening) {
      ref.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = 'es-CO';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (text) onTextRef.current(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    ref.current = rec;
    setListening(true);
    rec.start();
  };

  return { supported: Ctor !== null, listening, toggle };
}

export function SlotChips({ slot, onChange }: { slot: MealSlot; onChange: (s: MealSlot) => void }) {
  return (
    <View style={sheetStyles.chips}>
      {MEAL_SLOTS.map((s) => (
        <Chip key={s} label={slotLabel(s)} active={s === slot} onPress={() => onChange(s)} />
      ))}
    </View>
  );
}

type Props = {
  mode: 'photo' | 'text';
  slot: MealSlot;
  onSlot: (s: MealSlot) => void;
  note: string;
  onNote: (note: string) => void;
  previewUrl: string | null;
  onPickPhoto: () => void;
  analyzing: boolean;
  error: string | null;
  onSearch: () => void;
};

/** Step 1: photo and/or note, plus the slot. */
export function MealCaptureStep({
  mode,
  slot,
  onSlot,
  note,
  onNote,
  previewUrl,
  onPickPhoto,
  analyzing,
  error,
  onSearch,
}: Props) {
  const { colors } = useTheme();
  const dictation = useDictation((text) => onNote(note.trim() ? `${note.trim()} ${text}` : text));

  if (analyzing) {
    return (
      <View style={styles.analyzing}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.analyzingText, { color: colors.mutedForeground }]}>Analizando… ~10 s</Text>
      </View>
    );
  }

  return (
    <>
      {mode === 'photo' ? (
        <View style={styles.photoRow}>
          {previewUrl ? (
            <Image source={{ uri: previewUrl }} style={[styles.thumb, { borderColor: colors.border }]} />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Ionicons name="camera-outline" size={28} color={colors.mutedForeground} />
            </View>
          )}
          <Pressable
            onPress={onPickPhoto}
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.secondaryText, { color: colors.foreground }]}>
              {previewUrl ? 'Cambiar foto' : 'Tomar foto'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={sheetStyles.field}>
        <View style={styles.noteHeader}>
          <Text style={[sheetStyles.label, { color: colors.foreground }]}>
            {mode === 'photo' ? 'Nota (opcional)' : '¿Qué comiste?'}
          </Text>
          {dictation.supported ? (
            <Pressable
              onPress={dictation.toggle}
              accessibilityRole="button"
              accessibilityLabel={dictation.listening ? 'Detener dictado' : 'Dictar'}
              style={({ pressed }) => [
                styles.mic,
                {
                  backgroundColor: dictation.listening ? colors.primary : colors.muted,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={styles.micText}>🎤</Text>
            </Pressable>
          ) : null}
        </View>
        <TextInput
          value={note}
          onChangeText={onNote}
          multiline
          placeholder={mode === 'photo' ? 'Ej. el arroz tenía aceite' : 'Ej. arroz con pollo y ensalada, un jugo de mora'}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.note, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
      </View>

      <View style={sheetStyles.field}>
        <Text style={[sheetStyles.label, { color: colors.foreground }]}>Momento</Text>
        <SlotChips slot={slot} onChange={onSlot} />
      </View>

      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

      <Pressable onPress={onSearch} accessibilityRole="button" style={styles.searchLink} hitSlop={8}>
        <Text style={[styles.link, { color: colors.primary }]}>Buscar alimento</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  analyzing: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  analyzingText: { fontFamily: fontFamily.medium, fontSize: fontSize.footnote },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 96, height: 96, borderRadius: radius.md, borderWidth: 1 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  secondary: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    justifyContent: 'center',
  },
  secondaryText: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
  noteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mic: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  micText: { fontSize: 18 },
  note: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    textAlignVertical: 'top',
  },
  error: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  searchLink: { alignSelf: 'flex-start', minHeight: TOUCH_TARGET, justifyContent: 'center' },
  link: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
});
