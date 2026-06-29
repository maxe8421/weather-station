"use client";

import { useEffect, useState, useCallback } from "react";
import { Station, WeatherReading, TimeRange } from "@/lib/types";
import TimeRangeSelector from "./TimeRangeSelector";
import CurrentConditions from "./CurrentConditions";
import WeatherCharts from "./WeatherChart";

export default function Dashboard({ stationId }: { stationId: string }) {
  const [station, setStation] = useState<Station | null>(null);
  const [range, setRange] = useState<TimeRange>("24h");
  const [readings, setReadings] = useState<WeatherReading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stations")
      .then((r) => r.json())
      .then((data: Station[]) => {
        setStation(data.find((s) => s.id === stationId) ?? null);
      });
  }, [stationId]);

  const fetchReadings = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/readings?station_id=${stationId}&range=${range}`);
    const data = await res.json();
    setReadings(data);
    setLoading(false);
  }, [stationId, range]);

  useEffect(() => {
    fetchReadings();
    const interval = setInterval(fetchReadings, 60000);
    return () => clearInterval(interval);
  }, [fetchReadings]);

  const latestReading = readings.length > 0 ? readings[readings.length - 1] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-gray-600">←</a>
          <h1 className="text-2xl font-bold">{station?.name ?? "Loading..."}</h1>
          {station && (
            <span className="text-sm text-gray-400">{station.wunderground_id}</span>
          )}
        </div>
        <TimeRangeSelector selected={range} onSelect={setRange} />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <>
          <CurrentConditions reading={latestReading} />
          <WeatherCharts readings={readings} range={range} />
        </>
      )}
    </div>
  );
}
