import { NextRequest, NextResponse } from "next/server";
import { isAuthorised } from "@/lib/auth";

/**
 * Validates an admin password before the management UI is revealed, so the
 * gate is enforced by the server rather than being purely client-side.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
