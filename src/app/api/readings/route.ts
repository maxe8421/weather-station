import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stationId = params.get("station_id");
  const range = params.get("range") || "24h";

  if (!stationId) {
    return NextResponse.json({ error: "station_id required" }, { status: 400 });
  }

  const now = new Date();
  let from: Date;

  switch (range) {
    case "24h":
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "1y":
      from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case "all":
      from = new Date(0);
      break;
    default:
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  let query = getSupabasePublic()
    .from("weather_readings")
    .select("*")
    .eq("station_id", stationId)
    .gte("observed_at", from.toISOString())
    .order("observed_at", { ascending: true });

  // Downsample for large ranges: fetch daily aggregates instead
  if (range === "1y" || range === "all") {
    // For long ranges, limit to avoid huge payloads — we'll aggregate client-side
    query = query.limit(5000);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
