"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { DailyReading, WeatherReading } from "@/lib/types";
import { ChartSkeleton } from "./ui";
import { summarizeComparison } from "@/lib/summary";
import { toYmd, weekBounds, windowLabel } from "@/lib/time";

type Preset = "mom" | "yoy" | "momYoY";
type Gran = "day" | "week" | "month" | "year";
type Mode = "quick" | "custom";

interface Resolved {
  aFrom: string; aTo: string; bFrom: string; bTo: string;
  aLabel: string; bLabel: string;
  gran: Gran;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const monthName = (yr: number, mo: number) => new Date(yr, mo, 1).toLocaleString("default", { month: "long" });

// ---- window resolution ---------------------------------------------------

function presetWindow(preset: Preset, now: Date): Resolved {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === "yoy") {
    return {
      aFrom: toYmd(new Date(y, 0, 1)), aTo: toYmd(new Date(y + 1, 0, 1)),
      bFrom: toYmd(new Date(y - 1, 0, 1)), bTo: toYmd(new Date(y, 0, 1)),
      aLabel: `${y}`, bLabel: `${y - 1}`, gran: "year",
    };
  }
  if (preset === "momYoY") {
    return {
      aFrom: toYmd(new Date(y, m, 1)), aTo: toYmd(new Date(y, m + 1, 1)),
      bFrom: toYmd(new Date(y - 1, m, 1)), bTo: toYmd(new Date(y - 1, m + 1, 1)),
      aLabel: `${monthName(y, m)} ${y}`, bLabel: `${monthName(y - 1, m)} ${y - 1}`, gran: "month",
    };
  }
  return {
    aFrom: toYmd(new Date(y, m, 1)), aTo: toYmd(new Date(y, m + 1, 1)),
    bFrom: toYmd(new Date(y, m - 1, 1)), bTo: toYmd(new Date(y, m, 1)),
    aLabel: `${monthName(y, m)} ${y}`, bLabel: `${monthName(y, m - 1)} ${y}`, gran: "month",
  };
}

function windowFor(gran: Gran, anchor: string): { from: string; to: string; label: string } {
  if (gran === "day") {
    const d = new Date(`${anchor}T00:00:00`);
    const to = new Date(d); to.setDate(d.getDate() + 1);
    return { from: anchor, to: toYmd(to), label: d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) };
  }
  if (gran === "week") {
    const [from, to] = weekBounds(anchor);
    return { from: toYmd(from), to: toYmd(to), label: windowLabel(anchor, "week") };
  }
  if (gran === "month") {
    const [yy, mm] = anchor.split("-").map(Number);
    return {
      from: `${anchor}-01`,
      to: toYmd(new Date(yy, mm, 1)),
      label: `${monthName(yy, mm - 1)} ${yy}`,
    };
  }
  // year
  const yr = Number(anchor);
  return { from: `${yr}-01-01`, to: `${yr + 1}-01-01`, label: `${yr}` };
}

// Sensible default anchors when switching granularity.
function defaultAnchors(gran: Gran, now: Date): [string, string] {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (gran === "day") {
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    return [toYmd(now), toYmd(yest)];
  }
  if (gran === "week") {
    const lastWk = new Date(now); lastWk.setDate(now.getDate() - 7);
    return [toYmd(now), toYmd(lastWk)];
  }
  if (gran === "month") {
    const mm = (n: number) => `${n < 0 ? y - 1 : y}-${String(((m + n) % 12 + 12) % 12 + 1).padStart(2, "0")}`;
    return [mm(0), mm(-1)];
  }
  return [`${y}`, `${y - 1}`];
}

// ---- metrics -------------------------------------------------------------

const METRICS = [
  { key: "temp_avg", rawKey: "temp_c", label: "Temperature", unit: "°C", kind: "mean", color: "#dc2626" },
  { key: "precip_total_mm", rawKey: "precip_total_mm", label: "Rainfall", unit: "mm", kind: "sum", color: "#2563eb" },
  { key: "humidity", rawKey: "humidity", label: "Humidity", unit: "%", kind: "mean", color: "#0891b2" },
  { key: "wind_speed_kph", rawKey: "wind_speed_kph", label: "Wind", unit: "km/h", kind: "mean", color: "#059669" },
  { key: "pressure_mb", rawKey: "pressure_mb", label: "Pressure", unit: "hPa", kind: "mean", color: "#7c3aed" },
  { key: "uv", rawKey: "uv", label: "UV", unit: "", kind: "mean", color: "#d97706" },
  { key: "solar_radiation", rawKey: "solar_radiation", label: "Solar", unit: "W/m²", kind: "mean", color: "#db2777" },
] as const;

const PRESET_LABELS: { value: Preset; label: string }[] = [
  { value: "mom", label: "Month vs last" },
  { value: "yoy", label: "Year vs last" },
  { value: "momYoY", label: "Month vs last yr" },
];

const num = (v: number | null | undefined): v is number => v !== null && v !== undefined;

interface DataRange {
  min: string;
  max: string;
  dailyMin: string | null;
}

export default function Comparison({
  stationId,
  dataRange,
}: {
  stationId: string;
  dataRange: DataRange | null;
}) {
  const [mode, setMode] = useState<Mode>("quick");
  const [preset, setPreset] = useState<Preset>("mom");
  const [gran, setGran] = useState<Gran>("month");
  const [aAnchor, setAAnchor] = useState("");
  const [bAnchor, setBAnchor] = useState("");
  const [data, setData] = useState<{ a: Record<string, number | null>[]; b: Record<string, number | null>[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset anchors to defaults whenever granularity changes in custom mode.
  useEffect(() => {
    const [a, b] = defaultAnchors(gran, new Date());
    setAAnchor(a);
    setBAnchor(b);
  }, [gran]);

  const resolved: Resolved | null = useMemo(() => {
    if (mode === "quick") return presetWindow(preset, new Date());
    if (!aAnchor || !bAnchor) return null;
    const a = windowFor(gran, aAnchor);
    const b = windowFor(gran, bAnchor);
    return { aFrom: a.from, aTo: a.to, bFrom: b.from, bTo: b.to, aLabel: a.label, bLabel: b.label, gran };
  }, [mode, preset, gran, aAnchor, bAnchor]);

  const isRaw = resolved?.gran === "day";

  useEffect(() => {
    if (!resolved) return;
    setLoading(true);
    const qs = new URLSearchParams({
      station_id: stationId,
      aFrom: resolved.aFrom, aTo: resolved.aTo, bFrom: resolved.bFrom, bTo: resolved.bTo,
    });
    if (isRaw) qs.set("g", "raw");
    fetch(`/api/compare?${qs}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else { setData(json); setError(null); }
      })
      .catch(() => setError("Failed to load comparison"))
      .finally(() => setLoading(false));
  }, [stationId, resolved, isRaw]);

  // Build the overlaid chart dataset.
  const merged = useMemo(() => {
    if (!data || !resolved) return [];
    const rows = new Map<number, Record<string, number | string | null>>();

    if (isRaw) {
      // Align two days by hour-of-day, averaging each hour.
      const bucket = (series: Record<string, number | null>[], suffix: "a" | "b") => {
        const byHour = new Map<number, Record<string, number[]>>();
        for (const row of series) {
          const h = new Date(row.observed_at as unknown as string).getHours();
          const acc = byHour.get(h) ?? {};
          for (const mtr of METRICS) {
            const v = row[mtr.rawKey];
            if (num(v)) (acc[mtr.key] = acc[mtr.key] ?? []).push(v);
          }
          byHour.set(h, acc);
        }
        for (const [h, acc] of byHour) {
          const r = rows.get(h) ?? { idx: h };
          for (const mtr of METRICS) {
            const vals = acc[mtr.key];
            r[`${mtr.key}_${suffix}`] = vals?.length ? r1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
          }
          rows.set(h, r);
        }
      };
      bucket(data.a, "a");
      bucket(data.b, "b");
    } else {
      // Align by day-of-period.
      const place = (series: Record<string, number | null>[], start: number, suffix: "a" | "b") => {
        for (const row of series) {
          const pos = Math.round((new Date(`${row.day as unknown as string}T00:00:00`).getTime() - start) / 86400000);
          const r = rows.get(pos) ?? { idx: pos + 1 };
          for (const mtr of METRICS) r[`${mtr.key}_${suffix}`] = row[mtr.key] ?? null;
          rows.set(pos, r);
        }
      };
      place(data.a, new Date(`${resolved.aFrom}T00:00:00`).getTime(), "a");
      place(data.b, new Date(`${resolved.bFrom}T00:00:00`).getTime(), "b");
    }
    return Array.from(rows.values()).sort((x, y) => (x.idx as number) - (y.idx as number));
  }, [data, resolved, isRaw]);

  function stat(series: Record<string, number | null>[], mtr: (typeof METRICS)[number]): number | null {
    if (isRaw) {
      const vals = series.map((r) => r[mtr.rawKey]).filter(num);
      if (!vals.length) return null;
      // Daily rainfall total = max cumulative; everything else = mean.
      if (mtr.kind === "sum") return r1(Math.max(...vals));
      return r1(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    const vals = series.map((r) => r[mtr.key]).filter(num);
    if (!vals.length) return null;
    const s = vals.reduce((a, b) => a + b, 0);
    return r1(mtr.kind === "sum" ? s : s / vals.length);
  }

  const inputClass =
    "px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200";
  const xLabel = (idx: number) => (isRaw ? `${String(idx).padStart(2, "0")}:00` : `Day ${idx}`);

  // Selectable bounds: Day reads raw data (90-day limit); Week/Month/Year read
  // the rollup (full retained history).
  const bounds = useMemo(() => {
    if (!dataRange) return null;
    const floor90 = toYmd(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
    const rawMin = toYmd(new Date(dataRange.min));
    const dailyMin = dataRange.dailyMin ?? rawMin;
    const max = toYmd(new Date(dataRange.max));
    const min = gran === "day" ? (rawMin > floor90 ? rawMin : floor90) : dailyMin;
    return { min, max };
  }, [dataRange, gran]);

  return (
    <div className="space-y-6">
      {/* Mode + selection controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-slate-100 rounded-lg p-1">
          {(["quick", "custom"] as Mode[]).map((mo) => (
            <button
              key={mo}
              onClick={() => setMode(mo)}
              className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${
                mode === mo ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {mo}
            </button>
          ))}
        </div>

        {mode === "quick" ? (
          <div className="flex bg-slate-100 rounded-lg p-1">
            {PRESET_LABELS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  preset === p.value ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select value={gran} onChange={(e) => setGran(e.target.value as Gran)} className={inputClass}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
            <PeriodInput gran={gran} value={aAnchor} onChange={setAAnchor} className={inputClass} bounds={bounds} />
            <span className="text-sm text-slate-400">vs</span>
            <PeriodInput gran={gran} value={bAnchor} onChange={setBAnchor} className={inputClass} bounds={bounds} />
          </div>
        )}
      </div>

      {mode === "custom" && bounds && (
        <p className="text-xs text-slate-400 -mt-1">
          Data available {new Date(`${bounds.min}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} – {new Date(`${bounds.max}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}

      {resolved && (
        <div className="text-sm text-slate-500">
          <span className="text-slate-800 font-medium">{resolved.aLabel}</span> vs {resolved.bLabel}
        </div>
      )}

      {error ? (
        <div className="bg-white rounded-xl p-8 border border-slate-200 text-center text-red-600">{error}</div>
      ) : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      ) : !data || (data.a.length === 0 && data.b.length === 0) ? (
        <div className="bg-white rounded-xl p-10 border border-slate-200 text-center text-slate-500">
          No data for these periods.
        </div>
      ) : (
        <>
          {!isRaw && resolved && (() => {
            const lines = summarizeComparison(
              data.a as unknown as DailyReading[],
              data.b as unknown as DailyReading[],
              resolved.aLabel,
              resolved.bLabel
            );
            return lines.length ? (
              <div className="bg-sky-50 border border-sky-100 rounded-xl p-4">
                <h3 className="text-sm font-medium text-sky-800 mb-1">Summary</h3>
                <p className="text-sm text-slate-700 leading-relaxed">{lines.join(" ")}</p>
              </div>
            ) : null;
          })()}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {METRICS.map((mtr) => {
              const a = data ? stat(data.a, mtr) : null;
              const b = data ? stat(data.b, mtr) : null;
              const delta = a !== null && b !== null ? r1(a - b) : null;
              return (
                <div key={mtr.key} className="bg-white rounded-xl p-4 border border-slate-200">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {mtr.kind === "sum" ? "Σ" : "Ø"} {mtr.label}
                  </div>
                  <div className="text-2xl font-semibold text-slate-900 mt-1">
                    {a !== null ? a : "—"}
                    {mtr.unit && <span className="text-sm font-normal text-slate-400 ml-1">{mtr.unit}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {b !== null ? `${b}${mtr.unit ? ` ${mtr.unit}` : ""} prior` : "—"}
                    {delta !== null && (
                      <span className={`ml-1 font-medium ${delta > 0 ? "text-red-600" : delta < 0 ? "text-blue-600" : "text-slate-400"}`}>
                        ({delta > 0 ? "+" : ""}{delta})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {METRICS.map((mtr) => (
              <div key={mtr.key} className="bg-white rounded-xl p-4 border border-slate-200">
                <h3 className="font-medium text-slate-800 mb-3">{mtr.label}</h3>
                <div className="h-[250px] xl:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={merged}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                      <XAxis dataKey="idx" fontSize={12} tick={{ fill: "#6b7280" }} tickFormatter={xLabel} />
                      <YAxis fontSize={12} tick={{ fill: "#6b7280" }} unit={mtr.unit ? ` ${mtr.unit}` : undefined} />
                      <Tooltip
                        contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        labelFormatter={(idx: any) => xLabel(Number(idx))}
                      />
                      <Legend />
                      <Line type="monotone" dataKey={`${mtr.key}_a`} name={resolved?.aLabel} stroke={mtr.color} dot={false} strokeWidth={2} connectNulls />
                      <Line type="monotone" dataKey={`${mtr.key}_b`} name={resolved?.bLabel} stroke="#94a3b8" strokeDasharray="4 3" dot={false} strokeWidth={2} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PeriodInput({
  gran, value, onChange, className, bounds,
}: {
  gran: Gran; value: string; onChange: (v: string) => void; className: string;
  bounds: { min: string; max: string } | null;
}) {
  if (gran === "month") {
    return (
      <input
        type="month"
        min={bounds ? bounds.min.slice(0, 7) : undefined}
        max={bounds ? bounds.max.slice(0, 7) : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
    );
  }
  if (gran === "year") {
    const thisYear = new Date().getFullYear();
    return (
      <input
        type="number"
        min={bounds ? Number(bounds.min.slice(0, 4)) : 2000}
        max={bounds ? Number(bounds.max.slice(0, 4)) : thisYear}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} w-24`}
      />
    );
  }
  // day / week → a date
  return (
    <input
      type="date"
      min={bounds?.min}
      max={bounds?.max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}
