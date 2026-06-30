/** Local-timezone YYYY-MM-DD for a Date. */
export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** [start, end) for the calendar day containing dateStr (YYYY-MM-DD), local time. */
export function dayBounds(dateStr: string): [Date, Date] {
  const from = new Date(`${dateStr}T00:00:00`);
  const to = new Date(from);
  to.setDate(from.getDate() + 1);
  return [from, to];
}

/** [start, end) for the Monday–Sunday week containing dateStr, local time. */
export function weekBounds(dateStr: string): [Date, Date] {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  const from = new Date(d);
  from.setDate(d.getDate() - dow);
  const to = new Date(from);
  to.setDate(from.getDate() + 7);
  return [from, to];
}

/** Human label for a custom day/week window. */
export function windowLabel(dateStr: string, kind: "day" | "week"): string {
  if (kind === "day") {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }
  const [from] = weekBounds(dateStr);
  return `Week of ${from.toLocaleDateString([], { day: "numeric", month: "long" })}`;
}

/** UTC offset (ms, local = utc + offset) of an IANA timezone at a given instant. */
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - at.getTime();
}

/**
 * UTC instant of the most recent local midnight ("start of today") in tz — used
 * to scope the "Today" range to the station's own calendar day. Falls back to
 * the server/UTC day when tz is null.
 */
export function startOfTodayUtc(tz: string | null, now: Date = new Date()): Date {
  const dtf = new Intl.DateTimeFormat(
    "en-CA",
    tz
      ? { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit" }
  );
  const [y, m, d] = dtf.format(now).split("-").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
  if (!tz) return new Date(asUtc);
  // Correct the naive UTC-midnight by the zone's offset at that instant.
  return new Date(asUtc - tzOffsetMs(tz, new Date(asUtc)));
}

/** Current wall-clock time at a station's timezone, e.g. "14:32". */
export function localTime(timezone: string | null, now: Date = new Date()): string | null {
  if (!timezone) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(now);
  } catch {
    return null;
  }
}

/** Compact relative time, e.g. "just now", "3 min ago", "2 hr ago", "5 days ago". */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
