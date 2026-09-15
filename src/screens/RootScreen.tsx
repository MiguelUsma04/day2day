import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from 'react-native';

import { TabBar, type TabId } from '../components/TabBar';
import { useTasks } from '../storage/useTasks';
import { useTheme } from '../theme/ThemeProvider';
import { toDayKey } from '../utils/date';
import { scheduleReminders } from '../utils/notifications';
import { syncReminders } from '../utils/webpush';
import { ReportScreen } from './ReportScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { SettingsScreen } from './SettingsScreen';
import { TodosScreen } from './TodosScreen';

/**
 * Owns the shared state (selected day, tasks, todos) so switching tabs keeps
 * the same day in view rather than resetting to today.
 */
export function RootScreen() {
  const { colors } = useTheme();
  const store = useTasks();
  const [tab, setTab] = useState<TabId>('schedule');
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  /**
   * Reminders are armed from the whole task list, not the day on screen, and
   * re-armed whenever the app returns to the foreground: in-page timers do not
   * survive a suspended tab, which is the usual state of an installed PWA.
   */
  // Keep the server's copy of the reminders current; it is what sends the
  // pushes that survive the app being closed.
  useEffect(() => {
    if (store.isLoading) return;
    void syncReminders(store.tasks);
  }, [store.tasks, store.isLoading]);

  useEffect(() => {
    if (store.isLoading) return;
    scheduleReminders(store.tasks);

    const rearm = () => scheduleReminders(store.tasks);
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
  }, [store.tasks, store.isLoading]);

  const dayKey = toDayKey(selectedDate);
  const tasks = store.getTasksForDay(dayKey);
  const todos = store.getTodosForDay(dayKey);
  const pendingCount = todos.filter((t) => !t.done).length;

  if (store.isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        {tab === 'schedule' ? (
          <ScheduleScreen
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            markedDays={store.markedDays}
            tasks={tasks}
            onToggle={store.toggleTask}
            onAdd={store.addTask}
            onUpdate={store.updateTask}
            onDelete={store.deleteTask}
            onSkip={store.skipOccurrence}
          />
        ) : null}

        {tab === 'todos' ? (
          <TodosScreen
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            markedDays={store.markedDays}
            todos={todos}
            onAdd={store.addTodo}
            onToggle={store.toggleTodo}
            onDelete={store.deleteTodo}
          />
        ) : null}

        {tab === 'report' ? <ReportScreen tasks={store.tasks} todos={store.todos} /> : null}

        {tab === 'settings' ? (
          <SettingsScreen
            tasks={store.tasks}
            todos={store.todos}
            onImport={store.importTasks}
            onRestore={store.restoreBackup}
            onClear={store.clearData}
          />
        ) : null}
      </View>

      <TabBar current={tab} onChange={setTab} pendingCount={pendingCount} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
