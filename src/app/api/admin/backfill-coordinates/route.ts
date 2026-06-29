import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchWeathercloudCoordinates } from "@/lib/weathercloud";
import { isAuthorised } from "@/lib/auth";
import { mapLimit } from "@/lib/http";

/**
 * Idempotent, admin-only backfill of coordinates for Weathercloud stations
 * that were added before coordinate capture existed. Kept off the collection
 * hot path so the cron run stays fast and never re-fetches profile pages on a
 * loop. Safe to call repeatedly: it only touches stations missing coordinates.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: stations, error } = await supabase
    .from("stations")
    .select("id, source_id")
    .eq("source", "weathercloud")
    .is("latitude", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = (stations ?? []).filter((s) => s.source_id);
  let updated = 0;
  const misses: string[] = [];

  await mapLimit(targets, 2, async (station) => {
    const coords = await fetchWeathercloudCoordinates(station.source_id as string);
    if (coords) {
      const { error: updateError } = await supabase
        .from("stations")
        .update({ latitude: coords.latitude, longitude: coords.longitude })
        .eq("id", station.id);
      if (updateError) misses.push(station.source_id as string);
      else updated += 1;
    } else {
      misses.push(station.source_id as string);
    }
  });

  return NextResponse.json({ checked: targets.length, updated, misses });
}
