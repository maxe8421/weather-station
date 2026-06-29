import { fetchWithTimeout } from "./http";
import { ReadingColumn } from "./reading";

const API_KEY = process.env.WUNDERGROUND_API_KEY!;
const BASE_URL = "https://api.weather.com/v2/pws/observations/current";

export interface WUObservation {
  stationID: string;
  obsTimeUtc: string;
  lat: number;
  lon: number;
  solarRadiation: number | null;
  uv: number | null;
  winddir: number | null;
  humidity: number | null;
  metric: {
    temp: number | null;
    heatIndex: number | null;
    dewpt: number | null;
    windChill: number | null;
    windSpeed: number | null;
    windGust: number | null;
    pressure: number | null;
    precipRate: number | null;
    precipTotal: number | null;
    elev: number | null;
  };
}

export async function fetchCurrentObservation(
  stationId: string
): Promise<WUObservation | null> {
  const url = `${BASE_URL}?stationId=${encodeURIComponent(
    stationId
  )}&format=json&units=m&numericPrecision=decimal&apiKey=${API_KEY}`;

  try {
    const res = await fetchWithTimeout(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`WU API error for ${stationId}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data.observations?.[0] ?? null;
  } catch (err) {
    console.error(`WU fetch failed for ${stationId}:`, err);
    return null;
  }
}

/** Map a WU observation to a partial canonical reading row (no station_id). */
export function observationToRow(
  obs: WUObservation
): Partial<Record<ReadingColumn, unknown>> {
  const m = obs.metric;
  return {
    observed_at: obs.obsTimeUtc,
    temp_c: m.temp,
    humidity: obs.humidity,
    dewpoint_c: m.dewpt,
    windchill_c: m.windChill,
    heat_index_c: m.heatIndex,
    wind_speed_kph: m.windSpeed,
    wind_gust_kph: m.windGust,
    wind_dir: obs.winddir,
    pressure_mb: m.pressure,
    precip_rate_mm: m.precipRate,
    precip_total_mm: m.precipTotal,
    uv: obs.uv,
    solar_radiation: obs.solarRadiation,
    feels_like_c: m.windChill ?? m.heatIndex ?? m.temp,
    elevation: m.elev,
  };
}
