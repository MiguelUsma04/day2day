import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import type { Category } from '../types/task';
import { palette } from './tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type CategoryMeta = {
  label: string;
  icon: IconName;
  /** Accent used for the timeline rail and chips. */
  color: string;
  tintLight: string;
  tintDark: string;
};

export const categoryMeta: Record<Category, CategoryMeta> = {
  work: {
    label: 'Trabajo',
    icon: 'briefcase-outline',
    color: palette.blue600,
    tintLight: palette.blue100,
    tintDark: 'rgba(37, 99, 235, 0.22)',
  },
  personal: {
    label: 'Personal',
    icon: 'heart-outline',
    color: palette.violet500,
    tintLight: palette.violet100,
    tintDark: 'rgba(139, 92, 246, 0.22)',
  },
  health: {
    label: 'Salud',
    icon: 'fitness-outline',
    color: palette.green600,
    tintLight: palette.green100,
    tintDark: 'rgba(5, 150, 105, 0.24)',
  },
  study: {
    label: 'Estudio',
    icon: 'book-outline',
    color: palette.amber500,
    tintLight: palette.amber100,
    tintDark: 'rgba(245, 158, 11, 0.22)',
  },
  other: {
    label: 'Otro',
    icon: 'ellipsis-horizontal-circle-outline',
    color: palette.slate500,
    tintLight: palette.slate100,
    tintDark: 'rgba(100, 116, 139, 0.25)',
  },
};

export function categoryTint(category: Category, isDark: boolean): string {
  const meta = categoryMeta[category];
  return isDark ? meta.tintDark : meta.tintLight;
}
