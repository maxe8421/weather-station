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
  const { name, wunderground_id } = body;

  if (!name || !wunderground_id) {
    return NextResponse.json(
      { error: "name and wunderground_id are required" },
      { status: 400 }
    );
  }

  // Verify the station exists on Wunderground
  const obs = await fetchCurrentObservation(wunderground_id);
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
      wunderground_id: wunderground_id.toUpperCase(),
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

export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();

  const { error } = await getSupabaseAdmin()
    .from("stations")
    .delete()
    .eq("id", id)
    .eq("is_primary", false); // Prevent deleting primary station

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
