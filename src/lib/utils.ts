import { WeatherReading } from "./types";

export function windDirToCompass(deg: number | null): string {
  if (deg === null) return "—";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function formatTime(iso: string, range: string): string {
  const d = new Date(iso);
  if (range === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (range === "7d") return d.toLocaleDateString([], { weekday: "short", hour: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
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
