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

// WMO "bright sunshine" threshold: direct irradiance at or above 120 W/m².
// Weathercloud derives its "hours" figure the same way.
const SUNSHINE_THRESHOLD_WM2 = 120;

/**
 * Hourly vector-mean wind direction for the 24h view. Buckets raw points into
 * clock hours and averages each bucket circularly, so the chart reads as one
 * clean point per hour instead of ~144 scattered raw observations.
 */
export function hourlyWindDirection(
  readings: WeatherReading[]
): { label: string; fullLabel: string; direction: number | null }[] {
  interface Bucket { sort: number; label: string; fullLabel: string; dirs: number[] }
  const groups = new Map<number, Bucket>();

  for (const r of readings) {
    if (r.wind_dir === null) continue;
    const bucket = new Date(r.observed_at);
    bucket.setMinutes(0, 0, 0);
    const key = bucket.getTime();
    if (!groups.has(key)) {
      groups.set(key, {
        sort: key,
        label: bucket.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        fullLabel: bucket.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }),
        dirs: [],
      });
    }
    groups.get(key)!.dirs.push(r.wind_dir);
  }

  return Array.from(groups.values())
    .sort((a, b) => a.sort - b.sort)
    .map((g) => ({ label: g.label, fullLabel: g.fullLabel, direction: averageWindDir(g.dirs) }));
}

/**
 * Estimate hours of bright sunshine from a series of raw solar-radiation
 * readings. Sums the elapsed time during which irradiance held at or above the
 * WMO threshold; gaps are capped so a missing run of readings can't inflate the
 * total. Returns null when the station reports no solar data.
 */
export function sunshineHours(readings: WeatherReading[]): number | null {
  const pts = readings
    .filter((r) => r.solar_radiation !== null)
    .map((r) => ({ t: new Date(r.observed_at).getTime(), s: r.solar_radiation as number }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;

  const MAX_GAP_MS = 30 * 60 * 1000;
  let ms = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].s >= SUNSHINE_THRESHOLD_WM2) {
      ms += Math.min(pts[i + 1].t - pts[i].t, MAX_GAP_MS);
    }
  }
  return Math.round((ms / 3_600_000) * 10) / 10;
}

/** Per-day bright-sunshine hours over a window of raw readings (used for the
 *  "today" figure in the current-conditions card). */
export function sunshineByDay(
  readings: WeatherReading[],
  range: TimeRange
): { label: string; hours: number | null }[] {
  const byDay = new Map<string, { sort: number; date: string; rows: WeatherReading[] }>();
  for (const r of readings) {
    const d = new Date(r.observed_at);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    const key = day.toISOString();
    if (!byDay.has(key)) byDay.set(key, { sort: day.getTime(), date: day.toISOString().slice(0, 10), rows: [] });
    byDay.get(key)!.rows.push(r);
  }
  return Array.from(byDay.values())
    .sort((a, b) => a.sort - b.sort)
    .map((g) => ({ label: formatDay(g.date, range), hours: sunshineHours(g.rows) }));
}

interface SunshinePoint {
  label: string;
  dayLabel: string | null;
  fullLabel: string;
  /** Local calendar day (YYYY-MM-DD) of the bucket, for per-day cumulative resets. */
  day: string;
  hours: number | null;
}

const localDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Bright-sunshine hours bucketed to match the other charts: one point per raw
 * reading on 24h, 6-hour buckets on 7d. Each value is the hours of sunshine
 * accumulated within that bucket (each reading contributes the sunlit portion
 * of the interval that follows it). Daily ranges use the rollup instead.
 */
export function sunshineSeries(readings: WeatherReading[], range: TimeRange): SunshinePoint[] {
  const pts = readings
    .filter((r) => r.solar_radiation !== null)
    .map((r) => ({ t: new Date(r.observed_at).getTime(), s: r.solar_radiation as number }))
    .sort((a, b) => a.t - b.t);
  if (pts.length === 0) return [];

  const MAX_GAP_MS = 30 * 60 * 1000;
  // Hours of sunshine in the interval starting at each reading; the final
  // reading has no following interval, mirroring sunshineHours() so totals match.
  const contribs = pts.map((p, i) => ({
    t: p.t,
    hours:
      p.s >= SUNSHINE_THRESHOLD_WM2 && i < pts.length - 1
        ? Math.min(pts[i + 1].t - p.t, MAX_GAP_MS) / 3_600_000
        : 0,
  }));

  if (range === "24h") {
    return contribs.map((c) => {
      const d = new Date(c.t);
      return {
        label: formatTime(d.toISOString(), "24h"),
        dayLabel: null,
        fullLabel: d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }),
        day: localDay(d),
        hours: Math.round(c.hours * 100) / 100,
      };
    });
  }

  // 7d: 6-hour windows aligned to 00:00 / 06:00 / 12:00 / 18:00 local, matching
  // aggregateReadings so the x-axis lines up with the other 7-day charts.
  interface Bucket { sort: number; label: string; dayLabel: string | null; fullLabel: string; day: string; hours: number }
  const groups = new Map<string, Bucket>();
  for (const c of contribs) {
    const d = new Date(c.t);
    const bucketHour = Math.floor(d.getHours() / 6) * 6;
    const bucket = new Date(d);
    bucket.setHours(bucketHour, 0, 0, 0);
    const key = bucket.toISOString();
    if (!groups.has(key)) {
      const label = `${pad2(bucketHour)}:00`;
      const dayShort = bucket.toLocaleDateString([], { weekday: "short", day: "numeric" });
      groups.set(key, {
        sort: bucket.getTime(),
        label,
        dayLabel: bucketHour === 0 ? dayShort : null,
        fullLabel: `${dayShort}, ${label}`,
        day: localDay(bucket),
        hours: 0,
      });
    }
    groups.get(key)!.hours += c.hours;
  }
  return Array.from(groups.values())
    .sort((a, b) => a.sort - b.sort)
    .map((g) => ({ label: g.label, dayLabel: g.dayLabel, fullLabel: g.fullLabel, day: g.day, hours: Math.round(g.hours * 10) / 10 }));
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
