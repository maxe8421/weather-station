"use client";

import { useEffect, useState, useCallback } from "react";
import { Station, WeatherReading, TimeRange } from "@/lib/types";
import StationPicker from "./StationPicker";
import TimeRangeSelector from "./TimeRangeSelector";
import CurrentConditions from "./CurrentConditions";
import WeatherCharts from "./WeatherChart";

export default function Dashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>("24h");
  const [readings, setReadings] = useState<WeatherReading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stations")
      .then((r) => r.json())
      .then((data: Station[]) => {
        setStations(data);
        const primary = data.find((s) => s.is_primary);
        setSelectedStation(primary?.id || data[0]?.id || null);
      });
  }, []);

  const fetchReadings = useCallback(async () => {
    if (!selectedStation) return;
    setLoading(true);
    const res = await fetch(`/api/readings?station_id=${selectedStation}&range=${range}`);
    const data = await res.json();
    setReadings(data);
    setLoading(false);
  }, [selectedStation, range]);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  const latestReading = readings.length > 0 ? readings[readings.length - 1] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Weather Station</h1>
          {stations.length > 1 && (
            <StationPicker stations={stations} selected={selectedStation} onSelect={setSelectedStation} />
          )}
        </div>
        <div className="flex items-center gap-3">
          <TimeRangeSelector selected={range} onSelect={setRange} />
          <a
            href="/stations"
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            Manage Stations
          </a>
        </div>
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
