declare module "tz-lookup" {
  /** Returns the IANA timezone name for the given latitude/longitude. */
  export default function tzlookup(lat: number, lon: number): string;
}
