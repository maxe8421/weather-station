import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAuthorised } from "@/lib/auth";

/**
 * Daily maintenance: recompute the persisted daily_readings rollup for every
 * station/day, then prune raw readings older than the retention window. Meant
 * to be called once a day by an external scheduler. Authenticated because it
 * deletes data. Idempotent — re-running only refreshes aggregates.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabaseAdmin().rpc("rollup_daily");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data as object) });
}
