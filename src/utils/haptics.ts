/**
 * Haptic feedback for the web.
 *
 * Browsers expose only `navigator.vibrate`, and Safari on iOS does not even
 * have that, so this degrades to a no-op there. The API mirrors the one the
 * call sites were written against so the intent (selection, impact,
 * notification) stays readable even where nothing physically happens.
 */

export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}

export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Some browsers throw when vibration is blocked by policy; ignore.
  }
}

export async function selectionAsync(): Promise<void> {
  vibrate(5);
}

export async function impactAsync(
  style: ImpactFeedbackStyle = ImpactFeedbackStyle.Medium,
): Promise<void> {
  vibrate(style === ImpactFeedbackStyle.Light ? 8 : style === ImpactFeedbackStyle.Heavy ? 25 : 15);
}

export async function notificationAsync(
  type: NotificationFeedbackType = NotificationFeedbackType.Success,
): Promise<void> {
  vibrate(
    type === NotificationFeedbackType.Success
      ? [10, 40, 10]
      : type === NotificationFeedbackType.Warning
        ? [20, 40, 20]
        : [30, 40, 30, 40, 30],
  );
}
