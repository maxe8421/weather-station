import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchWeathercloudCoordinates } from "@/lib/weathercloud";
import { fetchCurrentObservation } from "@/lib/wunderground";
import { geoFromCoords } from "@/lib/geo";
import { isAuthorised } from "@/lib/auth";
import { mapLimit } from "@/lib/http";

interface Row {
  id: string;
  source: string;
  source_id: string | null;
  wunderground_id: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

/**
 * Idempotent, admin-only backfill of geo metadata (coordinates + timezone +
 * country) for stations missing it. Weathercloud stations have coordinates
 * scraped from their profile page; timezone/country are derived offline from
 * coordinates. Safe to call repeatedly. Kept off the collection hot path.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("stations")
    .select("id, source, source_id, wunderground_id, latitude, longitude, timezone")
    .or("latitude.is.null,timezone.is.null");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = (data ?? []) as Row[];
  let updated = 0;
  const misses: string[] = [];

  await mapLimit(targets, 2, async (station) => {
    let lat = station.latitude;
    let lon = station.longitude;

    // Fill missing coordinates: Weathercloud from its profile page, Wunderground
    // from its current observation.
    if (lat === null || lon === null) {
      if (station.source === "weathercloud" && station.source_id) {
        const coords = await fetchWeathercloudCoordinates(station.source_id);
        if (coords) {
          lat = coords.latitude;
          lon = coords.longitude;
        }
      } else if (station.wunderground_id) {
        const obs = await fetchCurrentObservation(station.wunderground_id);
        if (obs) {
          lat = obs.lat;
          lon = obs.lon;
        }
      }
    }

    if (lat === null || lon === null) {
      misses.push(station.source_id ?? station.id);
      return;
    }

    const geo = geoFromCoords(lat, lon);
    const { error: updateError } = await supabase
      .from("stations")
      .update({ latitude: lat, longitude: lon, timezone: geo.timezone, country: geo.country })
      .eq("id", station.id);

    if (updateError) misses.push(station.source_id ?? station.id);
    else updated += 1;
  });

  return NextResponse.json({ checked: targets.length, updated, misses });
}
