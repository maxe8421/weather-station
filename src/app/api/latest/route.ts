import { NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabase";
import { startOfTodayUtc } from "@/lib/time";
import { sunshineHours } from "@/lib/utils";

// Cache the computed response for 60s. The home page polls every 60s per client
// (and live-updates via Supabase realtime), so without this every viewer would
// recompute per-station daily aggregates from raw on every poll. ISR-style
// caching means all viewers share one computation per minute.
export const revalidate = 60;

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (v: number[]) => (v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null);

interface DayRow {
  observed_at: string;
  temp_c: number | null;
  wind_speed_kph: number | null;
  wind_gust_kph: number | null;
  solar_radiation: number | null;
}

export interface TodayStats {
  tempHigh: number | null;
  tempLow: number | null;
  tempAvg: number | null;
  windAvg: number | null;
  gust: number | null;
  rain: number | null;
  sunshine: number | null;
}

/** Structured aggregates over today's readings (since station-local midnight). */
function todayStats(rows: DayRow[], rainToday: number | null): TodayStats {
  const temps = rows.map((r) => r.temp_c).filter((v): v is number => v !== null);
  const winds = rows.map((r) => r.wind_speed_kph).filter((v): v is number => v !== null);
  const gusts = rows.map((r) => r.wind_gust_kph).filter((v): v is number => v !== null);
  return {
    tempHigh: temps.length ? r1(Math.max(...temps)) : null,
    tempLow: temps.length ? r1(Math.min(...temps)) : null,
    tempAvg: mean(temps),
    windAvg: mean(winds),
    gust: gusts.length ? r1(Math.max(...gusts)) : null,
    rain: rainToday,
    sunshine: sunshineHours(rows),
  };
}

/**
 * One-line plain-English headline for a station card, derived from the day's
 * aggregates: temperature range, rainfall, and peak gust. Deterministic and
 * cheap — no LLM. Returns null when there is nothing useful to say.
 */
function buildSummary(t: TodayStats): string | null {
  const parts: string[] = [];
  if (t.tempHigh !== null && t.tempLow !== null) parts.push(`High ${t.tempHigh}° / low ${t.tempLow}°`);
  if (t.rain !== null) parts.push(t.rain > 0 ? `${r1(t.rain)} mm rain` : "dry");
  if (t.gust !== null && t.gust > 0) parts.push(`gusts to ${t.gust} km/h`);
  return parts.length ? parts.join(" · ") : null;
}

export async function GET() {
  const supabase = getSupabasePublic();

  const { data: stations, error: stationsError } = await supabase
    .from("stations")
    .select("*")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (stationsError || !stations) {
    return NextResponse.json({ error: stationsError?.message }, { status: 500 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Resolve all stations concurrently rather than sequentially — this endpoint
  // is polled every 60s by the home page, so the previous serial N+1 loop was
  // the dominant source of latency.
  // Resolve each station independently; a single station's query error degrades
  // that one card rather than failing the whole endpoint (allSettled semantics
  // via a per-station try/catch).
  const results = await Promise.all(
    stations.map(async (station) => {
     try {
      // Today's stats run from the station's own local midnight.
      const dayStart = startOfTodayUtc(station.timezone ?? null).toISOString();
      const [{ data: readings }, { data: hourReadings }, { data: dayReadings }] = await Promise.all([
        supabase
          .from("weather_readings")
          .select("temp_c, wind_speed_kph, precip_total_mm, temp_indoor_c, observed_at")
          .eq("station_id", station.id)
          .order("observed_at", { ascending: false })
          .limit(1),
        supabase
          .from("weather_readings")
          .select("wind_speed_kph")
          .eq("station_id", station.id)
          .gte("observed_at", oneHourAgo),
        supabase
          .from("weather_readings")
          .select("observed_at, temp_c, wind_speed_kph, wind_gust_kph, solar_radiation")
          .eq("station_id", station.id)
          .gte("observed_at", dayStart),
      ]);

      const windValues = (hourReadings || [])
        .map((r) => r.wind_speed_kph)
        .filter((v): v is number => v !== null);

      const avgWind =
        windValues.length > 0
          ? Math.round((windValues.reduce((a, b) => a + b, 0) / windValues.length) * 10) / 10
          : null;

      const latest = readings?.[0] ?? null;
      const today = todayStats(dayReadings ?? [], latest?.precip_total_mm ?? null);

      return {
        ...station,
        latest,
        avg_wind_kph: avgWind,
        today,
        summary: buildSummary(today),
      };
     } catch (err) {
       console.error(`/api/latest failed for station ${station.id}:`, err);
       return { ...station, latest: null, avg_wind_kph: null, today: null, summary: null };
     }
    })
  );

  return NextResponse.json(results);
}
