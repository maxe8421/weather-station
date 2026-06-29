"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { DailyReading } from "@/lib/types";
import { ChartSkeleton } from "./ui";

type Preset = "mom" | "yoy" | "momYoY";

interface Window {
  aFrom: string; aTo: string; bFrom: string; bTo: string;
  aLabel: string; bLabel: string;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function buildWindow(preset: Preset, now: Date): Window {
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthName = (yr: number, mo: number) =>
    new Date(yr, mo, 1).toLocaleString("default", { month: "long" });

  if (preset === "yoy") {
    return {
      aFrom: ymd(new Date(y, 0, 1)), aTo: ymd(new Date(y + 1, 0, 1)),
      bFrom: ymd(new Date(y - 1, 0, 1)), bTo: ymd(new Date(y, 0, 1)),
      aLabel: `${y}`, bLabel: `${y - 1}`,
    };
  }
  if (preset === "momYoY") {
    return {
      aFrom: ymd(new Date(y, m, 1)), aTo: ymd(new Date(y, m + 1, 1)),
      bFrom: ymd(new Date(y - 1, m, 1)), bTo: ymd(new Date(y - 1, m + 1, 1)),
      aLabel: `${monthName(y, m)} ${y}`, bLabel: `${monthName(y - 1, m)} ${y - 1}`,
    };
  }
  return {
    aFrom: ymd(new Date(y, m, 1)), aTo: ymd(new Date(y, m + 1, 1)),
    bFrom: ymd(new Date(y, m - 1, 1)), bTo: ymd(new Date(y, m, 1)),
    aLabel: `${monthName(y, m)} ${y}`, bLabel: `${monthName(y, m - 1)} ${y}`,
  };
}

const METRICS = [
  { key: "temp_avg", label: "Avg temp", unit: "°C", kind: "mean", color: "#dc2626" },
  { key: "precip_total_mm", label: "Rainfall", unit: "mm", kind: "sum", color: "#2563eb" },
  { key: "humidity", label: "Humidity", unit: "%", kind: "mean", color: "#0891b2" },
  { key: "wind_speed_kph", label: "Wind", unit: "km/h", kind: "mean", color: "#059669" },
  { key: "pressure_mb", label: "Pressure", unit: "hPa", kind: "mean", color: "#7c3aed" },
  { key: "uv", label: "UV", unit: "", kind: "mean", color: "#d97706" },
  { key: "solar_radiation", label: "Solar", unit: "W/m²", kind: "mean", color: "#db2777" },
] as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

function aggregate(series: DailyReading[], key: string, kind: "mean" | "sum"): number | null {
  const vals = series
    .map((r) => (r as unknown as Record<string, number | null>)[key])
    .filter((v): v is number => v !== null && v !== undefined);
  if (!vals.length) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return round1(kind === "sum" ? sum : sum / vals.length);
}

const PRESET_LABELS: { value: Preset; label: string }[] = [
  { value: "mom", label: "This month vs last" },
  { value: "yoy", label: "This year vs last" },
  { value: "momYoY", label: "This month vs last year" },
];

export default function Comparison({ stationId }: { stationId: string }) {
  const [preset, setPreset] = useState<Preset>("mom");
  const [data, setData] = useState<{ a: DailyReading[]; b: DailyReading[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const win = useMemo(() => buildWindow(preset, new Date()), [preset]);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      station_id: stationId,
      aFrom: win.aFrom, aTo: win.aTo, bFrom: win.bFrom, bTo: win.bTo,
    });
    fetch(`/api/compare?${qs}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else { setData(json); setError(null); }
      })
      .catch(() => setError("Failed to load comparison"))
      .finally(() => setLoading(false));
  }, [stationId, win]);

  // Align both series by day-of-period so the same calendar position lines up.
  const merged = useMemo(() => {
    if (!data) return [];
    const aStart = new Date(`${win.aFrom}T00:00:00`).getTime();
    const bStart = new Date(`${win.bFrom}T00:00:00`).getTime();
    const day = 86400000;
    const byPos = new Map<number, Record<string, number | string | null>>();
    const put = (series: DailyReading[], start: number, suffix: "a" | "b") => {
      for (const row of series) {
        const pos = Math.round((new Date(`${row.day}T00:00:00`).getTime() - start) / day);
        const r = byPos.get(pos) ?? { idx: pos + 1 };
        for (const mtr of METRICS) {
          r[`${mtr.key}_${suffix}`] = (row as unknown as Record<string, number | null>)[mtr.key] ?? null;
        }
        r[`date_${suffix}`] = row.day;
        byPos.set(pos, r);
      }
    };
    put(data.a, aStart, "a");
    put(data.b, bStart, "b");
    return Array.from(byPos.values()).sort((x, y) => (x.idx as number) - (y.idx as number));
  }, [data, win]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="text-sm text-slate-500">
          <span className="text-slate-800 font-medium">{win.aLabel}</span> vs {win.bLabel}
        </div>
      </div>

      {error ? (
        <div className="bg-white rounded-xl p-8 border border-slate-200 text-center text-red-600">{error}</div>
      ) : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      ) : !data || (data.a.length === 0 && data.b.length === 0) ? (
        <div className="bg-white rounded-xl p-10 border border-slate-200 text-center text-slate-500">
          No data for these periods yet.
        </div>
      ) : (
        <>
          {/* Stat summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {METRICS.map((mtr) => {
              const a = aggregate(data.a, mtr.key, mtr.kind);
              const b = aggregate(data.b, mtr.key, mtr.kind);
              const delta = a !== null && b !== null ? round1(a - b) : null;
              const prefix = mtr.kind === "sum" ? "Σ" : "Ø";
              return (
                <div key={mtr.key} className="bg-white rounded-xl p-4 border border-slate-200">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {prefix} {mtr.label}
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

          {/* Overlay charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {METRICS.map((mtr) => (
              <div key={mtr.key} className="bg-white rounded-xl p-4 border border-slate-200">
                <h3 className="font-medium text-slate-800 mb-3">{mtr.label}</h3>
                <div className="h-[250px] xl:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={merged}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                      <XAxis dataKey="idx" fontSize={12} tick={{ fill: "#6b7280" }} />
                      <YAxis fontSize={12} tick={{ fill: "#6b7280" }} unit={mtr.unit ? ` ${mtr.unit}` : undefined} />
                      <Tooltip
                        contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        labelFormatter={(idx: any) => `Day ${idx}`}
                      />
                      <Legend />
                      <Line type="monotone" dataKey={`${mtr.key}_a`} name={win.aLabel} stroke={mtr.color} dot={false} strokeWidth={2} connectNulls />
                      <Line type="monotone" dataKey={`${mtr.key}_b`} name={win.bLabel} stroke="#94a3b8" strokeDasharray="4 3" dot={false} strokeWidth={2} connectNulls />
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
