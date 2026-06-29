import { DailyReading, WeatherReading } from "./types";
import { sunshineHours } from "./utils";

const r1 = (n: number) => Math.round(n * 10) / 10;
const nums = (vals: (number | null)[]) => vals.filter((v): v is number => v !== null && v !== undefined);
const mean = (vals: (number | null)[]) => {
  const v = nums(vals);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const sum = (vals: (number | null)[]) => nums(vals).reduce((a, b) => a + b, 0);
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" });

/** Plain-English comparison of two daily-aggregate periods. Deterministic, no LLM. */
export function summarizeComparison(
  a: DailyReading[],
  b: DailyReading[],
  aLabel: string,
  bLabel: string
): string[] {
  const out: string[] = [];

  const ta = mean(a.map((r) => r.temp_avg));
  const tb = mean(b.map((r) => r.temp_avg));
  if (ta !== null && tb !== null) {
    const d = r1(ta - tb);
    const phrase =
      Math.abs(d) < 0.1
        ? `about the same temperature as ${bLabel}`
        : `${Math.abs(d)}°C ${d > 0 ? "warmer" : "cooler"} than ${bLabel}`;
    out.push(`${aLabel} averaged ${r1(ta)}°C — ${phrase} (${r1(tb)}°C).`);
  } else if (ta !== null) {
    out.push(`${aLabel} averaged ${r1(ta)}°C (no comparison data for ${bLabel} yet).`);
  }

  const ra = sum(a.map((r) => r.precip_total_mm));
  const rb = sum(b.map((r) => r.precip_total_mm));
  if (a.length && b.length) {
    const diff = r1(ra - rb);
    const phrase =
      Math.abs(diff) < 0.5 ? "a similar amount" : `${Math.abs(diff)} mm ${diff > 0 ? "more" : "less"}`;
    out.push(`Rainfall totalled ${r1(ra)} mm vs ${r1(rb)} mm — ${phrase}.`);
  } else if (a.length) {
    out.push(`Rainfall totalled ${r1(ra)} mm.`);
  }

  const wa = mean(a.map((r) => r.wind_speed_kph));
  const wb = mean(b.map((r) => r.wind_speed_kph));
  if (wa !== null && wb !== null) {
    const d = r1(wa - wb);
    const phrase = Math.abs(d) < 0.5 ? "similar winds" : `${d > 0 ? "windier" : "calmer"} on average`;
    out.push(`Average wind ${r1(wa)} km/h vs ${r1(wb)} km/h — ${phrase}.`);
  }

  return out;
}

/** Plain-English summary of a window of daily aggregates (30d / 1y / all). */
export function summarizeDaily(series: DailyReading[], label: string): string[] {
  if (series.length === 0) return [];
  const out: string[] = [];

  const avg = mean(series.map((r) => r.temp_avg));
  if (avg !== null) {
    const warm = series.reduce((m, r) => (r.temp_max !== null && (m.temp_max ?? -Infinity) < r.temp_max ? r : m));
    const cold = series.reduce((m, r) => (r.temp_min !== null && (m.temp_min ?? Infinity) > r.temp_min ? r : m));
    out.push(
      `Averaged ${r1(avg)}°C over ${label}. Warmest ${warm.temp_max}°C (${fmtDay(warm.day)}), coldest ${cold.temp_min}°C (${fmtDay(cold.day)}).`
    );
  }

  const rainTotal = r1(sum(series.map((r) => r.precip_total_mm)));
  const wet = series.filter((r) => (r.precip_total_mm ?? 0) > 0.2).length;
  out.push(wet === 0 ? "No measurable rain." : `${rainTotal} mm of rain across ${wet} day${wet === 1 ? "" : "s"}.`);

  const gust = series.reduce((m, r) => (r.wind_gust_kph !== null && (m.wind_gust_kph ?? -Infinity) < r.wind_gust_kph ? r : m));
  if (gust.wind_gust_kph !== null) {
    out.push(`Windiest day peaked at ${r1(gust.wind_gust_kph)} km/h (${fmtDay(gust.day)}).`);
  }

  const sunDays = series.filter((r) => r.sunshine_hours !== null);
  if (sunDays.length) {
    const sunTotal = r1(sum(sunDays.map((r) => r.sunshine_hours)));
    out.push(`${sunTotal} hours of sunshine, averaging ${r1(sunTotal / sunDays.length)} h/day.`);
  }

  return out;
}

/** Plain-English summary of a single window of raw readings (a day or week). */
export function summarizePeriod(readings: WeatherReading[], label: string): string[] {
  if (readings.length === 0) return [];
  const out: string[] = [];

  const temps = nums(readings.map((r) => r.temp_c));
  if (temps.length) {
    const avg = r1(temps.reduce((a, b) => a + b, 0) / temps.length);
    const warmest = readings.reduce((m, r) => (r.temp_c !== null && (m.temp_c ?? -Infinity) < r.temp_c ? r : m));
    const coldest = readings.reduce((m, r) => (r.temp_c !== null && (m.temp_c ?? Infinity) > r.temp_c ? r : m));
    const at = (r: WeatherReading) =>
      new Date(r.observed_at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    out.push(
      `Average ${avg}°C in ${label}. High of ${warmest.temp_c}°C (${at(warmest)}), low of ${coldest.temp_c}°C (${at(coldest)}).`
    );
  }

  // Rainfall: precip_total_mm is a per-day cumulative figure, so take the daily
  // maximum and sum across the days in the window.
  const byDay = new Map<string, number>();
  for (const r of readings) {
    if (r.precip_total_mm === null) continue;
    const day = new Date(r.observed_at).toDateString();
    byDay.set(day, Math.max(byDay.get(day) ?? 0, r.precip_total_mm));
  }
  const rainTotal = r1(Array.from(byDay.values()).reduce((a, b) => a + b, 0));
  const wetDays = Array.from(byDay.values()).filter((v) => v > 0.2).length;
  if (byDay.size) {
    out.push(
      wetDays === 0
        ? "No measurable rain."
        : `${rainTotal} mm of rain across ${wetDays} wet day${wetDays === 1 ? "" : "s"}.`
    );
  }

  const gusts = nums(readings.map((r) => r.wind_gust_kph));
  if (gusts.length) {
    out.push(`Peak gust ${r1(Math.max(...gusts))} km/h.`);
  }

  const sun = sunshineHours(readings);
  if (sun !== null) {
    out.push(`${sun} hour${sun === 1 ? "" : "s"} of sunshine.`);
  }

  const pressures = nums(readings.map((r) => r.pressure_mb));
  if (pressures.length >= 2) {
    const delta = r1(pressures[pressures.length - 1] - pressures[0]);
    const trend = Math.abs(delta) < 1 ? "steady" : delta > 0 ? "rising" : "falling";
    out.push(`Pressure ${trend}${Math.abs(delta) >= 1 ? ` (${delta > 0 ? "+" : ""}${delta} hPa)` : ""}.`);
  }

  return out;
}
