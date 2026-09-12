import { Platform, type ViewStyle } from 'react-native';

/**
 * Consistent elevation scale. Soft UI: shadows read as depth, never as decoration.
 * Dark mode leans on surface contrast instead of shadow, which is invisible there.
 */
type Level = 'sm' | 'md' | 'lg';

const ios: Record<Level, ViewStyle> = {
  sm: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  md: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
};

const android: Record<Level, ViewStyle> = {
  sm: { elevation: 1 },
  md: { elevation: 3 },
  lg: { elevation: 8 },
};

export function shadow(level: Level, isDark: boolean): ViewStyle {
  if (isDark) return {};
  return Platform.OS === 'android' ? android[level] : ios[level];
}
