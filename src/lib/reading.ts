/**
 * Canonical column set for weather_readings (excluding the generated id).
 * Every source mapper produces a partial; normalizeRow fills the gaps with
 * null so that a single bulk upsert can carry rows from different sources
 * (Wunderground vs Weathercloud) — PostgREST requires uniform keys across a
 * bulk payload, so this prevents "all object keys must match" errors.
 */
export const READING_COLUMNS = [
  "station_id",
  "observed_at",
  "temp_c",
  "humidity",
  "dewpoint_c",
  "windchill_c",
  "heat_index_c",
  "wind_speed_kph",
  "wind_gust_kph",
  "wind_dir",
  "pressure_mb",
  "precip_rate_mm",
  "precip_total_mm",
  "uv",
  "solar_radiation",
  "feels_like_c",
  "elevation",
  "temp_indoor_c",
  "humidity_indoor",
] as const;

export type ReadingColumn = (typeof READING_COLUMNS)[number];
export type ReadingRow = Record<ReadingColumn, unknown>;

export function normalizeRow(partial: Partial<Record<ReadingColumn, unknown>>): ReadingRow {
  const row = {} as ReadingRow;
  for (const key of READING_COLUMNS) {
    row[key] = partial[key] ?? null;
  }
  return row;
}
