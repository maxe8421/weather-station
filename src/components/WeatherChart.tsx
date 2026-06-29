"use client";

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { WeatherReading, DailyReading, TimeRange } from "@/lib/types";
import { formatTime, formatDay, aggregateDaily, aggregateReadings, windDirToCompass } from "@/lib/utils";

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

type Mode = "raw" | "daily";
type Row = Record<string, number | string | null>;
interface FieldDef { key: keyof WeatherReading | keyof DailyReading; label: string; color: string }

interface ChartsProps {
  mode: Mode;
  readings: WeatherReading[];
  daily: DailyReading[];
  range: TimeRange;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="font-medium mb-3">{title}</h3>
      {children}
    </div>
  );
}

function NoData({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <div className="h-[250px] flex items-center justify-center text-sm text-gray-400">
        No data for this metric
      </div>
    </Panel>
  );
}

function rowsHaveData(rows: Row[], labels: string[]): boolean {
  return rows.some((r) => labels.some((l) => r[l] !== null && r[l] !== undefined));
}

export default function WeatherCharts({ mode, readings, daily, range }: ChartsProps) {
  const isDaily = mode === "daily";
  const hasAny = isDaily ? daily.length > 0 : readings.length > 0;
  if (!hasAny) {
    return <div className="text-gray-500 text-center py-8">No data for this time range</div>;
  }

  const tempSummaryMode = range === "30d" || range === "1y" || range === "all";

  // Build a {label, <seriesLabel>: value} dataset for a set of fields,
  // transparently handling raw (24h), client-aggregated (7d/30d) and
  // server-aggregated daily (1y/all) inputs.
  function buildRows(fields: FieldDef[]): Row[] {
    const read = (obj: unknown, key: string): number | string | null =>
      (obj as Record<string, number | string | null>)[key] ?? null;

    if (isDaily) {
      return daily.map((r) => {
        const o: Row = { label: formatDay(r.day, range) };
        for (const f of fields) o[f.label] = read(r, f.key);
        return o;
      });
    }
    if (range === "24h") {
      return readings.map((r) => {
        const o: Row = { label: formatTime(r.observed_at, range) };
        for (const f of fields) o[f.label] = read(r, f.key);
        return o;
      });
    }
    const agg = aggregateReadings(readings, fields.map((f) => f.key as keyof WeatherReading), range);
    return agg.map((p) => {
      const o: Row = { label: p.label };
      for (const f of fields) o[f.label] = read(p, f.key);
      return o;
    });
  }

  function LineCard({ title, fields, unit }: { title: string; fields: FieldDef[]; unit?: string }) {
    const rows = buildRows(fields);
    const labels = fields.map((f) => f.label);
    if (!rowsHaveData(rows, labels)) return <NoData title={title} />;
    return (
      <Panel title={title}>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="label" fontSize={12} tick={TICK_STYLE} />
            <YAxis fontSize={12} tick={TICK_STYLE} unit={unit ? ` ${unit}` : undefined} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend />
            {fields.map((f) => (
              <Line key={f.label} type="monotone" dataKey={f.label} stroke={f.color} dot={false} strokeWidth={2} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    );
  }

  function TemperatureCard() {
    const title = tempSummaryMode ? "Temperature (Daily Summary)" : "Temperature";
    if (tempSummaryMode) {
      const summary = isDaily
        ? daily.map((r) => ({ label: formatDay(r.day, range), min: r.temp_min, avg: r.temp_avg, max: r.temp_max }))
        : aggregateDaily(readings, "temp_c").map((s) => ({ label: s.date, min: s.min, avg: s.avg, max: s.max }));
      if (!rowsHaveData(summary as Row[], ["min", "avg", "max"])) return <NoData title={title} />;
      return (
        <Panel title={title}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={summary}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="label" fontSize={12} tick={TICK_STYLE} />
              <YAxis fontSize={12} tick={TICK_STYLE} unit=" °C" />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend />
              <Line type="monotone" dataKey="max" name="Max" stroke={COLORS.red} dot={false} strokeWidth={1.5} connectNulls />
              <Line type="monotone" dataKey="avg" name="Avg" stroke={COLORS.orange} dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="min" name="Min" stroke={COLORS.blue} dot={false} strokeWidth={1.5} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      );
    }
    return (
      <LineCard
        title={title}
        unit="°C"
        fields={[
          { key: "temp_c", label: "Outdoor", color: COLORS.red },
          { key: "temp_indoor_c", label: "Indoor", color: COLORS.orange },
          { key: "dewpoint_c", label: "Dew Point", color: COLORS.blue },
        ]}
      />
    );
  }

  function WindDirectionCard() {
    const title = range === "24h" ? "Wind Direction" : "Wind Direction (Average)";

    if (range === "24h" && !isDaily) {
      const points = readings
        .filter((r) => r.wind_dir !== null)
        .map((r) => ({
          label: formatTime(r.observed_at, range),
          direction: r.wind_dir,
          speed: r.wind_speed_kph ?? 0,
        }));
      if (points.length === 0) return <NoData title={title} />;
      return (
        <Panel title={title}>
          <ResponsiveContainer width="100%" height={250}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="label" fontSize={12} tick={TICK_STYLE} />
              <YAxis dataKey="direction" fontSize={12} tick={TICK_STYLE} domain={[0, 360]}
                ticks={[0, 90, 180, 270, 360]} tickFormatter={(v: number) => ["N", "E", "S", "W", "N"][v / 90]} />
              <ZAxis dataKey="speed" range={[20, 200]} name="Speed (km/h)" />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) =>
                  name === "direction" ? [`${value}° ${windDirToCompass(Number(value))}`, "Direction"] : [value, name]
                }
                contentStyle={TOOLTIP_STYLE}
              />
              <Scatter data={points} fill={COLORS.green} opacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="text-xs text-gray-400 mt-1 text-center">Dot size = wind speed</div>
        </Panel>
      );
    }

    const rows = buildRows([{ key: "wind_dir", label: "Direction", color: COLORS.green }]);
    if (!rowsHaveData(rows, ["Direction"])) return <NoData title={title} />;
    return (
      <Panel title={title}>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="label" fontSize={12} tick={TICK_STYLE} />
            <YAxis fontSize={12} tick={TICK_STYLE} domain={[0, 360]} ticks={[0, 90, 180, 270, 360]}
              tickFormatter={(v: number) => ["N", "E", "S", "W", "N"][v / 90]} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [`${value}° ${windDirToCompass(Number(value))}`, "Direction"]}
              contentStyle={TOOLTIP_STYLE}
            />
            <Line type="stepAfter" dataKey="Direction" stroke={COLORS.green} dot={false} strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    );
  }

  function RainfallCard() {
    const fields: FieldDef[] = [
      { key: "precip_rate_mm", label: "Rate (mm/hr)", color: COLORS.sky },
      { key: "precip_total_mm", label: "Total (mm)", color: COLORS.indigo },
    ];
    const rows = buildRows(fields);
    const labels = fields.map((f) => f.label);
    if (!rowsHaveData(rows, labels)) return <NoData title="Rainfall" />;
    return (
      <Panel title="Rainfall">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" fontSize={12} tick={TICK_STYLE} />
            <YAxis fontSize={12} tick={TICK_STYLE} unit=" mm" />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <Legend />
            {fields.map((f) => (
              <Bar key={f.label} dataKey={f.label} fill={f.color} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    );
  }

  function UVCard() {
    const rows = buildRows([
      { key: "uv", label: "UV Index", color: COLORS.amber },
      { key: "solar_radiation", label: "Solar Radiation", color: COLORS.pink },
    ]);
    if (!rowsHaveData(rows, ["UV Index", "Solar Radiation"])) return <NoData title="UV & Solar Radiation" />;
    return (
      <Panel title="UV & Solar Radiation">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="label" fontSize={12} tick={TICK_STYLE} />
            <YAxis yAxisId="uv" fontSize={12} tick={{ fill: COLORS.amber }}
              label={{ value: "UV Index", angle: -90, position: "insideLeft", style: { fill: COLORS.amber, fontSize: 11 } }} />
            <YAxis yAxisId="solar" orientation="right" fontSize={12} tick={{ fill: COLORS.pink }}
              label={{ value: "W/m²", angle: 90, position: "insideRight", style: { fill: COLORS.pink, fontSize: 11 } }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend />
            <Line yAxisId="uv" type="monotone" dataKey="UV Index" stroke={COLORS.amber} dot={false} strokeWidth={2} connectNulls />
            <Line yAxisId="solar" type="monotone" dataKey="Solar Radiation" stroke={COLORS.pink} dot={false} strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <TemperatureCard />
      <LineCard title="Humidity" unit="%" fields={[{ key: "humidity", label: "Humidity", color: COLORS.cyan }]} />
      <LineCard title="Pressure" unit="hPa" fields={[{ key: "pressure_mb", label: "Pressure", color: COLORS.purple }]} />
      <LineCard title="Wind Speed" unit="km/h" fields={[
        { key: "wind_speed_kph", label: "Speed", color: COLORS.green },
        { key: "wind_gust_kph", label: "Gust", color: COLORS.amber },
      ]} />
      <RainfallCard />
      <WindDirectionCard />
      <UVCard />
    </div>
  );
}
