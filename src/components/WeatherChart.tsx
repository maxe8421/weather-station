"use client";

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { WeatherReading, DailyReading, TimeRange } from "@/lib/types";
import {
  formatTime, formatDay, aggregateDaily, aggregateReadings, windDirToCompass,
  hourlyWindDirection, sunshineSeries,
} from "@/lib/utils";

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

// Show the unambiguous day + time in tooltips (the x-axis itself uses short labels).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tipLabel = (label: any, payload: any) => payload?.[0]?.payload?.fullLabel ?? label;

type Mode = "raw" | "daily";
type Row = Record<string, number | string | null>;
interface FieldDef { key: keyof WeatherReading | keyof DailyReading; label: string; color: string }

interface ChartsProps {
  mode: Mode;
  readings: WeatherReading[];
  daily: DailyReading[];
  range: TimeRange;
  /** Station IANA timezone, so charts bucket/label by the station's local clock. */
  tz?: string | null;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200">
      <h3 className="font-medium text-slate-800 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function NoData({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
        This station doesn’t report {title.toLowerCase()}
      </div>
    </Panel>
  );
}

function rowsHaveData(rows: Row[], labels: string[]): boolean {
  return rows.some((r) => labels.some((l) => r[l] !== null && r[l] !== undefined));
}

// Responsive chart height: taller on larger screens so charts scale up with
// the widening container instead of staying short.
function ChartFrame({ children }: { children: React.ReactElement }) {
  return (
    <div className="h-[250px] xl:h-[320px] 2xl:h-[380px]">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

// Two-tier x-axis for the 7-day view: small 6-hour time labels (00:00 / 06:00 /
// 12:00 / 18:00) with the day shown prominently beneath each midnight bucket.
function buildTimeAxis(range: TimeRange, rows: Row[]) {
  if (range !== "7d") {
    return <XAxis dataKey="label" fontSize={12} tick={TICK_STYLE} />;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tick = ({ x, y, payload }: any) => {
    const day = rows[payload.index]?.dayLabel as string | null | undefined;
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={12} textAnchor="middle" fontSize={10} fill="#94a3b8">
          {payload.value}
        </text>
        {day && (
          <text dy={28} textAnchor="middle" fontSize={12} fontWeight={500} fill="#334155">
            {day}
          </text>
        )}
      </g>
    );
  };
  return <XAxis dataKey="label" interval={0} height={48} tickLine={false} tick={Tick} />;
}

// Shared per-render state passed to each (module-level) chart card, so the cards
// aren't redefined on every render (which would remount their Recharts trees).
interface Ctx {
  isDaily: boolean;
  readings: WeatherReading[];
  daily: DailyReading[];
  range: TimeRange;
  tz?: string | null;
  tempSummaryMode: boolean;
}

// Build a {label, <seriesLabel>: value} dataset for a set of fields,
// transparently handling raw (today), client-aggregated (7d) and server-aggregated
// daily (30d/1y/all) inputs.
function buildRows({ isDaily, readings, daily, range, tz }: Ctx, fields: FieldDef[]): Row[] {
  const read = (obj: unknown, key: string): number | string | null =>
    (obj as Record<string, number | string | null>)[key] ?? null;

  if (isDaily) {
    return daily.map((r) => {
      const label = formatDay(r.day, range);
      const o: Row = { label, fullLabel: label };
      for (const f of fields) o[f.label] = read(r, f.key);
      return o;
    });
  }
  if (range === "today") {
    return readings.map((r) => {
      const label = formatTime(r.observed_at, range, tz);
      const full = new Date(r.observed_at).toLocaleString([], {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        ...(tz ? { timeZone: tz } : {}),
      });
      const o: Row = { label, fullLabel: full };
      for (const f of fields) o[f.label] = read(r, f.key);
      return o;
    });
  }
  const agg = aggregateReadings(readings, fields.map((f) => f.key as keyof WeatherReading), range, tz);
  return agg.map((p) => {
    const o: Row = { label: p.label, dayLabel: p.dayLabel ?? null, fullLabel: p.fullLabel ?? p.label };
    for (const f of fields) o[f.label] = read(p, f.key);
    return o;
  });
}

function LineCard({ ctx, title, fields, unit }: { ctx: Ctx; title: string; fields: FieldDef[]; unit?: string }) {
  const rows = buildRows(ctx, fields);
  const labels = fields.map((f) => f.label);
  if (!rowsHaveData(rows, labels)) return <NoData title={title} />;
  return (
    <Panel title={title}>
      <ChartFrame>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          {buildTimeAxis(ctx.range, rows)}
          <YAxis fontSize={12} tick={TICK_STYLE} unit={unit ? ` ${unit}` : undefined} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={tipLabel} />
          <Legend />
          {fields.map((f) => (
            <Line key={f.label} type="monotone" dataKey={f.label} stroke={f.color} dot={ctx.range === "7d" ? { r: 2 } : false} strokeWidth={2} connectNulls />
          ))}
        </LineChart>
      </ChartFrame>
    </Panel>
  );
}

function TemperatureCard({ ctx }: { ctx: Ctx }) {
  const { tempSummaryMode, isDaily, daily, range, readings } = ctx;
  const title = tempSummaryMode ? "Temperature (Daily Summary)" : "Temperature";
  if (tempSummaryMode) {
    const summary = isDaily
      ? daily.map((r) => ({ label: formatDay(r.day, range), min: r.temp_min, avg: r.temp_avg, max: r.temp_max }))
      : aggregateDaily(readings, "temp_c").map((s) => ({ label: s.date, min: s.min, avg: s.avg, max: s.max }));
    if (!rowsHaveData(summary as Row[], ["min", "avg", "max"])) return <NoData title={title} />;
    return (
      <Panel title={title}>
        <ChartFrame>
          <LineChart data={summary}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="label" fontSize={12} tick={TICK_STYLE} />
            <YAxis fontSize={12} tick={TICK_STYLE} unit=" °C" />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={tipLabel} />
            <Legend />
            <Line type="monotone" dataKey="max" name="Max" stroke={COLORS.red} dot={false} strokeWidth={1.5} connectNulls />
            <Line type="monotone" dataKey="avg" name="Avg" stroke={COLORS.orange} dot={false} strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="min" name="Min" stroke={COLORS.blue} dot={false} strokeWidth={1.5} connectNulls />
          </LineChart>
        </ChartFrame>
      </Panel>
    );
  }
  // Only show the Indoor series when this station actually reports indoor temps.
  const hasIndoor = readings.some((r) => r.temp_indoor_c !== null);
  const fields: FieldDef[] = [
    { key: "temp_c", label: "Outdoor", color: COLORS.red },
    ...(hasIndoor
      ? [{ key: "temp_indoor_c" as keyof WeatherReading, label: "Indoor", color: COLORS.orange }]
      : []),
    { key: "dewpoint_c", label: "Dew Point", color: COLORS.blue },
  ];
  return <LineCard ctx={ctx} title={title} unit="°C" fields={fields} />;
}

function WindDirectionCard({ ctx }: { ctx: Ctx }) {
  const { range, isDaily, readings, tz } = ctx;
  const title = range === "today" ? "Wind Direction (Hourly Average)" : "Wind Direction (Average)";

  // Today shows hourly vector-mean averages — the same circular averaging used for
  // longer ranges — instead of a hard-to-read scatter of raw points.
  const rows =
    range === "today" && !isDaily
      ? hourlyWindDirection(readings, tz).map((p) => ({
          label: p.label,
          fullLabel: p.fullLabel,
          Direction: p.direction,
        }))
      : buildRows(ctx, [{ key: "wind_dir", label: "Direction", color: COLORS.green }]);
  if (!rowsHaveData(rows, ["Direction"])) return <NoData title={title} />;
  return (
    <Panel title={title}>
      <ChartFrame>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          {buildTimeAxis(range, rows)}
          <YAxis fontSize={12} tick={TICK_STYLE} domain={[0, 360]} ticks={[0, 90, 180, 270, 360]}
            tickFormatter={(v: number) => ["N", "E", "S", "W", "N"][v / 90]} />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => [`${value}° ${windDirToCompass(Number(value))}`, "Direction"]}
            contentStyle={TOOLTIP_STYLE}
          />
          <Line type="stepAfter" dataKey="Direction" stroke={COLORS.green} dot={range === "7d" ? { r: 2 } : false} strokeWidth={2} connectNulls />
        </LineChart>
      </ChartFrame>
    </Panel>
  );
}

function RainfallCard({ ctx }: { ctx: Ctx }) {
  const fields: FieldDef[] = [
    { key: "precip_rate_mm", label: "Rate (mm/hr)", color: COLORS.sky },
    { key: "precip_total_mm", label: "Total (mm)", color: COLORS.indigo },
  ];
  const rows = buildRows(ctx, fields);
  const labels = fields.map((f) => f.label);
  if (!rowsHaveData(rows, labels)) return <NoData title="Rainfall" />;
  return (
    <Panel title="Rainfall">
      <ChartFrame>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          {buildTimeAxis(ctx.range, rows)}
          <YAxis fontSize={12} tick={TICK_STYLE} unit=" mm" />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.04)" }} labelFormatter={tipLabel} />
          <Legend />
          {fields.map((f) => (
            <Bar key={f.label} dataKey={f.label} fill={f.color} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ChartFrame>
    </Panel>
  );
}

function UVCard({ ctx }: { ctx: Ctx }) {
  const rows = buildRows(ctx, [
    { key: "uv", label: "UV Index", color: COLORS.amber },
    { key: "solar_radiation", label: "Solar Radiation", color: COLORS.pink },
  ]);
  if (!rowsHaveData(rows, ["UV Index", "Solar Radiation"])) return <NoData title="UV & Solar Radiation" />;
  return (
    <Panel title="UV & Solar Radiation">
      <ChartFrame>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          {buildTimeAxis(ctx.range, rows)}
          <YAxis yAxisId="uv" fontSize={12} tick={{ fill: COLORS.amber }}
            label={{ value: "UV Index", angle: -90, position: "insideLeft", style: { fill: COLORS.amber, fontSize: 11 } }} />
          <YAxis yAxisId="solar" orientation="right" fontSize={12} tick={{ fill: COLORS.pink }}
            label={{ value: "W/m²", angle: 90, position: "insideRight", style: { fill: COLORS.pink, fontSize: 11 } }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={tipLabel} />
          <Legend />
          <Line yAxisId="uv" type="monotone" dataKey="UV Index" stroke={COLORS.amber} dot={ctx.range === "7d" ? { r: 2 } : false} strokeWidth={2} connectNulls />
          <Line yAxisId="solar" type="monotone" dataKey="Solar Radiation" stroke={COLORS.pink} dot={ctx.range === "7d" ? { r: 2 } : false} strokeWidth={2} connectNulls />
        </LineChart>
      </ChartFrame>
    </Panel>
  );
}

// Bright-sunshine hours (WMO ≥120 W/m²). On Today / 7d it's a cumulative line that
// climbs through each day and resets at midnight (cumulative within the day),
// built from per-reading / 6-hour increments. On 30d and longer it's a daily-total
// bar chart. Mirrors Weathercloud's "hours" figure under Solar Radiation.
function SunshineCard({ ctx }: { ctx: Ctx }) {
  const { isDaily, daily, range, readings, tz } = ctx;
  if (isDaily) {
    const rows: Row[] = daily.map((r) => ({
      label: formatDay(r.day, range), dayLabel: null, fullLabel: formatDay(r.day, range), Hours: r.sunshine_hours,
    }));
    if (!rowsHaveData(rows, ["Hours"])) return <NoData title="Sunshine" />;
    return (
      <Panel title="Sunshine (Daily Total)">
        <ChartFrame>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
            {buildTimeAxis(range, rows)}
            <YAxis fontSize={12} tick={TICK_STYLE} unit=" h" allowDecimals />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.04)" }} labelFormatter={tipLabel} />
            <Bar dataKey="Hours" name="Sunshine (hrs)" fill={COLORS.amber} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ChartFrame>
      </Panel>
    );
  }

  const series = sunshineSeries(readings, range, tz);
  if (!series.some((p) => p.hours !== null && p.hours !== undefined)) return <NoData title="Sunshine" />;

  // Running total that resets at each local-day boundary.
  let running = 0;
  let prevDay: string | null = null;
  const rows: Row[] = series.map((p) => {
    if (p.day !== prevDay) { running = 0; prevDay = p.day; }
    running += p.hours ?? 0;
    return { label: p.label, dayLabel: p.dayLabel, fullLabel: p.fullLabel, Cumulative: Math.round(running * 10) / 10 };
  });

  return (
    <Panel title="Sunshine (Cumulative)">
      <ChartFrame>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          {buildTimeAxis(range, rows)}
          <YAxis fontSize={12} tick={TICK_STYLE} unit=" h" allowDecimals />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={tipLabel} />
          <Line type="monotone" dataKey="Cumulative" name="Cumulative sunshine (hrs)" stroke={COLORS.amber} dot={range === "7d" ? { r: 2 } : false} strokeWidth={2} connectNulls />
        </LineChart>
      </ChartFrame>
    </Panel>
  );
}

// Wind rose: share of readings whose wind came from each of the 8 compass
// sectors over the window — the directional summary the line chart can't show.
function WindRoseCard({ ctx }: { ctx: Ctx }) {
  const { isDaily, daily, readings } = ctx;
  const dirs = (isDaily ? daily.map((r) => r.wind_dir) : readings.map((r) => r.wind_dir)).filter(
    (v): v is number => v !== null
  );
  if (dirs.length === 0) return <NoData title="Wind Rose" />;
  const sectors = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const counts = new Array(8).fill(0);
  for (const d of dirs) counts[Math.round(d / 45) % 8]++;
  const data = sectors.map((dir, i) => ({ dir, value: Math.round((counts[i] / dirs.length) * 1000) / 10 }));
  return (
    <Panel title="Wind Rose">
      <ChartFrame>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={GRID_COLOR} />
          <PolarAngleAxis dataKey="dir" tick={{ fill: "#6b7280", fontSize: 12 }} />
          <PolarRadiusAxis angle={67.5} tick={{ fill: "#94a3b8", fontSize: 10 }} unit="%" />
          <Radar dataKey="value" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.4} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => [`${value}%`, "From"]}
          />
        </RadarChart>
      </ChartFrame>
      <div className="text-xs text-gray-400 mt-1 text-center">% of readings the wind came from each direction</div>
    </Panel>
  );
}

export default function WeatherCharts({ mode, readings, daily, range, tz }: ChartsProps) {
  const isDaily = mode === "daily";
  const hasAny = isDaily ? daily.length > 0 : readings.length > 0;
  if (!hasAny) {
    return (
      <div className="bg-white rounded-xl p-10 border border-slate-200 text-center text-slate-500">
        No history for this range yet — data builds up over time.
      </div>
    );
  }

  const ctx: Ctx = {
    isDaily,
    readings,
    daily,
    range,
    tz,
    tempSummaryMode: range === "30d" || range === "1y" || range === "all",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <TemperatureCard ctx={ctx} />
      <LineCard ctx={ctx} title="Humidity" unit="%" fields={[{ key: "humidity", label: "Humidity", color: COLORS.cyan }]} />
      <LineCard ctx={ctx} title="Pressure" unit="hPa" fields={[{ key: "pressure_mb", label: "Pressure", color: COLORS.purple }]} />
      <LineCard ctx={ctx} title="Wind Speed" unit="km/h" fields={[
        { key: "wind_speed_kph", label: "Speed", color: COLORS.green },
        { key: "wind_gust_kph", label: "Gust", color: COLORS.amber },
      ]} />
      <RainfallCard ctx={ctx} />
      <WindDirectionCard ctx={ctx} />
      <WindRoseCard ctx={ctx} />
      <UVCard ctx={ctx} />
      <SunshineCard ctx={ctx} />
    </div>
  );
}
