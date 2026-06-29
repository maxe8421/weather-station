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
  /** Day label, set only on the first bucket of each day (for the two-tier 7d axis). */
  dayLabel?: string | null;
  /** Full day + time, used for tooltips so every point is unambiguous. */
  fullLabel?: string;
  [key: string]: number | string | null | undefined;
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

const pad2 = (n: number) => String(n).padStart(2, "0");

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

  // Bucket key → metadata + member readings, kept in chronological order.
  interface Bucket {
    sort: number;
    label: string;
    dayLabel: string | null;
    fullLabel: string;
    rows: WeatherReading[];
  }
  const groups = new Map<string, Bucket>();

  for (const r of readings) {
    const d = new Date(r.observed_at);
    let key: string;
    let label: string;
    let dayLabel: string | null = null;
    let fullLabel: string;
    let sort: number;

    if (range === "7d") {
      // 6-hour windows aligned to 00:00 / 06:00 / 12:00 / 18:00 local time.
      const bucketHour = Math.floor(d.getHours() / 6) * 6;
      const bucket = new Date(d);
      bucket.setHours(bucketHour, 0, 0, 0);
      key = bucket.toISOString();
      sort = bucket.getTime();
      label = `${pad2(bucketHour)}:00`;
      const dayShort = bucket.toLocaleDateString([], { weekday: "short", day: "numeric" });
      fullLabel = `${dayShort}, ${label}`;
      // Mark the midnight bucket with the day so the axis reads clearly.
      if (bucketHour === 0) dayLabel = dayShort;
    } else {
      // Daily buckets (30d). Within 30 days a "month day" label is unique.
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);
      key = day.toISOString();
      sort = day.getTime();
      label = day.toLocaleDateString([], { month: "short", day: "numeric" });
      fullLabel = label;
    }

    if (!groups.has(key)) groups.set(key, { sort, label, dayLabel, fullLabel, rows: [] });
    groups.get(key)!.rows.push(r);
  }

  return Array.from(groups.values())
    .sort((a, b) => a.sort - b.sort)
    .map((g) => {
      const point: AggregatedPoint = { label: g.label, dayLabel: g.dayLabel, fullLabel: g.fullLabel };
      for (const f of fields) {
        const values = g.rows
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
