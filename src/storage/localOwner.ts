import AsyncStorage from '@react-native-async-storage/async-storage';

import { MEAL_DRAFT_KEY } from '../components/food/mealDraft';
import { NUTRITION_KEYS } from './nutritionStore';
import { QUEUE_KEY, resetQueue } from './syncQueue';
import { DAY_MODES_KEY, TASKS_KEY, TODOS_KEY } from './tasks';

/**
 * Which account the data on this device belongs to.
 *
 * The local store is one set of keys, not one per account. Without this check,
 * signing in as someone else on the same device hydrated the previous
 * account's routine, pulled the new account's on top, and showed both mixed.
 * (The server stayed clean only because RLS rejected the upload.)
 *
 * So the device remembers its owner, and a different account starts from an
 * empty store that the first pull fills from the server.
 */

export const OWNER_KEY = 'day2day:owner:v1';

const CURSOR_PREFIX = 'day2day:syncCursor:v1';

/** Everything that belongs to an account. Theme, device id and push state are the device's. */
const ACCOUNT_KEYS: readonly string[] = [
  TASKS_KEY,
  TODOS_KEY,
  DAY_MODES_KEY,
  ...Object.values(NUTRITION_KEYS),
  QUEUE_KEY,
  MEAL_DRAFT_KEY,
];

type Options = {
  /** Injected in tests; defaults to the browser's connectivity flag. */
  online?: boolean;
};

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Makes `uid` the owner of the local data, emptying it first if it was
 * someone else's. Must run before the stores hydrate.
 *
 * Data with no recorded owner predates this check and may already be a mix of
 * two accounts, so it is reset too, but only while online: the server copy is
 * what refills the store, and an offline reset would leave the app empty.
 */
export async function claimLocalData(uid: string, options: Options = {}): Promise<'kept' | 'reset'> {
  const online = options.online ?? isOnline();
  try {
    const owner = await AsyncStorage.getItem(OWNER_KEY);
    if (owner === uid) return 'kept';

    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter((k) => ACCOUNT_KEYS.includes(k) || k.startsWith(CURSOR_PREFIX));

    if (owner === null) {
      if (stale.length === 0) {
        await AsyncStorage.setItem(OWNER_KEY, uid);
        return 'kept';
      }
      if (!online) return 'kept';
    }

    resetQueue();
    await AsyncStorage.multiRemove(stale);
    await AsyncStorage.setItem(OWNER_KEY, uid);
    return 'reset';
  } catch {
    // Storage unavailable: nothing was hydrated from it either.
    return 'kept';
  }
}
