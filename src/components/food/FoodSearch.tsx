import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { searchFoods } from '../../lib/nutrition/api';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, palette, radius, spacing, TOUCH_TARGET } from '../../theme/tokens';
import type { FoodHit, FoodSource } from '../../types/nutrition';
import { sheetStyles } from './Sheet';

const DEBOUNCE_MS = 250;

const SOURCE_LABELS: Record<FoodSource, string> = {
  tcac: 'TCAC',
  usda: 'USDA',
  off: 'Open Food Facts',
  user: 'Mío',
  ai: 'IA',
};

/** "TCAC · 130 kcal/100 g". */
export function sourceLine(source: FoodSource, kcalPer100: number): string {
  return `${SOURCE_LABELS[source]} · ${Math.round(kcalPer100)} kcal/100 g`;
}

/** Amber that stays readable on both light and dark surfaces. */
export function amberText(isDark: boolean): string {
  return isDark ? palette.amber500 : '#B45309';
}

type Props = {
  onPick: (hit: FoodHit) => void;
  onCancel: () => void;
};

/** Food database search (TCAC / USDA / own foods) with a debounced query. */
export function FoodSearch({ onPick, onCancel }: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FoodHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchFoods(q)
        .then((res) => {
          if (cancelled) return;
          setHits(res);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo buscar');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <View style={sheetStyles.field}>
      <View style={styles.headerRow}>
        <Text style={[sheetStyles.label, { color: colors.foreground }]}>Buscar alimento</Text>
        <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.link, { color: colors.primary }]}>Cancelar</Text>
        </Pressable>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Ej. arroz blanco, huevo, arepa…"
        placeholderTextColor={colors.mutedForeground}
        autoFocus
        autoCorrect={false}
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
      />
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={[styles.meta, { color: colors.destructive }]}>{error}</Text> : null}
      {!loading && !error && query.trim() && hits.length === 0 ? (
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>Sin resultados</Text>
      ) : null}
      {hits.map((hit) => (
        <Pressable
          key={hit.id}
          onPress={() => onPick(hit)}
          accessibilityRole="button"
          accessibilityLabel={`Agregar ${hit.name_es}`}
          style={({ pressed }) => [
            styles.hit,
            { borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.surface },
          ]}
        >
          <Text style={[styles.hitName, { color: colors.foreground }]} numberOfLines={2}>
            {hit.name_es}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>{sourceLine(hit.source, hit.kcal)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
  input: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
  },
  hit: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  hitName: { fontFamily: fontFamily.medium, fontSize: fontSize.footnote },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.caption },
});
