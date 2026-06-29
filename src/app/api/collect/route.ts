import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchCurrentObservation, observationToRow } from "@/lib/wunderground";
import { fetchWeathercloudBatch } from "@/lib/weathercloud";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: stations, error: stationsError } = await supabase
    .from("stations")
    .select("id, wunderground_id, source, source_id, is_primary");

  if (stationsError || !stations) {
    return NextResponse.json({ error: "Failed to fetch stations", detail: stationsError?.message }, { status: 500 });
  }

  // Batch-fetch all Weathercloud devices in one session
  const wcStations = stations.filter((s) => s.source === "weathercloud" && s.source_id);
  const primaryStation = stations.find((s) => s.is_primary);
  const allWcDeviceIds = [
    ...wcStations.map((s) => s.source_id!),
    ...(primaryStation ? [process.env.WEATHERCLOUD_DEVICE_ID!] : []),
  ];
  const wcDataMap = await fetchWeathercloudBatch(allWcDeviceIds);

  const results = [];

  for (const station of stations) {
    let row: Record<string, unknown> | null = null;

    if (station.source === "weathercloud" && station.source_id) {
      const wcData = wcDataMap.get(station.source_id);
      if (wcData) {
        row = { station_id: station.id, ...wcData };
      }
    } else {
      const obs = await fetchCurrentObservation(station.wunderground_id);
      if (obs) {
        row = observationToRow(obs, station.id);
        if (station.is_primary) {
          const indoor = wcDataMap.get(process.env.WEATHERCLOUD_DEVICE_ID!);
          if (indoor) {
            row.temp_indoor_c = indoor.temp_indoor_c;
            row.humidity_indoor = indoor.humidity_indoor;
          }
        }
      }
    }

    if (!row) {
      results.push({ station: station.wunderground_id || station.source_id, status: "no_data" });
      continue;
    }

    const { error } = await supabase
      .from("weather_readings")
      .upsert(row, { onConflict: "station_id,observed_at" });

    results.push({
      station: station.wunderground_id || station.source_id,
      status: error ? "error" : "ok",
      error: error?.message,
    });
  }

  const allFailed = results.every((r) => r.status !== "ok");
  const statusCode = allFailed ? 500 : 200;

  return NextResponse.json({ results }, { status: statusCode });
}
