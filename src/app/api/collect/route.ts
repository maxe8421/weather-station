import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchCurrentObservation, observationToRow } from "@/lib/wunderground";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: stations, error: stationsError } = await supabase
    .from("stations")
    .select("id, wunderground_id");

  if (stationsError || !stations) {
    return NextResponse.json({ error: "Failed to fetch stations" }, { status: 500 });
  }

  const results = [];

  for (const station of stations) {
    const obs = await fetchCurrentObservation(station.wunderground_id);
    if (!obs) {
      results.push({ station: station.wunderground_id, status: "no_data" });
      continue;
    }

    const row = observationToRow(obs, station.id);
    const { error } = await supabase
      .from("weather_readings")
      .upsert(row, { onConflict: "station_id,observed_at" });

    results.push({
      station: station.wunderground_id,
      status: error ? "error" : "ok",
      error: error?.message,
    });
  }

  return NextResponse.json({ results });
}
