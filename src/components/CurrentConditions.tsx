"use client";

import { WeatherReading } from "@/lib/types";
import { windDirToCompass } from "@/lib/utils";

function Metric({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-1">
        {value !== null && value !== undefined ? (
          <>
            {value}
            {unit && <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>}
          </>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-medium text-slate-500 mb-2">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{children}</div>
    </div>
  );
}

export default function CurrentConditions({ reading }: { reading: WeatherReading | null }) {
  if (!reading) {
    return (
      <div className="bg-white rounded-xl p-8 border border-slate-200 text-center text-slate-400">
        No readings yet
      </div>
    );
  }

  const compass = windDirToCompass(reading.wind_dir);
  const summary: string[] = [];
  if (reading.feels_like_c !== null) summary.push(`Feels like ${reading.feels_like_c}°`);
  if (reading.humidity !== null) summary.push(`Humidity ${reading.humidity}%`);
  if (reading.wind_speed_kph !== null) summary.push(`Wind ${reading.wind_speed_kph} km/h ${compass}`);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <div className="flex items-end gap-4">
          <div className="text-6xl font-semibold tracking-tight text-slate-900 leading-none">
            {reading.temp_c !== null ? `${reading.temp_c}°` : "—"}
          </div>
          {reading.temp_indoor_c !== null && (
            <div className="text-sm text-slate-500 pb-1">
              Indoor <span className="font-medium text-slate-700">{reading.temp_indoor_c}°</span>
            </div>
          )}
        </div>
        {summary.length > 0 && (
          <div className="text-slate-600 mt-2">{summary.join(" · ")}</div>
        )}
      </div>

      <Group title="Temperature">
        <Metric label="Temperature" value={reading.temp_c} unit="°C" />
        <Metric label="Feels Like" value={reading.feels_like_c} unit="°C" />
        <Metric label="Dew Point" value={reading.dewpoint_c} unit="°C" />
        <Metric label="Humidity" value={reading.humidity} unit="%" />
        {reading.temp_indoor_c !== null && <Metric label="Indoor Temp" value={reading.temp_indoor_c} unit="°C" />}
        {reading.humidity_indoor !== null && <Metric label="Indoor Humidity" value={reading.humidity_indoor} unit="%" />}
      </Group>

      <Group title="Wind">
        <Metric label="Wind Speed" value={reading.wind_speed_kph} unit={`km/h ${compass}`} />
        <Metric label="Wind Gust" value={reading.wind_gust_kph} unit="km/h" />
        <Metric
          label="Direction"
          value={reading.wind_dir !== null ? `${reading.wind_dir}° ${compass}` : null}
        />
      </Group>

      <Group title="Rain & sky">
        <Metric label="Rain Rate" value={reading.precip_rate_mm} unit="mm/hr" />
        <Metric label="Rain Today" value={reading.precip_total_mm} unit="mm" />
        <Metric label="Pressure" value={reading.pressure_mb} unit="hPa" />
        <Metric label="UV Index" value={reading.uv} />
        <Metric label="Solar" value={reading.solar_radiation} unit="W/m²" />
      </Group>
    </div>
  );
}
