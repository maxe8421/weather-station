import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

/**
 * Constant-time string comparison. Avoids leaking secret length/contents
 * through early-exit timing differences on the admin / cron secret.
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * The shared secret used for both data collection and admin mutations.
 * Accepted via (in order of preference):
 *   1. Authorization: Bearer <secret>
 *   2. x-cron-secret / x-admin-secret header
 *   3. ?secret= query param (legacy; kept so existing cron jobs keep working)
 *
 * Headers are preferred because query strings are written to access logs.
 */
export function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerSecret =
    request.headers.get("x-cron-secret") ?? request.headers.get("x-admin-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");

  return (
    safeEqual(bearer, secret) ||
    safeEqual(headerSecret, secret) ||
    safeEqual(querySecret, secret)
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
