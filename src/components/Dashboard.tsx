"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Station, WeatherReading, DailyReading, TimeRange, ReadingsResponse } from "@/lib/types";
import TimeRangeSelector from "./TimeRangeSelector";
import CurrentConditions from "./CurrentConditions";
import WeatherCharts from "./WeatherChart";
import StationMap from "./StationMap";
import Comparison from "./Comparison";
import { CardSkeleton, ChartSkeleton } from "./ui";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { relativeTime, localTime, dayBounds, weekBounds, windowLabel } from "@/lib/time";

type CustomKind = "day" | "week";

export default function Dashboard({ stationId }: { stationId: string }) {
  const [station, setStation] = useState<Station | null>(null);
  const [mode, setMode] = useState<"raw" | "daily">("raw");
  const [readings, setReadings] = useState<WeatherReading[]>([]);
  const [daily, setDaily] = useState<DailyReading[]>([]);
  const [latest, setLatest] = useState<WeatherReading | null>(null);
  const [range, setRange] = useState<TimeRange>("24h");
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [customKind, setCustomKind] = useState<CustomKind>("day");
  const [compareMode, setCompareMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const lastObservedRef = useRef<string | null>(null);

  // Chart granularity: a custom day behaves like 24h (raw points), a custom
  // week like 7d (6-hour buckets); otherwise follow the selected preset.
  const chartRange: TimeRange = customDate ? (customKind === "day" ? "24h" : "7d") : range;

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    fetch("/api/stations")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setStation((data as Station[]).find((s) => s.id === stationId) ?? null);
        }
      })
      .catch(() => {});
  }, [stationId]);

  const fetchReadings = useCallback(async () => {
    try {
      let url = `/api/readings?station_id=${stationId}`;
      if (customDate) {
        const [from, to] = customKind === "day" ? dayBounds(customDate) : weekBounds(customDate);
        url += `&from=${from.toISOString()}&to=${to.toISOString()}`;
      } else {
        url += `&range=${range}`;
      }
      const res = await fetch(url);
      const json: ReadingsResponse | { error: string } = await res.json();
      if (!res.ok || "error" in json) {
        setError(("error" in json && json.error) || "Failed to load data");
        return;
      }
      setError(null);
      setMode(json.mode);
      setLatest(json.latest);
      const obs = json.latest?.observed_at ?? null;
      if (obs && lastObservedRef.current && obs !== lastObservedRef.current) {
        setFlash(true);
        setTimeout(() => setFlash(false), 1200);
      }
      lastObservedRef.current = obs;
      if (json.mode === "daily") {
        setDaily(json.data as DailyReading[]);
        setReadings([]);
      } else {
        setReadings(json.data as WeatherReading[]);
        setDaily([]);
      }
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [stationId, range, customDate, customKind]);

  useEffect(() => {
    setLoading(true);
    fetchReadings();

    const channel = supabaseBrowser
      .channel(`readings-${stationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "weather_readings",
          filter: `station_id=eq.${stationId}`,
        },
        () => fetchReadings()
      )
      .subscribe();

    const fallback = setInterval(fetchReadings, 5 * 60 * 1000);
    return () => {
      supabaseBrowser.removeChannel(channel);
      clearInterval(fallback);
    };
  }, [fetchReadings, stationId]);

  const selectPreset = (r: TimeRange) => {
    setCustomDate(null);
    setRange(r);
  };

  const todayStr = now.toISOString().slice(0, 10);
  const minStr = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateInputClass =
    "px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200";

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <a
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-1"
          >
            <span aria-hidden="true">←</span> All stations
          </a>
          <h1 className="text-2xl font-semibold text-slate-900 truncate">{station?.name ?? "…"}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-sm text-slate-500">
            {station && (
              <span>
                {station.source === "weathercloud" ? `Weathercloud · ${station.source_id}` : station.wunderground_id}
              </span>
            )}
            {station?.country && <span>· {station.country}</span>}
            {station && localTime(station.timezone, now) && (
              <span>· {localTime(station.timezone, now)} local</span>
            )}
            {latest && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${flash ? "ws-flash" : ""}`}>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Updated {relativeTime(latest.observed_at)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-2">
          <div className="flex items-center gap-2">
            <TimeRangeSelector selected={customDate ? null : range} onSelect={selectPreset} />
            <button
              onClick={() => setCompareMode((v) => !v)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                compareMode
                  ? "bg-sky-600 text-white border-sky-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              Compare
            </button>
          </div>
          <div className={`flex items-center gap-2 ${compareMode ? "opacity-40 pointer-events-none" : ""}`}>
            <input
              type="date"
              min={minStr}
              max={todayStr}
              value={customDate ?? ""}
              onChange={(e) => setCustomDate(e.target.value || null)}
              className={dateInputClass}
            />
            {customDate && (
              <>
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                  {(["day", "week"] as CustomKind[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setCustomKind(k)}
                      className={`px-3 py-1 text-sm rounded-md capitalize transition-colors ${
                        customKind === k ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCustomDate(null)}
                  className="text-sm text-slate-400 hover:text-slate-700"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {compareMode ? (
        <Comparison stationId={stationId} />
      ) : loading ? (
        <div className="space-y-5">
          <CardSkeleton />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl p-8 border border-slate-200 text-center text-red-600">
          {error}
        </div>
      ) : customDate ? (
        <>
          <div className="bg-white rounded-xl px-5 py-3 border border-slate-200 text-slate-700">
            Showing <span className="font-medium text-slate-900">{windowLabel(customDate, customKind)}</span>
          </div>
          <WeatherCharts mode={mode} readings={readings} daily={daily} range={chartRange} />
        </>
      ) : (
        <>
          <CurrentConditions reading={latest} />
          {station && station.latitude !== null && station.longitude !== null && (
            <StationMap latitude={station.latitude} longitude={station.longitude} name={station.name} />
          )}
          <WeatherCharts mode={mode} readings={readings} daily={daily} range={chartRange} />
        </>
      )}
    </div>
  );
}
