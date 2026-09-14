import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../components/EmptyState';
import { StreakCalendar } from '../components/StreakCalendar';
import { computeStats, type HabitScore } from '../storage/stats';
import { categoryMeta, categoryTint } from '../theme/categories';
import type { IconName } from '../theme/icons';
import { shadow } from '../theme/shadows';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../theme/tokens';
import type { Task, Todo } from '../types/task';

const WINDOWS = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
];

type Props = {
  tasks: Task[];
  todos: Todo[];
};

/** Plain-language verdict, so the numbers arrive with an interpretation. */
function verdict(rate: number, activeDays: number): { text: string; icon: IconName } {
  if (activeDays === 0) return { text: 'Aún no hay días con actividades.', icon: 'time-outline' };
  if (rate >= 0.85) return { text: 'Vas muy bien. Estás cumpliendo casi todo lo que planeas.', icon: 'trophy-outline' };
  if (rate >= 0.6) return { text: 'Buen ritmo. Cumples la mayoría de lo que te propones.', icon: 'trending-up-outline' };
  if (rate >= 0.35) return { text: 'Vas a medias. Puede que estés planeando más de lo que cabe en el día.', icon: 'analytics-outline' };
  return { text: 'Se te está escapando el plan. Prueba con menos actividades y horarios más realistas.', icon: 'alert-circle-outline' };
}

export function ReportScreen({ tasks, todos }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [windowDays, setWindowDays] = useState(30);

  const stats = useMemo(
    () => computeStats(tasks, todos, windowDays),
    [tasks, todos, windowDays],
  );

  const card = [
    styles.card,
    shadow('sm', isDark),
    { backgroundColor: colors.surface, borderColor: colors.border },
  ];

  const pct = Math.round(stats.overallRate * 100);
  const summary = verdict(stats.overallRate, stats.activeDays);

  const renderHabit = (habit: HabitScore, tone: 'good' | 'bad') => {
    const meta = categoryMeta[habit.category];
    const icon = (habit.icon as IconName | undefined) ?? meta.icon;
    const habitPct = Math.round(habit.rate * 100);
    return (
      <View key={habit.id} style={styles.habitRow}>
        <View style={[styles.habitIcon, { backgroundColor: categoryTint(habit.category, isDark) }]}>
          <Ionicons name={icon} size={15} color={meta.color} />
        </View>

        <View style={styles.habitText}>
          <Text numberOfLines={1} style={[styles.habitTitle, { color: colors.foreground }]}>
            {habit.title}
          </Text>
          <Text style={[styles.habitMeta, { color: colors.mutedForeground }]}>
            {habit.done} de {habit.scheduled} veces
          </Text>
        </View>

        <View
          style={[
            styles.habitBadge,
            {
              backgroundColor: tone === 'good' ? colors.accent : colors.muted,
              borderColor: tone === 'good' ? colors.accent : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.habitPct,
              { color: tone === 'good' ? colors.onPrimary : colors.foreground },
            ]}
          >
            {habitPct}%
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.screenTitle, { color: colors.foreground }]}>Tu progreso</Text>

      <View style={styles.chipRow}>
        {WINDOWS.map((w) => {
          const active = w.days === windowDays;
          return (
            <Pressable
              key={w.days}
              onPress={() => {
                void Haptics.selectionAsync();
                setWindowDays(w.days);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.surface,
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
                {w.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {stats.isEmpty ? (
        <EmptyState
          title="Todavía no hay datos"
          description="Cuando lleves unos días marcando tus actividades, aquí verás qué tan constante estás siendo."
        />
      ) : (
        <>
          {/* ---- Headline ---- */}
          <View style={card}>
            <View style={styles.headlineRow}>
              <View style={styles.headlineText}>
                <Text style={[styles.bigNumber, { color: colors.foreground }]}>{pct}%</Text>
                <Text style={[styles.bigLabel, { color: colors.mutedForeground }]}>
                  de lo planeado, cumplido
                </Text>
              </View>
              <View style={[styles.verdictIcon, { backgroundColor: colors.muted }]}>
                <Ionicons name={summary.icon} size={24} color={colors.primary} />
              </View>
            </View>

            <View style={[styles.track, { backgroundColor: colors.muted }]}>
              <View
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: pct >= 85 ? colors.accent : colors.primary,
                }}
              />
            </View>

            <Text style={[styles.verdictText, { color: colors.foreground }]}>{summary.text}</Text>
            <Text style={[styles.cardHint, { color: colors.mutedForeground }]}>
              {stats.totalDone} de {stats.totalScheduled} actividades en {stats.activeDays}{' '}
              {stats.activeDays === 1 ? 'día' : 'días'} con plan.
            </Text>
          </View>

          {/* ---- Streaks ---- */}
          <View style={styles.statRow}>
            <View style={[...card, styles.statCard]}>
              <Ionicons name="flame" size={20} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {stats.currentStreak}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                {stats.currentStreak === 1 ? 'día seguido' : 'días seguidos'}
              </Text>
            </View>

            <View style={[...card, styles.statCard]}>
              <Ionicons name="trophy" size={20} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {stats.bestStreak}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>mejor racha</Text>
            </View>

            <View style={[...card, styles.statCard]}>
              <Ionicons name="checkmark-done" size={20} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {stats.perfectDays}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                {stats.perfectDays === 1 ? 'día perfecto' : 'días perfectos'}
              </Text>
            </View>
          </View>

          {/* ---- Calendar ---- */}
          <View style={card}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Día a día</Text>
            <StreakCalendar days={stats.days} />
          </View>

          {/* ---- Habits ---- */}
          {stats.best.length > 0 ? (
            <View style={card}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                Lo que mejor cumples
              </Text>
              {stats.best.map((h) => renderHabit(h, 'good'))}
            </View>
          ) : null}

          {stats.worst.length > 0 ? (
            <View style={card}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                Lo que más se te escapa
              </Text>
              <Text style={[styles.cardHint, { color: colors.mutedForeground }]}>
                Quizá convenga moverlas de hora o dejarlas para menos días.
              </Text>
              {stats.worst.map((h) => renderHabit(h, 'bad'))}
            </View>
          ) : null}

          {stats.todosTotal > 0 ? (
            <View style={card}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Pendientes</Text>
              <Text style={[styles.cardHint, { color: colors.mutedForeground }]}>
                Completaste {stats.todosDone} de {stats.todosTotal} en este periodo.
              </Text>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  screenTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.headline },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  cardHint: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18 },
  headlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headlineText: { gap: 2 },
  bigNumber: { fontFamily: fontFamily.bold, fontSize: 44, lineHeight: 50 },
  bigLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  verdictIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { height: 8, borderRadius: 999, overflow: 'hidden', marginTop: spacing.xs },
  verdictText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.footnote,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  statValue: { fontFamily: fontFamily.bold, fontSize: fontSize.title },
  statLabel: { fontFamily: fontFamily.regular, fontSize: 11, textAlign: 'center' },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
  },
  habitIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitText: { flex: 1, gap: 1 },
  habitTitle: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
  habitMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.caption },
  habitBadge: {
    minWidth: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
  },
  habitPct: { fontFamily: fontFamily.bold, fontSize: fontSize.caption },
});
