export type WeightPoint = { date: string; weightKg: number };
export type TrendPoint = WeightPoint & { trendKg: number };

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Exponential moving average of body weight (the "trend weight"). */
export function emaTrend(entries: WeightPoint[], alpha = 0.1): TrendPoint[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const result: TrendPoint[] = [];
  let trend = 0;
  sorted.forEach((entry, i) => {
    trend = i === 0 ? entry.weightKg : trend + alpha * (entry.weightKg - trend);
    result.push({ ...entry, trendKg: round2(trend) });
  });
  return result;
}

/**
 * Change in trend weight over the last `days` days: last point minus the point
 * closest to `days` days earlier. Null when no point is at least `days - 2`
 * days older than the last one.
 */
export function weeklyDelta(trend: TrendPoint[], days = 7): number | null {
  if (trend.length === 0) return null;
  const last = trend[trend.length - 1];
  const lastDay = dayNumber(last.date);
  const target = lastDay - days;
  let closest: TrendPoint | null = null;
  for (const point of trend) {
    const day = dayNumber(point.date);
    if (lastDay - day < days - 2) continue;
    if (!closest || Math.abs(day - target) < Math.abs(dayNumber(closest.date) - target)) {
      closest = point;
    }
  }
  return closest ? round2(last.trendKg - closest.trendKg) : null;
}
