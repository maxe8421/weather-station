"use client";

import { useEffect, useState } from "react";
import { Station } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { CardSkeleton } from "@/components/ui";
import { relativeTime } from "@/lib/time";

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

function Stat({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className="text-lg font-semibold text-slate-800">
        {value !== null ? (
          <>
            {value}
            {unit && <span className="text-xs font-normal text-slate-400 ml-0.5">{unit}</span>}
          </>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [stations, setStations] = useState<StationWithLatest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch("/api/latest")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setStations(data);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    load();

    const channel = supabaseBrowser
      .channel("home-readings")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "weather_readings" },
        () => load()
      )
      .subscribe();

    const fallback = setInterval(load, 5 * 60 * 1000);
    return () => {
      supabaseBrowser.removeChannel(channel);
      clearInterval(fallback);
    };
  }, []);

  return (
    <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Stations</h1>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : stations.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-slate-200 text-center">
          <p className="text-slate-600">No stations yet.</p>
          <a href="/stations" className="text-sky-600 hover:text-sky-700 text-sm mt-2 inline-block">
            Add your first station →
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {stations.map((s) => {
            const stale =
              s.latest &&
              (Date.now() - new Date(s.latest.observed_at).getTime()) / 60000 >
                (s.source === "weathercloud" ? 120 : 30);
            return (
              <a
                key={s.id}
                href={`/station/${s.id}`}
                className="group bg-white rounded-xl p-5 border border-slate-200 hover:border-sky-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 truncate">{s.name}</span>
                      {s.is_primary && (
                        <span className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full shrink-0">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {s.source === "weathercloud" ? s.source_id : s.wunderground_id}
                    </div>
                  </div>
                  <span className="text-slate-300 group-hover:text-sky-400 transition-colors text-lg leading-none">
                    ›
                  </span>
                </div>

                {s.latest ? (
                  <>
                    <div className="flex items-end justify-between">
                      <div className="text-4xl font-semibold tracking-tight text-slate-900 leading-none">
                        {s.latest.temp_c !== null ? `${s.latest.temp_c}°` : "—"}
                      </div>
                      {s.latest.temp_indoor_c !== null && (
                        <div className="text-xs text-slate-500 pb-1">
                          Indoor <span className="font-medium text-slate-700">{s.latest.temp_indoor_c}°</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <Stat label="Wind (1 hr avg)" value={s.avg_wind_kph} unit="km/h" />
                      <Stat label="Rain today" value={s.latest.precip_total_mm} unit="mm" />
                    </div>
                    <div
                      className={`text-xs mt-4 flex items-center gap-1.5 ${
                        stale ? "text-amber-600" : "text-slate-400"
                      }`}
                    >
                      {stale && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />}
                      {stale ? "Stale · " : ""}
                      {relativeTime(s.latest.observed_at)}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-400 py-4">No data yet</div>
                )}
              </a>
            );
          })}
        </div>
      )}
    </main>
  );
}
