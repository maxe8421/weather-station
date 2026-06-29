"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { WeatherReading, TimeRange } from "@/lib/types";
import { formatTime, aggregateDaily, aggregateReadings, windDirToCompass } from "@/lib/utils";

const COLORS = {
  red: "#dc2626",
  orange: "#ea580c",
  blue: "#2563eb",
  cyan: "#0891b2",
  purple: "#7c3aed",
  green: "#059669",
  amber: "#d97706",
  indigo: "#4f46e5",
  pink: "#db2777",
  sky: "#0284c7",
};

const TOOLTIP_STYLE = { borderRadius: "8px", border: "1px solid #e5e7eb" };
const GRID_COLOR = "#d1d5db";
const TICK_STYLE = { fill: "#6b7280" };

interface ChartConfig {
  title: string;
  fields: { key: keyof WeatherReading; label: string; color: string }[];
  unit: string;
  dailyAggregate?: boolean;
  aggregateField?: keyof WeatherReading;
}

const CHART_CONFIGS: ChartConfig[] = [
  {
    title: "Temperature",
    fields: [
      { key: "temp_c", label: "Outdoor", color: COLORS.red },
      { key: "temp_indoor_c", label: "Indoor", color: COLORS.orange },
      { key: "dewpoint_c", label: "Dew Point", color: COLORS.blue },
    ],
    unit: "°C",
    dailyAggregate: true,
    aggregateField: "temp_c",
  },
  {
    title: "Humidity",
    fields: [{ key: "humidity", label: "Humidity", color: COLORS.cyan }],
    unit: "%",
  },
  {
    title: "Pressure",
    fields: [{ key: "pressure_mb", label: "Pressure", color: COLORS.purple }],
    unit: "hPa",
  },
  {
    title: "Wind Speed",
    fields: [
      { key: "wind_speed_kph", label: "Speed", color: COLORS.green },
      { key: "wind_gust_kph", label: "Gust", color: COLORS.amber },
    ],
    unit: "km/h",
  },
  {
    title: "Rainfall",
    fields: [
      { key: "precip_rate_mm", label: "Rate (mm/hr)", color: COLORS.sky },
      { key: "precip_total_mm", label: "Total (mm)", color: COLORS.indigo },
    ],
    unit: "mm",
  },
];

function SingleChart({ config, readings, range }: { config: ChartConfig; readings: WeatherReading[]; range: TimeRange }) {
  const showDailyAgg = config.dailyAggregate && (range === "30d" || range === "1y" || range === "all");

  if (showDailyAgg && config.aggregateField) {
    const daily = aggregateDaily(readings, config.aggregateField);
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-medium mb-3">{config.title} (Daily Summary)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="date" fontSize={12} tick={TICK_STYLE} />
            <YAxis fontSize={12} tick={TICK_STYLE} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend />
            <Line type="monotone" dataKey="max" name="Max" stroke={COLORS.red} dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="avg" name="Avg" stroke={COLORS.orange} dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="min" name="Min" stroke={COLORS.blue} dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const fieldKeys = config.fields.map((f) => f.key);
  const aggregated = aggregateReadings(readings, fieldKeys, range);
  const chartData = aggregated.map((p) => {
    const point: Record<string, unknown> = { time: p.label };
    for (const f of config.fields) {
      point[f.label] = p[f.key as string];
    }
    return point;
  });

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="font-medium mb-3">{config.title}</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          <XAxis dataKey="time" fontSize={12} tick={TICK_STYLE} />
          <YAxis fontSize={12} tick={TICK_STYLE} unit={config.unit ? ` ${config.unit}` : undefined} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend />
          {config.fields.map((f) => (
            <Line key={f.key} type="monotone" dataKey={f.label} stroke={f.color} dot={false} strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function WindDirectionChart({ readings, range }: { readings: WeatherReading[]; range: TimeRange }) {
  if (range === "24h") {
    const data = readings
      .filter((r) => r.wind_dir !== null)
      .map((r) => ({
        time: formatTime(r.observed_at, range),
        direction: r.wind_dir,
        speed: r.wind_speed_kph ?? 0,
      }));

    if (data.length === 0) return null;

    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-medium mb-3">Wind Direction</h3>
        <ResponsiveContainer width="100%" height={250}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="time" fontSize={12} tick={TICK_STYLE} name="Time" />
            <YAxis
              dataKey="direction"
              fontSize={12}
              tick={TICK_STYLE}
              domain={[0, 360]}
              ticks={[0, 90, 180, 270, 360]}
              tickFormatter={(v: number) => ["N", "E", "S", "W", "N"][v / 90]}
            />
            <ZAxis dataKey="speed" range={[20, 200]} name="Speed (km/h)" />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => {
                if (name === "Direction") return [`${value}° ${windDirToCompass(Number(value))}`, name];
                return [value, name];
              }}
              contentStyle={TOOLTIP_STYLE}
            />
            <Scatter data={data} fill={COLORS.green} opacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
        <div className="text-xs text-gray-400 mt-1 text-center">Dot size = wind speed</div>
      </div>
    );
  }

  const aggregated = aggregateReadings(readings, ["wind_dir"], range);
  const data = aggregated
    .filter((p) => p.wind_dir !== null)
    .map((p) => ({
      time: p.label,
      direction: p.wind_dir as number,
      compass: windDirToCompass(p.wind_dir as number),
    }));

  if (data.length === 0) return null;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="font-medium mb-3">Wind Direction (Average)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          <XAxis dataKey="time" fontSize={12} tick={TICK_STYLE} />
          <YAxis
            fontSize={12}
            tick={TICK_STYLE}
            domain={[0, 360]}
            ticks={[0, 90, 180, 270, 360]}
            tickFormatter={(v: number) => ["N", "E", "S", "W", "N"][v / 90]}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => [`${value}° ${windDirToCompass(Number(value))}`, "Direction"]}
            contentStyle={TOOLTIP_STYLE}
          />
          <Line type="stepAfter" dataKey="direction" stroke={COLORS.green} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function UVChart({ readings, range }: { readings: WeatherReading[]; range: TimeRange }) {
  const aggregated = aggregateReadings(readings, ["uv", "solar_radiation"], range);
  const chartData = aggregated.map((p) => ({
    time: p.label,
    "UV Index": p.uv,
    "Solar Radiation": p.solar_radiation,
  }));

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="font-medium mb-3">UV & Solar Radiation</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          <XAxis dataKey="time" fontSize={12} tick={TICK_STYLE} />
          <YAxis
            yAxisId="uv"
            fontSize={12}
            tick={{ fill: COLORS.amber }}
            label={{ value: "UV Index", angle: -90, position: "insideLeft", style: { fill: COLORS.amber, fontSize: 11 } }}
          />
          <YAxis
            yAxisId="solar"
            orientation="right"
            fontSize={12}
            tick={{ fill: COLORS.pink }}
            label={{ value: "W/m²", angle: 90, position: "insideRight", style: { fill: COLORS.pink, fontSize: 11 } }}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend />
          <Line yAxisId="uv" type="monotone" dataKey="UV Index" stroke={COLORS.amber} dot={false} strokeWidth={2} />
          <Line yAxisId="solar" type="monotone" dataKey="Solar Radiation" stroke={COLORS.pink} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function WeatherCharts({ readings, range }: { readings: WeatherReading[]; range: TimeRange }) {
  if (readings.length === 0) {
    return <div className="text-gray-500 text-center py-8">No data for this time range</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {CHART_CONFIGS.map((config) => (
        <SingleChart key={config.title} config={config} readings={readings} range={range} />
      ))}
      <WindDirectionChart readings={readings} range={range} />
      <UVChart readings={readings} range={range} />
    </div>
  );
}
