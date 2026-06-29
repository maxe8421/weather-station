import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchCurrentObservation, observationToRow } from "@/lib/wunderground";
import { fetchWeathercloudPublic, fetchWeathercloudAuthed } from "@/lib/weathercloud";
import { normalizeRow, ReadingRow } from "@/lib/reading";
import { isAuthorised } from "@/lib/auth";
import { mapLimit } from "@/lib/http";

interface StationRow {
  id: string;
  wunderground_id: string | null;
  source: "wunderground" | "weathercloud";
  source_id: string | null;
  is_primary: boolean;
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: stations, error: stationsError } = await supabase
    .from("stations")
    .select("id, wunderground_id, source, source_id, is_primary");

  if (stationsError || !stations) {
    return NextResponse.json(
      { error: "Failed to fetch stations", detail: stationsError?.message },
      { status: 500 }
    );
  }

  const typed = stations as StationRow[];
  const wuStations = typed.filter((s) => s.source !== "weathercloud");
  const wcStations = typed.filter((s) => s.source === "weathercloud" && s.source_id);

  // Indoor data for the primary station needs an authenticated Weathercloud
  // session; fetch it once up front (and reuse the warmed session below).
  const primary = typed.find((s) => s.is_primary);
  const indoorPromise = primary
    ? fetchWeathercloudAuthed(process.env.WEATHERCLOUD_DEVICE_ID!)
    : Promise.resolve(null);

  type Outcome = { station: string; status: "ok" | "no_data"; row: ReadingRow | null };

  // Wunderground calls hit one host and are independent — parallelise (capped).
  const wuOutcomes = mapLimit<StationRow, Outcome>(wuStations, 5, async (station) => {
    const obs = await fetchCurrentObservation(station.wunderground_id!);
    if (!obs) return { station: station.wunderground_id!, status: "no_data", row: null };
    return {
      station: station.wunderground_id!,
      status: "ok",
      row: normalizeRow({ ...observationToRow(obs), station_id: station.id }),
    };
  });

  // Weathercloud public endpoints are rate-sensitive — keep concurrency low.
  const wcOutcomes = mapLimit<StationRow, Outcome>(wcStations, 2, async (station) => {
    const data = await fetchWeathercloudPublic(station.source_id!);
    const label = station.source_id!;
    if (!data) return { station: label, status: "no_data", row: null };
    return {
      station: label,
      status: "ok",
      row: normalizeRow({ ...data, station_id: station.id }),
    };
  });

  const [indoor, wu, wc] = await Promise.all([indoorPromise, wuOutcomes, wcOutcomes]);

  // Attach indoor metrics to the primary station's row.
  if (primary && indoor) {
    const target = [...wu, ...wc].find((o) => o.row && o.row.station_id === primary.id);
    if (target?.row) {
      target.row.temp_indoor_c = indoor.temp_indoor_c ?? null;
      target.row.humidity_indoor = indoor.humidity_indoor ?? null;
    }
  }

  const outcomes = [...wu, ...wc];
  const rows = outcomes.map((o) => o.row).filter((r): r is ReadingRow => r !== null);

  let upsertError: string | undefined;
  if (rows.length > 0) {
    const { error } = await supabase
      .from("weather_readings")
      .upsert(rows, { onConflict: "station_id,observed_at" });
    upsertError = error?.message;
  }

  const results = outcomes.map((o) => ({
    station: o.station,
    status: upsertError ? "error" : o.status,
    error: o.status === "ok" ? upsertError : undefined,
  }));

  const anyStored = !upsertError && outcomes.some((o) => o.status === "ok");
  return NextResponse.json({ results }, { status: anyStored ? 200 : 500 });
}
