import { WeatherReading, TimeRange } from "./types";

export function windDirToCompass(deg: number | null): string {
  if (deg === null) return "—";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function averageWindDir(degrees: number[]): number {
  if (degrees.length === 0) return 0;
  let sinSum = 0;
  let cosSum = 0;
  for (const d of degrees) {
    const rad = (d * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  let avg = (Math.atan2(sinSum, cosSum) * 180) / Math.PI;
  if (avg < 0) avg += 360;
  return Math.round(avg);
}

export function formatTime(iso: string, range: string): string {
  const d = new Date(iso);
  if (range === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (range === "7d") return d.toLocaleDateString([], { weekday: "short", hour: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface AggregatedPoint {
  label: string;
  [key: string]: number | string | null;
}

function groupKey(iso: string, range: TimeRange): string {
  const d = new Date(iso);
  if (range === "7d") {
    return d.toLocaleDateString([], { weekday: "short" }) + " " +
      d.toLocaleTimeString([], { hour: "2-digit" });
  }
  // Client-side daily bucketing is only used for the 30-day range, where two
  // calendar days can never share a "month day" label, so a concise label is
  // safe. Multi-year ranges (1y / all) are aggregated in SQL with full dates.
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Format an ISO date (from the daily SQL aggregate) for an axis label. */
export function formatDay(isoDate: string, range: TimeRange): string {
  const d = new Date(isoDate);
  const opts: Intl.DateTimeFormatOptions =
    range === "all"
      ? { year: "2-digit", month: "short", day: "numeric" }
      : { month: "short", day: "numeric" };
  return d.toLocaleDateString([], opts);
}

function avgValues(values: number[]): number {
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export function aggregateReadings(
  readings: WeatherReading[],
  fields: (keyof WeatherReading)[],
  range: TimeRange
): AggregatedPoint[] {
  if (range === "24h") {
    return readings.map((r) => {
      const point: AggregatedPoint = {
        label: formatTime(r.observed_at, range),
      };
      for (const f of fields) {
        point[f as string] = r[f] as number | null;
      }
      return point;
    });
  }

  const groups = new Map<string, WeatherReading[]>();

  for (const r of readings) {
    const key = groupKey(r.observed_at, range);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  return Array.from(groups.entries()).map(([label, group]) => {
    const point: AggregatedPoint = { label };
    for (const f of fields) {
      const values = group
        .map((r) => r[f])
        .filter((v): v is number => v !== null && typeof v === "number");
      if (f === "wind_dir") {
        point[f] = values.length > 0 ? averageWindDir(values) : null;
      } else {
        point[f] = values.length > 0 ? avgValues(values) : null;
      }
    }
    return point;
  });
}

interface DailySummary {
  date: string;
  avg: number;
  min: number;
  max: number;
}

export function aggregateDaily(
  readings: WeatherReading[],
  field: keyof WeatherReading
): DailySummary[] {
  const byDay = new Map<string, number[]>();

  for (const r of readings) {
    const val = r[field];
    if (val === null || typeof val !== "number") continue;
    const day = new Date(r.observed_at).toLocaleDateString([], { month: "short", day: "numeric" });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(val);
  }

  return Array.from(byDay.entries()).map(([date, values]) => ({
    date,
    avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
    min: Math.min(...values),
    max: Math.max(...values),
  }));
}
