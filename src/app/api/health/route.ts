import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: stations, error: stationsError } = await supabase
    .from("stations")
    .select("id, name, wunderground_id");

  if (stationsError || !stations || stations.length === 0) {
    return NextResponse.json(
      { status: "error", message: "Cannot fetch stations" },
      { status: 500 }
    );
  }

  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const issues: string[] = [];

  for (const station of stations) {
    const { data: readings } = await supabase
      .from("weather_readings")
      .select("observed_at")
      .eq("station_id", station.id)
      .gte("observed_at", thirtyMinsAgo)
      .limit(1);

    if (!readings || readings.length === 0) {
      issues.push(`${station.name} (${station.wunderground_id}): no data in last 30 minutes`);
    }
  }

  if (issues.length > 0) {
    return NextResponse.json(
      { status: "unhealthy", issues },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "healthy", stations: stations.length });
}
