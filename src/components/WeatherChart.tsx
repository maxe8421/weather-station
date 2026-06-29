"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { WeatherReading, TimeRange } from "@/lib/types";
import { formatTime, aggregateDaily } from "@/lib/utils";

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
      { key: "temp_c", label: "Temperature", color: "#ef4444" },
      { key: "feels_like_c", label: "Feels Like", color: "#f97316" },
      { key: "dewpoint_c", label: "Dew Point", color: "#3b82f6" },
    ],
    unit: "°C",
    dailyAggregate: true,
    aggregateField: "temp_c",
  },
  {
    title: "Humidity",
    fields: [{ key: "humidity", label: "Humidity", color: "#06b6d4" }],
    unit: "%",
  },
  {
    title: "Pressure",
    fields: [{ key: "pressure_mb", label: "Pressure", color: "#8b5cf6" }],
    unit: "hPa",
  },
  {
    title: "Wind",
    fields: [
      { key: "wind_speed_kph", label: "Speed", color: "#10b981" },
      { key: "wind_gust_kph", label: "Gust", color: "#f59e0b" },
    ],
    unit: "km/h",
  },
  {
    title: "Rain",
    fields: [
      { key: "precip_rate_mm", label: "Rate", color: "#3b82f6" },
      { key: "precip_total_mm", label: "Total", color: "#1d4ed8" },
    ],
    unit: "mm",
  },
  {
    title: "UV & Solar",
    fields: [
      { key: "uv", label: "UV Index", color: "#f59e0b" },
      { key: "solar_radiation", label: "Solar (W/m²)", color: "#eab308" },
    ],
    unit: "",
  },
];

function SingleChart({ config, readings, range }: { config: ChartConfig; readings: WeatherReading[]; range: TimeRange }) {
  const showDailyAgg = config.dailyAggregate && (range === "30d" || range === "1y" || range === "all");

  if (showDailyAgg && config.aggregateField) {
    const daily = aggregateDaily(readings, config.aggregateField);
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-medium mb-3">{config.title} (Daily Summary)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="max" name="Max" stroke="#ef4444" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="avg" name="Avg" stroke="#f97316" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="min" name="Min" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const chartData = readings.map((r) => ({
    time: formatTime(r.observed_at, range),
    ...Object.fromEntries(config.fields.map((f) => [f.label, r[f.key]])),
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <h3 className="font-medium mb-3">{config.title}</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="time" fontSize={12} />
          <YAxis fontSize={12} unit={config.unit ? ` ${config.unit}` : undefined} />
          <Tooltip />
          <Legend />
          {config.fields.map((f) => (
            <Line key={f.key} type="monotone" dataKey={f.label} stroke={f.color} dot={false} strokeWidth={2} />
          ))}
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
    </div>
  );
}
