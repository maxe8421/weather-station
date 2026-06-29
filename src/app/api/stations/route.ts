import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabasePublic } from "@/lib/supabase";
import { fetchCurrentObservation } from "@/lib/wunderground";
import { fetchWeathercloudCoordinates } from "@/lib/weathercloud";
import { isAuthorised, isValidUuid } from "@/lib/auth";
import { geoFromCoords } from "@/lib/geo";

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

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string; source?: string; station_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  const rawId = body.station_id?.trim();
  const source = body.source === "weathercloud" ? "weathercloud" : "wunderground";

  if (!name || !rawId) {
    return NextResponse.json(
      { error: "name and station_id are required" },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();

  if (source === "wunderground") {
    const wuId = rawId.toUpperCase();
    const obs = await fetchCurrentObservation(wuId);
    if (!obs) {
      return NextResponse.json(
        { error: "Station not found on Weather Underground" },
        { status: 404 }
      );
    }
    const geo = geoFromCoords(obs.lat, obs.lon);
    const { data, error } = await admin
      .from("stations")
      .insert({
        name,
        wunderground_id: wuId,
        source: "wunderground",
        source_id: wuId,
        latitude: obs.lat,
        longitude: obs.lon,
        timezone: geo.timezone,
        country: geo.country,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  // Weathercloud: 4-letter codes are airport METAR stations (store upper-cased
  // so the source endpoint is selected deterministically); numeric IDs are
  // device IDs and are stored verbatim.
  const isMetar = /^[a-z]{4}$/i.test(rawId);
  const sourceId = isMetar ? rawId.toUpperCase() : rawId;
  const coords = await fetchWeathercloudCoordinates(sourceId);
  const geo = coords ? geoFromCoords(coords.latitude, coords.longitude) : { timezone: null, country: null };

  const { data, error } = await admin
    .from("stations")
    .insert({
      name,
      wunderground_id: `WC-${sourceId}`,
      source: "weathercloud",
      source_id: sourceId,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      timezone: geo.timezone,
      country: geo.country,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidUuid(body.id)) {
    return NextResponse.json({ error: "A valid station id is required" }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("stations")
    .delete()
    .eq("id", body.id)
    .eq("is_primary", false); // never delete the primary station

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
