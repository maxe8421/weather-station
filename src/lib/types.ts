export interface Station {
  id: string;
  name: string;
  wunderground_id: string;
  latitude: number | null;
  longitude: number | null;
  is_primary: boolean;
  source: "wunderground" | "weathercloud";
  source_id: string | null;
  timezone: string | null;
  country: string | null;
  created_at: string;
}

export interface WeatherReading {
  id: number;
  station_id: string;
  observed_at: string;
  temp_c: number | null;
  humidity: number | null;
  dewpoint_c: number | null;
  windchill_c: number | null;
  heat_index_c: number | null;
  wind_speed_kph: number | null;
  wind_gust_kph: number | null;
  wind_dir: number | null;
  pressure_mb: number | null;
  precip_rate_mm: number | null;
  precip_total_mm: number | null;
  uv: number | null;
  solar_radiation: number | null;
  feels_like_c: number | null;
  elevation: number | null;
  temp_indoor_c: number | null;
  humidity_indoor: number | null;
}

export type TimeRange = "today" | "7d" | "30d" | "1y" | "all";

/** One day's aggregated metrics, produced by the readings_daily SQL function. */
export interface DailyReading {
  day: string; // ISO date, e.g. "2026-06-29"
  temp_avg: number | null;
  temp_min: number | null;
  temp_max: number | null;
  temp_indoor_c: number | null;
  feels_like_c: number | null;
  dewpoint_c: number | null;
  humidity: number | null;
  pressure_mb: number | null;
  wind_speed_kph: number | null;
  wind_gust_kph: number | null;
  wind_dir: number | null;
  precip_total_mm: number | null;
  precip_rate_mm: number | null;
  uv: number | null;
  solar_radiation: number | null;
  sunshine_hours: number | null;
}

export interface ReadingsResponse {
  mode: "raw" | "daily";
  data: WeatherReading[] | DailyReading[];
  latest: WeatherReading | null;
}
