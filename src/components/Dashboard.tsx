"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Station, WeatherReading, DailyReading, TimeRange, ReadingsResponse } from "@/lib/types";
import TimeRangeSelector from "./TimeRangeSelector";
import CurrentConditions from "./CurrentConditions";
import WeatherCharts from "./WeatherChart";
import StationMap from "./StationMap";
import { CardSkeleton, ChartSkeleton } from "./ui";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { relativeTime, localTime } from "@/lib/time";

export default function Dashboard({ stationId }: { stationId: string }) {
  const [station, setStation] = useState<Station | null>(null);
  const [mode, setMode] = useState<"raw" | "daily">("raw");
  const [readings, setReadings] = useState<WeatherReading[]>([]);
  const [daily, setDaily] = useState<DailyReading[]>([]);
  const [latest, setLatest] = useState<WeatherReading | null>(null);
  const [range, setRange] = useState<TimeRange>("24h");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const lastObservedRef = useRef<string | null>(null);

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
      const res = await fetch(`/api/readings?station_id=${stationId}&range=${range}`);
      const json: ReadingsResponse | { error: string } = await res.json();
      if (!res.ok || "error" in json) {
        setError(("error" in json && json.error) || "Failed to load data");
        return;
      }
      setError(null);
      setMode(json.mode);
      setLatest(json.latest);
      // Flash the freshness indicator when a genuinely new reading arrives.
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
  }, [stationId, range]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <a
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-1"
          >
            <span aria-hidden="true">←</span> All stations
          </a>
          <h1 className="text-2xl font-semibold text-slate-900 truncate">
            {station?.name ?? "…"}
          </h1>
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
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${flash ? "ws-flash" : ""}`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Updated {relativeTime(latest.observed_at)}
              </span>
            )}
          </div>
        </div>
        <TimeRangeSelector selected={range} onSelect={setRange} />
      </div>

      {loading ? (
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
      ) : (
        <>
          <CurrentConditions reading={latest} />
          {station && station.latitude !== null && station.longitude !== null && (
            <StationMap latitude={station.latitude} longitude={station.longitude} name={station.name} />
          )}
          <WeatherCharts mode={mode} readings={readings} daily={daily} range={range} />
        </>
      )}
    </div>
  );
}
