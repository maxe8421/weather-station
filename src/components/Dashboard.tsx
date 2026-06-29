"use client";

import { useEffect, useState, useCallback } from "react";
import { Station, WeatherReading, DailyReading, TimeRange, ReadingsResponse } from "@/lib/types";
import TimeRangeSelector from "./TimeRangeSelector";
import CurrentConditions from "./CurrentConditions";
import WeatherCharts from "./WeatherChart";
import StationMap from "./StationMap";

export default function Dashboard({ stationId }: { stationId: string }) {
  const [station, setStation] = useState<Station | null>(null);
  const [mode, setMode] = useState<"raw" | "daily">("raw");
  const [readings, setReadings] = useState<WeatherReading[]>([]);
  const [daily, setDaily] = useState<DailyReading[]>([]);
  const [latest, setLatest] = useState<WeatherReading | null>(null);
  const [range, setRange] = useState<TimeRange>("24h");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const interval = setInterval(fetchReadings, 60000);
    return () => clearInterval(interval);
  }, [fetchReadings]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-gray-600">←</a>
          <h1 className="text-2xl font-bold">{station?.name ?? "Loading..."}</h1>
          {station && (
            <span className="text-sm text-gray-400">
              {station.source === "weathercloud" ? `Weathercloud: ${station.source_id}` : station.wunderground_id}
            </span>
          )}
        </div>
        <TimeRangeSelector selected={range} onSelect={setRange} />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
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
