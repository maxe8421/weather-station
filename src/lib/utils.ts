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

export function formatTime(iso: string, range: string, tz?: string | null): string {
  if (range === "today") return zTime(iso, tz, { hour: "2-digit", minute: "2-digit" });
  if (range === "7d") return zDate(iso, tz, { weekday: "short", hour: "2-digit" });
  return zDate(iso, tz, { month: "short", day: "numeric" });
}

interface AggregatedPoint {
  label: string;
  /** Day label, set only on the first bucket of each day (for the two-tier 7d axis). */
  dayLabel?: string | null;
  /** Full day + time, used for tooltips so every point is unambiguous. */
  fullLabel?: string;
  [key: string]: number | string | null | undefined;
}

/** Format an ISO date (from the daily SQL aggregate) for an axis label. Parsed
 *  as local midnight so the stored calendar date renders as-is, rather than
 *  shifting a day for viewers behind UTC. */
export function formatDay(isoDate: string, range: TimeRange): string {
  const d = new Date(`${isoDate}T00:00:00`);
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

// ---- timezone-aware bucketing --------------------------------------------
// Charts bucket and label by the station's local clock (its IANA timezone),
// not the viewer's. When tz is null/undefined we fall back to the viewer's
// local time, preserving the previous behaviour.

interface ZonedParts { y: number; mo: number; d: number; h: number }

function zonedParts(iso: string, tz?: string | null): ZonedParts {
  const date = new Date(iso);
  if (!tz) return { y: date.getFullYear(), mo: date.getMonth(), d: date.getDate(), h: date.getHours() };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(date);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  let h = g("hour");
  if (h === 24) h = 0; // some locales emit "24" at midnight
  return { y: g("year"), mo: g("month") - 1, d: g("day"), h };
}

/** A sortable YYYYMMDDHH key from zoned parts (HH omitted when daily). */
const zKey = (z: ZonedParts, withHour: boolean) =>
  Number(`${z.y}${pad2(z.mo + 1)}${pad2(z.d)}${withHour ? pad2(z.h) : "00"}`);
const zDayStr = (z: ZonedParts) => `${z.y}-${pad2(z.mo + 1)}-${pad2(z.d)}`;
const zTime = (iso: string, tz: string | null | undefined, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleTimeString([], tz ? { ...opts, timeZone: tz } : opts);
const zDate = (iso: string, tz: string | null | undefined, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleDateString([], tz ? { ...opts, timeZone: tz } : opts);
const zStr = (iso: string, tz: string | null | undefined, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString([], tz ? { ...opts, timeZone: tz } : opts);

/**
 * Hourly vector-mean wind direction for the Today view. Buckets raw points into
 * clock hours and averages each bucket circularly, so the chart reads as one
 * clean point per hour instead of ~144 scattered raw observations.
 */
export function hourlyWindDirection(
  readings: WeatherReading[],
  tz?: string | null
): { label: string; fullLabel: string; direction: number | null }[] {
  interface Bucket { sort: number; label: string; fullLabel: string; dirs: number[] }
  const groups = new Map<number, Bucket>();

  for (const r of readings) {
    if (r.wind_dir === null) continue;
    const z = zonedParts(r.observed_at, tz);
    const key = zKey(z, true);
    if (!groups.has(key)) {
      groups.set(key, {
        sort: key,
        label: `${pad2(z.h)}:00`,
        fullLabel: zStr(r.observed_at, tz, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
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
export function sunshineHours(
  readings: { observed_at: string; solar_radiation: number | null }[]
): number | null {
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
  range: TimeRange,
  tz?: string | null
): { label: string; hours: number | null }[] {
  const byDay = new Map<string, { sort: number; date: string; rows: WeatherReading[] }>();
  for (const r of readings) {
    const z = zonedParts(r.observed_at, tz);
    const date = zDayStr(z);
    if (!byDay.has(date)) byDay.set(date, { sort: zKey(z, false), date, rows: [] });
    byDay.get(date)!.rows.push(r);
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

/**
 * Bright-sunshine hours bucketed to match the other charts: one point per raw
 * reading on Today, 6-hour buckets on 7d. Each value is the hours of sunshine
 * accumulated within that bucket (each reading contributes the sunlit portion
 * of the interval that follows it). Daily ranges use the rollup instead.
 */
export function sunshineSeries(readings: WeatherReading[], range: TimeRange, tz?: string | null): SunshinePoint[] {
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

  if (range === "today") {
    return contribs.map((c) => {
      const iso = new Date(c.t).toISOString();
      const z = zonedParts(iso, tz);
      return {
        label: formatTime(iso, "today", tz),
        dayLabel: null,
        fullLabel: zStr(iso, tz, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
        day: zDayStr(z),
        hours: Math.round(c.hours * 100) / 100,
      };
    });
  }

  // 7d: 6-hour windows aligned to 00:00 / 06:00 / 12:00 / 18:00 station-local,
  // matching aggregateReadings so the x-axis lines up with the other 7-day charts.
  interface Bucket { sort: number; label: string; dayLabel: string | null; fullLabel: string; day: string; hours: number }
  const groups = new Map<string, Bucket>();
  for (const c of contribs) {
    const iso = new Date(c.t).toISOString();
    const z = zonedParts(iso, tz);
    const bucketHour = Math.floor(z.h / 6) * 6;
    const key = `${zDayStr(z)}-${pad2(bucketHour)}`;
    if (!groups.has(key)) {
      const label = `${pad2(bucketHour)}:00`;
      const dayShort = zDate(iso, tz, { weekday: "short", day: "numeric" });
      groups.set(key, {
        sort: zKey(z, false) * 100 + bucketHour,
        label,
        dayLabel: bucketHour === 0 ? dayShort : null,
        fullLabel: `${dayShort}, ${label}`,
        day: zDayStr(z),
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
  range: TimeRange,
  tz?: string | null
): AggregatedPoint[] {
  if (range === "today") {
    return readings.map((r) => {
      const point: AggregatedPoint = {
        label: formatTime(r.observed_at, range, tz),
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
    const z = zonedParts(r.observed_at, tz);
    let key: string;
    let label: string;
    let dayLabel: string | null = null;
    let fullLabel: string;
    let sort: number;

    if (range === "7d") {
      // 6-hour windows aligned to 00:00 / 06:00 / 12:00 / 18:00 station-local time.
      const bucketHour = Math.floor(z.h / 6) * 6;
      key = `${zDayStr(z)}-${pad2(bucketHour)}`;
      sort = zKey(z, false) * 100 + bucketHour;
      label = `${pad2(bucketHour)}:00`;
      const dayShort = zDate(r.observed_at, tz, { weekday: "short", day: "numeric" });
      fullLabel = `${dayShort}, ${label}`;
      // Mark the midnight bucket with the day so the axis reads clearly.
      if (bucketHour === 0) dayLabel = dayShort;
    } else {
      // Daily buckets (30d). Within 30 days a "month day" label is unique.
      key = zDayStr(z);
      sort = zKey(z, false);
      label = zDate(r.observed_at, tz, { month: "short", day: "numeric" });
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
