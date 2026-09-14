import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Curated icon set for schedule entries, grouped so the picker stays scannable.
 * All outline weights from one family, which keeps the stroke consistent.
 */
export const ICON_GROUPS: { label: string; icons: IconName[] }[] = [
  {
    label: 'Rutina',
    icons: [
      'sunny-outline',
      'moon-outline',
      'alarm-outline',
      'bed-outline',
      'water-outline',
      'cafe-outline',
      'restaurant-outline',
      'nutrition-outline',
    ],
  },
  {
    label: 'Cuerpo',
    icons: [
      'fitness-outline',
      'barbell-outline',
      'walk-outline',
      'bicycle-outline',
      'body-outline',
      'heart-outline',
      'medkit-outline',
      'leaf-outline',
    ],
  },
  {
    label: 'Trabajo',
    icons: [
      'briefcase-outline',
      'laptop-outline',
      'desktop-outline',
      'calendar-outline',
      'people-outline',
      'call-outline',
      'mail-outline',
      'document-text-outline',
    ],
  },
  {
    label: 'Estudio',
    icons: [
      'book-outline',
      'school-outline',
      'pencil-outline',
      'bulb-outline',
      'language-outline',
      'headset-outline',
      'musical-notes-outline',
      'color-palette-outline',
    ],
  },
  {
    label: 'Casa y ocio',
    icons: [
      'home-outline',
      'cart-outline',
      'car-outline',
      'airplane-outline',
      'game-controller-outline',
      'tv-outline',
      'paw-outline',
      'shirt-outline',
    ],
  },
];

export const ALL_ICONS: IconName[] = ICON_GROUPS.flatMap((g) => g.icons);

export function isKnownIcon(value: unknown): value is IconName {
  return typeof value === 'string' && (ALL_ICONS as string[]).includes(value);
}
