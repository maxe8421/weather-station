import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabasePublic } from "@/lib/supabase";
import { fetchCurrentObservation } from "@/lib/wunderground";

export async function GET() {
  const { data, error } = await getSupabasePublic()
    .from("stations")
    .select("*")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-admin-secret") === process.env.CRON_SECRET;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, source, station_id } = body;

  if (!name || !station_id) {
    return NextResponse.json(
      { error: "name and station_id are required" },
      { status: 400 }
    );
  }

  const stationSource = source || "wunderground";

  if (stationSource === "wunderground") {
    const obs = await fetchCurrentObservation(station_id);
    if (!obs) {
      return NextResponse.json(
        { error: "Station not found on Weather Underground" },
        { status: 404 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from("stations")
      .insert({
        name,
        wunderground_id: station_id.toUpperCase(),
        source: "wunderground",
        source_id: station_id.toUpperCase(),
        latitude: obs.lat,
        longitude: obs.lon,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  }

  // Weathercloud station
  const { data, error } = await getSupabaseAdmin()
    .from("stations")
    .insert({
      name,
      wunderground_id: `WC-${station_id}`,
      source: "weathercloud",
      source_id: station_id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();

  const { error } = await getSupabaseAdmin()
    .from("stations")
    .delete()
    .eq("id", id)
    .eq("is_primary", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
