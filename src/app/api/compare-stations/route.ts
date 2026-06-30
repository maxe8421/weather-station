import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabase";
import { isValidUuid } from "@/lib/auth";

// Daily granularity across all ranges so multiple stations align on one axis.
// 7d/30d aggregate from raw (within retention) via the readings_daily RPC; longer
// ranges read the persisted rollup so history survives raw pruning.
const DAILY_COLUMNS =
  "day, temp_avg, temp_min, temp_max, humidity, pressure_mb, wind_speed_kph, wind_gust_kph, wind_dir, precip_total_mm, uv, solar_radiation, sunshine_hours";

const VALID_RANGES = ["7d", "30d", "1y", "all"] as const;

// Explicit cap on rollup reads so `range=all` never silently truncates at
// PostgREST's 1000-row default. ~14 years of daily rows per station.
const DAILY_ROW_CAP = 5000;

function windowFromIso(range: string): string {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "1y" ? 365 : 36500;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  // De-duplicate so `?ids=A,A` doesn't render a station twice.
  const ids = [...new Set((p.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean))];
  const rangeParam = p.get("range") || "30d";
  const range = (VALID_RANGES as readonly string[]).includes(rangeParam) ? rangeParam : "30d";

  if (ids.length < 1 || ids.length > 4 || !ids.every(isValidUuid)) {
    return NextResponse.json({ error: "Provide 1–4 valid station ids" }, { status: 400 });
  }

  const supabase = getSupabasePublic();
  const { data: stationRows, error: stationsError } = await supabase
    .from("stations")
    .select("id, name")
    .in("id", ids);
  if (stationsError) {
    return NextResponse.json({ error: stationsError.message }, { status: 500 });
  }
  const nameById = new Map((stationRows ?? []).map((s) => [s.id, s.name]));

  const fromIso = windowFromIso(range);
  const fromDate = fromIso.slice(0, 10);
  const useRpc = range === "7d" || range === "30d";

  const stations = await Promise.all(
    ids.map(async (id) => {
      try {
        const { data } = useRpc
          ? await supabase.rpc("readings_daily", { p_station_id: id, p_from: fromIso })
          : await supabase
              .from("daily_readings")
              .select(DAILY_COLUMNS)
              .eq("station_id", id)
              .gte("day", fromDate)
              .order("day", { ascending: true })
              .limit(DAILY_ROW_CAP);
        return { id, name: nameById.get(id) ?? id, data: data ?? [] };
      } catch (err) {
        console.error(`/api/compare-stations failed for station ${id}:`, err);
        return { id, name: nameById.get(id) ?? id, data: [] };
      }
    })
  );

  return NextResponse.json({ range, stations });
}
