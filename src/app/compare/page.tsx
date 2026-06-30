"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Station } from "@/lib/types";
import { ChartSkeleton } from "@/components/ui";
import Comparison from "@/components/Comparison";

type Row = Record<string, number | string | null>;
interface SeriesStation { id: string; name: string; data: Row[] }
interface DataRange { min: string; max: string; dailyMin: string | null }

type Mode = "stations" | "dates";

const RANGES = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All Time" },
] as const;
type Range = (typeof RANGES)[number]["value"];

const METRICS = [
  { key: "temp_avg", label: "Temperature", unit: "°C", kind: "mean" },
  { key: "precip_total_mm", label: "Rainfall", unit: "mm", kind: "sum" },
  { key: "sunshine_hours", label: "Sunshine", unit: "h", kind: "sum" },
  { key: "wind_speed_kph", label: "Wind", unit: "km/h", kind: "mean" },
  { key: "humidity", label: "Humidity", unit: "%", kind: "mean" },
  { key: "pressure_mb", label: "Pressure", unit: "hPa", kind: "mean" },
] as const;

// Distinct line colours per selected station.
const PALETTE = ["#dc2626", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4f46e5"];
const MAX_STATIONS = PALETTE.length;

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);
const fmtDay = (iso: string, range: Range) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString([], range === "all" ? { year: "2-digit", month: "short", day: "numeric" } : { month: "short", day: "numeric" });

const inputClass =
  "px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200";

export default function ComparePage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [mode, setMode] = useState<Mode>("stations");

  // Stations mode.
  const [selected, setSelected] = useState<string[]>([]);
  const [range, setRange] = useState<Range>("30d");
  const [series, setSeries] = useState<SeriesStation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dates mode.
  const [dateStation, setDateStation] = useState<string | null>(null);
  const [dataRange, setDataRange] = useState<DataRange | null>(null);

  // Load the station list, then apply any deep-link query params
  // (?mode=dates&station=<id> from a station dashboard, or ?stations=a,b).
  useEffect(() => {
    fetch("/api/stations")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) return;
        const list = data as Station[];
        setStations(list);
        const params = new URLSearchParams(window.location.search);
        if (params.get("mode") === "dates") setMode("dates");
        const urlStation = params.get("station");
        setDateStation(urlStation && list.some((s) => s.id === urlStation) ? urlStation : list[0]?.id ?? null);
        const urlStations = params.get("stations");
        const pre = urlStations
          ? urlStations.split(",").filter((id) => list.some((s) => s.id === id))
          : list.slice(0, 2).map((s) => s.id);
        setSelected([...new Set(pre)].slice(0, MAX_STATIONS));
      })
      .catch(() => setError("Failed to load stations"));
  }, []);

  // Stations mode: fetch the overlaid daily series.
  useEffect(() => {
    if (mode !== "stations") return;
    if (selected.length === 0) {
      setSeries([]);
      return;
    }
    setLoading(true);
    fetch(`/api/compare-stations?ids=${selected.join(",")}&range=${range}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else { setSeries(json.stations as SeriesStation[]); setError(null); }
      })
      .catch(() => setError("Failed to load comparison"))
      .finally(() => setLoading(false));
  }, [mode, selected, range]);

  // Dates mode: load the selected station's available data range for the picker bounds.
  useEffect(() => {
    if (mode !== "dates" || !dateStation) return;
    setDataRange(null);
    fetch(`/api/data-range?station_id=${dateStation}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.min && d?.max) setDataRange({ min: d.min, max: d.max, dailyMin: d.dailyMin ?? null });
      })
      .catch(() => {});
  }, [mode, dateStation]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_STATIONS ? cur : [...cur, id]));
  const atCap = selected.length >= MAX_STATIONS;

  const days = useMemo(() => {
    const set = new Set<string>();
    for (const st of series) for (const row of st.data) set.add(row.day as string);
    return Array.from(set).sort();
  }, [series]);

  const byDay = useMemo(
    () => series.map((st) => ({ st, map: new Map(st.data.map((row) => [row.day as string, row])) })),
    [series]
  );

  // Build every metric's overlaid dataset once per data change, rather than
  // recomputing all of them on each render.
  const datasets = useMemo(() => {
    const out: Record<string, Row[]> = {};
    for (const m of METRICS) {
      out[m.key] = days.map((day) => {
        const o: Row = { label: fmtDay(day, range) };
        byDay.forEach(({ map }, i) => {
          const v = map.get(day)?.[m.key];
          o[`s${i}`] = num(v) ? v : null;
        });
        return o;
      });
    }
    return out;
  }, [days, byDay, range]);

  const aggregate = (st: SeriesStation, key: string, kind: string): number | null => {
    const vals = st.data.map((r) => r[key]).filter(num);
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return r1(kind === "sum" ? sum : sum / vals.length);
  };

  return (
    <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <a href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-1">
        <span aria-hidden="true">←</span> All stations
      </a>
      <h1 className="text-2xl font-semibold text-slate-900 mb-4">Compare</h1>

      {/* Mode toggle */}
      <div className="flex bg-slate-100 rounded-lg p-1 w-fit mb-6">
        {([["stations", "Stations"], ["dates", "Dates"]] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              mode === m ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "dates" ? (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <label htmlFor="date-station" className="text-sm text-slate-500">Station</label>
            <select
              id="date-station"
              value={dateStation ?? ""}
              onChange={(e) => setDateStation(e.target.value)}
              className={inputClass}
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {dateStation && <Comparison stationId={dateStation} dataRange={dataRange} />}
        </div>
      ) : (
        <>
          {/* Station + range controls */}
          <div className="space-y-3 mb-6">
            <div className="flex flex-wrap gap-2">
              {stations.map((s) => {
                const on = selected.includes(s.id);
                const i = selected.indexOf(s.id);
                const disabled = !on && atCap;
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    disabled={disabled}
                    title={disabled ? `Up to ${MAX_STATIONS} stations — deselect one first` : undefined}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      on ? "bg-white border-slate-300 text-slate-800 shadow-sm" : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"
                    } ${disabled ? "opacity-40 cursor-not-allowed hover:border-slate-200" : ""}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: on ? PALETTE[i % PALETTE.length] : "#cbd5e1" }} />
                    {s.name}
                  </button>
                );
              })}
            </div>
            {atCap && <p className="text-xs text-slate-400">Comparing the maximum of {MAX_STATIONS} stations — deselect one to add another.</p>}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
              {RANGES.map((rg) => (
                <button
                  key={rg.value}
                  onClick={() => setRange(rg.value)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    range === rg.value ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {rg.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div className="bg-white rounded-xl p-8 border border-slate-200 text-center text-red-600">{error}</div>
          ) : selected.length === 0 ? (
            <div className="bg-white rounded-xl p-10 border border-slate-200 text-center text-slate-500">
              Select one or more stations to compare.
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartSkeleton />
              <ChartSkeleton />
            </div>
          ) : days.length === 0 ? (
            <div className="bg-white rounded-xl p-10 border border-slate-200 text-center text-slate-500">
              No history for the selected stations in this range yet.
            </div>
          ) : (
            <>
              {/* Comparison table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="text-left font-medium px-4 py-3">Station</th>
                      {METRICS.map((m) => (
                        <th key={m.key} className="text-right font-medium px-4 py-3 whitespace-nowrap">
                          {m.kind === "sum" ? "Σ" : "Ø"} {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((st, i) => (
                      <tr key={st.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <span className="font-medium text-slate-800">{st.name}</span>
                          </span>
                        </td>
                        {METRICS.map((m) => {
                          const v = aggregate(st, m.key, m.kind);
                          return (
                            <td key={m.key} className="text-right px-4 py-3 text-slate-700 whitespace-nowrap">
                              {v !== null ? `${v}${m.unit ? ` ${m.unit}` : ""}` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Overlay charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {METRICS.map((m) => (
                  <div key={m.key} className="bg-white rounded-xl p-4 border border-slate-200">
                    <h3 className="font-medium text-slate-800 mb-3">{m.label}</h3>
                    <div className="h-[250px] xl:h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={datasets[m.key]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                          <XAxis dataKey="label" fontSize={12} tick={{ fill: "#6b7280" }} />
                          <YAxis fontSize={12} tick={{ fill: "#6b7280" }} unit={m.unit ? ` ${m.unit}` : undefined} />
                          <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }} />
                          <Legend />
                          {series.map((st, i) => (
                            <Line key={st.id} type="monotone" dataKey={`s${i}`} name={st.name} stroke={PALETTE[i % PALETTE.length]} dot={false} strokeWidth={2} connectNulls />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
