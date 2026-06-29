"use client";

import { useEffect, useState } from "react";
import { Station } from "@/lib/types";

interface StationWithLatest extends Station {
  latest: {
    temp_c: number | null;
    temp_indoor_c: number | null;
    wind_speed_kph: number | null;
    precip_total_mm: number | null;
    observed_at: string;
  } | null;
  avg_wind_kph: number | null;
}

export default function Home() {
  const [stations, setStations] = useState<StationWithLatest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch("/api/latest")
        .then((r) => r.json())
        .then((data) => {
          setStations(data);
          setLoading(false);
        });
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Weather Stations</h1>
          <a
            href="/stations"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Manage Stations
          </a>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : stations.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No stations added yet</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stations.map((s) => (
              <a
                key={s.id}
                href={`/station/${s.id}`}
                className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-semibold text-lg">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.wunderground_id}</div>
                  </div>
                  {s.is_primary && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      Primary
                    </span>
                  )}
                </div>

                {s.latest ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Outdoor</div>
                      <div className="text-xl font-semibold">
                        {s.latest.temp_c !== null ? `${s.latest.temp_c}°` : "—"}
                      </div>
                    </div>
                    {s.latest.temp_indoor_c !== null && (
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Indoor</div>
                        <div className="text-xl font-semibold">
                          {`${s.latest.temp_indoor_c}°`}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Wind (1hr avg)</div>
                      <div className="text-xl font-semibold">
                        {s.avg_wind_kph !== null ? (
                          <>
                            {s.avg_wind_kph}
                            <span className="text-xs font-normal text-gray-400 ml-0.5">km/h</span>
                          </>
                        ) : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Rain</div>
                      <div className="text-xl font-semibold">
                        {s.latest.precip_total_mm !== null ? (
                          <>
                            {s.latest.precip_total_mm}
                            <span className="text-xs font-normal text-gray-400 ml-0.5">mm</span>
                          </>
                        ) : "—"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">No data yet</div>
                )}

                {s.latest && (
                  <div className="text-xs text-gray-400 mt-3">
                    {new Date(s.latest.observed_at).toLocaleString()}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
