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
