const API_KEY = process.env.WUNDERGROUND_API_KEY!;
const BASE_URL = "https://api.weather.com/v2/pws/observations/current";

export interface WUObservation {
  stationID: string;
  obsTimeUtc: string;
  obsTimeLocal: string;
  epoch: number;
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
  imperial: {
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
  const url = `${BASE_URL}?stationId=${stationId}&format=json&units=both&apiKey=${API_KEY}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    console.error(`WU API error for ${stationId}: ${res.status}`);
    return null;
  }

  const data = await res.json();
  return data.observations?.[0] ?? null;
}

export function observationToRow(
  obs: WUObservation,
  stationId: string
) {
  return {
    station_id: stationId,
    observed_at: obs.obsTimeUtc,
    temp_f: obs.imperial.temp,
    temp_c: obs.metric.temp,
    humidity: obs.humidity,
    dewpoint_f: obs.imperial.dewpt,
    dewpoint_c: obs.metric.dewpt,
    windchill_f: obs.imperial.windChill,
    windchill_c: obs.metric.windChill,
    heat_index_f: obs.imperial.heatIndex,
    heat_index_c: obs.metric.heatIndex,
    wind_speed_mph: obs.imperial.windSpeed,
    wind_gust_mph: obs.imperial.windGust,
    wind_dir: obs.winddir,
    pressure_in: obs.imperial.pressure,
    pressure_mb: obs.metric.pressure,
    precip_rate_in: obs.imperial.precipRate,
    precip_total_in: obs.imperial.precipTotal,
    uv: obs.uv,
    solar_radiation: obs.solarRadiation,
    feels_like_f: obs.imperial.windChill ?? obs.imperial.heatIndex ?? obs.imperial.temp,
    feels_like_c: obs.metric.windChill ?? obs.metric.heatIndex ?? obs.metric.temp,
    elevation: obs.imperial.elev,
  };
}
