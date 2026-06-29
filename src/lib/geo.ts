import tzlookup from "tz-lookup";
import { getCountryForTimezone } from "countries-and-timezones";

// Server-only: derive an IANA timezone and country name from coordinates,
// fully offline. Used when a station is added or backfilled.
export function geoFromCoords(
  lat: number,
  lon: number
): { timezone: string | null; country: string | null } {
  try {
    const timezone = tzlookup(lat, lon);
    const country = getCountryForTimezone(timezone)?.name ?? null;
    return { timezone, country };
  } catch {
    return { timezone: null, country: null };
  }
}
