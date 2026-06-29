"use client";

import { WeatherReading } from "@/lib/types";
import { windDirToCompass } from "@/lib/utils";

function Card({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">
        {value !== null && value !== undefined ? (
          <>
            {value}
            {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
          </>
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}

export default function CurrentConditions({ reading }: { reading: WeatherReading | null }) {
  if (!reading) {
    return <div className="text-gray-500 text-center py-8">No data available</div>;
  }

  const time = new Date(reading.observed_at).toLocaleString();

  return (
    <div>
      <div className="text-sm text-gray-500 mb-4">
        Last updated: {time}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Card label="Temperature" value={reading.temp_c} unit="°C" />
        <Card label="Feels Like" value={reading.feels_like_c} unit="°C" />
        <Card label="Humidity" value={reading.humidity} unit="%" />
        <Card label="Dew Point" value={reading.dewpoint_c} unit="°C" />
        <Card label="Wind" value={reading.wind_speed_kph} unit={`km/h ${windDirToCompass(reading.wind_dir)}`} />
        <Card label="Wind Gust" value={reading.wind_gust_kph} unit="km/h" />
        <Card label="Pressure" value={reading.pressure_mb} unit="hPa" />
        <Card label="Rain Rate" value={reading.precip_rate_mm} unit="mm/hr" />
        <Card label="Rain Today" value={reading.precip_total_mm} unit="mm" />
        <Card label="UV Index" value={reading.uv} />
        <Card label="Solar Radiation" value={reading.solar_radiation} unit="W/m²" />
        <Card label="Wind Direction" value={reading.wind_dir !== null ? `${reading.wind_dir}° ${windDirToCompass(reading.wind_dir)}` : null} />
        {reading.temp_indoor_c !== null && (
          <Card label="Indoor Temp" value={reading.temp_indoor_c} unit="°C" />
        )}
        {reading.humidity_indoor !== null && (
          <Card label="Indoor Humidity" value={reading.humidity_indoor} unit="%" />
        )}
      </div>
    </div>
  );
}
