export interface Station {
  id: string;
  name: string;
  wunderground_id: string;
  latitude: number | null;
  longitude: number | null;
  is_primary: boolean;
  created_at: string;
}

export interface WeatherReading {
  id: number;
  station_id: string;
  observed_at: string;
  temp_f: number | null;
  temp_c: number | null;
  humidity: number | null;
  dewpoint_f: number | null;
  dewpoint_c: number | null;
  windchill_f: number | null;
  windchill_c: number | null;
  heat_index_f: number | null;
  heat_index_c: number | null;
  wind_speed_mph: number | null;
  wind_gust_mph: number | null;
  wind_dir: number | null;
  pressure_in: number | null;
  pressure_mb: number | null;
  precip_rate_in: number | null;
  precip_total_in: number | null;
  uv: number | null;
  solar_radiation: number | null;
  feels_like_f: number | null;
  feels_like_c: number | null;
  visibility_mi: number | null;
  elevation: number | null;
}

export type TimeRange = "24h" | "7d" | "30d" | "1y" | "all";
