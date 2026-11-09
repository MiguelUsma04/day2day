import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopInsetTakenProvider } from '../components/HeaderInset';
import { PersonSwitcher } from '../components/PersonSwitcher';
import { TabBar, type TabId } from '../components/TabBar';
import { ViewingBanner } from '../components/ViewingBanner';
import { resolveDayMode, toDayModeMap } from '../storage/dayModes';
import { markedDaysOf, tasksForDay, todosForDay } from '../storage/dayView';
import { readOnlyNutritionStore, type PartnerSnapshot } from '../storage/partner';
import { useNutrition } from '../storage/useNutrition';
import { useTasks } from '../storage/useTasks';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/tokens';
import { toDayKey } from '../utils/date';
import { useAuth } from '../auth/AuthProvider';
import { usePartner } from '../auth/PartnerProvider';
import { scheduleReminders } from '../utils/notifications';
import { syncReminders, uploadBeacon } from '../utils/webpush';
import { FoodScreen } from './FoodScreen';
import { ReportScreen } from './ReportScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { SettingsScreen } from './SettingsScreen';
import { TodosScreen } from './TodosScreen';

const EMPTY_SNAPSHOT: PartnerSnapshot = {
  tasks: [],
  todos: [],
  dayModes: [],
  meals: [],
  weights: [],
  sleepLogs: [],
  workouts: [],
  profile: null,
  measurements: [],
};

const noop = () => {};

/**
 * Owns the shared state (selected day, tasks, todos) so switching tabs keeps
 * the same day in view rather than resetting to today.
 */
export function RootScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const store = useTasks(user?.id ?? null);
  const nutrition = useNutrition(user?.id ?? null);
  const partnerView = usePartner();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabId>('schedule');
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  /**
   * Reminders are armed from the whole task list, not the day on screen, and
   * re-armed whenever the app returns to the foreground: in-page timers do not
   * survive a suspended tab, which is the usual state of an installed PWA.
   */
  // Keep the server's copy of the reminders current; it is what sends the
  // pushes that survive the app being closed. Also re-sync when the app comes
  // back to the foreground: iOS revokes push subscriptions on its own, and a
  // stale one means the reminders silently stop arriving.
  useEffect(() => {
    if (store.isLoading) return;
    void syncReminders(store.tasks, store.dayModes);

    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncReminders(store.tasks, store.dayModes);
      } else {
        // Leaving the app cancels a pending fetch, so an edit made just before
        // closing would never reach the server. A beacon survives teardown.
        uploadBeacon(store.tasks, store.dayModes);
      }
    };
    const onHide = () => uploadBeacon(store.tasks, store.dayModes);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onHide);
    };
  }, [store.tasks, store.dayModes, store.isLoading]);

  useEffect(() => {
    if (store.isLoading) return;
    scheduleReminders(store.tasks, store.dayModes);

    const rearm = () => scheduleReminders(store.tasks, store.dayModes);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') rearm();
    });

    let detachVisibility: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') rearm();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', rearm);
      detachVisibility = () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', rearm);
      };
    }

    return () => {
      sub.remove();
      detachVisibility?.();
    };
  }, [store.tasks, store.dayModes, store.isLoading]);

  // The partner's day is derived from an in-memory snapshot with the same pure
  // helpers useTasks uses; nothing of it ever reaches the local store.
  const viewingPartner = partnerView.viewing === 'partner';
  const snapshot = partnerView.snapshot ?? EMPTY_SNAPSHOT;
  const partnerDayModes = useMemo(() => toDayModeMap(snapshot.dayModes), [snapshot.dayModes]);
  const partnerMarked = useMemo(
    () => markedDaysOf(snapshot.tasks, snapshot.todos),
    [snapshot.tasks, snapshot.todos],
  );
  const partnerNutrition = useMemo(() => readOnlyNutritionStore(snapshot), [snapshot]);
  const { addTodoForPartner } = partnerView;
  const addPartnerTodo = useCallback(
    (title: string, date: string) => {
      // The failure is shown in the viewing banner; nothing else to do here.
      addTodoForPartner(title, date).catch(noop);
    },
    [addTodoForPartner],
  );

  const dayKey = toDayKey(selectedDate);
  const tasks = viewingPartner
    ? tasksForDay(snapshot.tasks, partnerDayModes, dayKey)
    : store.getTasksForDay(dayKey);
  const todos = viewingPartner ? todosForDay(snapshot.todos, dayKey) : store.getTodosForDay(dayKey);
  const markedDays = viewingPartner ? partnerMarked : store.markedDays;
  const dayModes = viewingPartner ? partnerDayModes : store.dayModes;
  const dayMode = viewingPartner ? resolveDayMode(partnerDayModes, dayKey) : store.getDayMode(dayKey);
  // The tab badge always counts my own pending items.
  const pendingCount = store.getTodosForDay(dayKey).filter((t) => !t.done).length;

  // With the switcher on top, it takes the status-bar inset, so the tab
  // headers (via useHeaderInset) skip it. Modals keep the real insets.
  const hasSwitcher = partnerView.partner !== null;

  if (store.isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {hasSwitcher ? (
        <View style={[styles.switcher, { paddingTop: insets.top + spacing.sm }]}>
          <PersonSwitcher />
          <ViewingBanner />
        </View>
      ) : null}

      <TopInsetTakenProvider value={hasSwitcher}>
        <View style={styles.body}>
          {tab === 'schedule' ? (
            <ScheduleScreen
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              markedDays={markedDays}
              dayModes={dayModes}
              dayMode={dayMode}
              onSetDayMode={viewingPartner ? noop : store.setDayMode}
              tasks={tasks}
              onToggle={viewingPartner ? noop : store.toggleTask}
              onAdd={viewingPartner ? noop : store.addTask}
              onUpdate={viewingPartner ? noop : store.updateTask}
              onDelete={viewingPartner ? noop : store.deleteTask}
              onSkip={viewingPartner ? noop : store.skipOccurrence}
              readOnly={viewingPartner}
            />
          ) : null}

          {tab === 'todos' ? (
            <TodosScreen
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              markedDays={markedDays}
              todos={todos}
              onAdd={viewingPartner ? addPartnerTodo : store.addTodo}
              onToggle={viewingPartner ? noop : store.toggleTodo}
              onDelete={viewingPartner ? noop : store.deleteTodo}
              onRename={viewingPartner ? noop : store.updateTodo}
              onMove={viewingPartner ? noop : store.moveTodo}
              onReorder={viewingPartner ? noop : store.reorderTodo}
              readOnly={viewingPartner}
            />
          ) : null}

          {tab === 'food' ? (
            <FoodScreen
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              markedDays={markedDays}
              nutrition={viewingPartner ? partnerNutrition : nutrition}
              readOnly={viewingPartner}
              onOpenProfile={viewingPartner ? noop : () => setTab('settings')}
            />
          ) : null}

          {tab === 'report' ? (
            <ReportScreen
              tasks={viewingPartner ? snapshot.tasks : store.tasks}
              todos={viewingPartner ? snapshot.todos : store.todos}
              dayModes={dayModes}
            />
          ) : null}

          {tab === 'settings' ? (
            // Settings are always mine; the partner's profile is never editable here.
            <SettingsScreen
              tasks={store.tasks}
              todos={store.todos}
              dayModes={store.dayModes}
              dayModeList={store.dayModeList}
              cloud={store.cloud}
              onImport={store.importTasks}
              onRestore={store.restoreBackup}
              onClear={store.clearData}
              nutrition={viewingPartner ? undefined : nutrition}
            />
          ) : null}
        </View>
      </TopInsetTakenProvider>

      <TabBar current={tab} onChange={setTab} pendingCount={pendingCount} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  switcher: { gap: spacing.xs, paddingHorizontal: spacing.lg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
