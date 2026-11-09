import { createContext, useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * True when something above the tab screens (the person switcher) already
 * clears the status bar. Only the tab headers read it, through
 * `useHeaderInset`; modals keep using the real safe-area insets.
 */
const TopInsetTakenContext = createContext(false);

export const TopInsetTakenProvider = TopInsetTakenContext.Provider;

/** Top padding a tab header still has to add for the status bar. */
export function useHeaderInset(): number {
  const insets = useSafeAreaInsets();
  return useContext(TopInsetTakenContext) ? 0 : insets.top;
}
