/** Minutes slept between bed and wake times (minutes since midnight), crossing midnight if needed. */
export function sleepDuration(bedAtMinutes: number, wakeAtMinutes: number): number {
  return (wakeAtMinutes - bedAtMinutes + 1440) % 1440;
}

/** 430 -> "7 h 10". */
export function formatHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h} h ${String(m).padStart(2, '0')}`;
}
