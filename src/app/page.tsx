"use client";

import { useEffect, useState } from "react";
import { Station } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { CardSkeleton } from "@/components/ui";
import { relativeTime, localTime } from "@/lib/time";

interface StationWithLatest extends Station {
  latest: {
    temp_c: number | null;
    temp_indoor_c: number | null;
    wind_speed_kph: number | null;
    precip_total_mm: number | null;
    observed_at: string;
  } | null;
  avg_wind_kph: number | null;
  summary: string | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

interface RegionStats {
  count: number;
  avgTemp: number | null;
  warmest: StationWithLatest | null;
  windiest: StationWithLatest | null;
  maxRain: number | null;
}

/** Aggregate the current conditions of all stations in one region (country group). */
function regionStats(list: StationWithLatest[]): RegionStats {
  const withData = list.filter((s) => s.latest);
  const temps = withData.map((s) => s.latest!.temp_c).filter((v): v is number => v !== null);
  const avgTemp = temps.length ? r1(temps.reduce((a, b) => a + b, 0) / temps.length) : null;
  const byTemp = withData.filter((s) => s.latest!.temp_c !== null);
  const warmest = byTemp.length ? byTemp.reduce((m, s) => (s.latest!.temp_c! > m.latest!.temp_c! ? s : m)) : null;
  const byWind = withData.filter((s) => s.avg_wind_kph !== null);
  const windiest = byWind.length ? byWind.reduce((m, s) => (s.avg_wind_kph! > m.avg_wind_kph! ? s : m)) : null;
  const rains = withData.map((s) => s.latest!.precip_total_mm).filter((v): v is number => v !== null);
  const maxRain = rains.length ? r1(Math.max(...rains)) : null;
  return { count: withData.length, avgTemp, warmest, windiest, maxRain };
}

/** One-line summary headline for a region. */
function regionHeadline(s: RegionStats): string {
  const parts: string[] = [`${s.count} station${s.count === 1 ? "" : "s"}`];
  if (s.avgTemp !== null) parts.push(`avg ${s.avgTemp}°`);
  if (s.warmest && s.count > 1) parts.push(`warmest ${s.warmest.name} ${s.warmest.latest!.temp_c}°`);
  if (s.windiest && (s.windiest.avg_wind_kph ?? 0) > 0) parts.push(`windiest ${s.windiest.name} ${s.windiest.avg_wind_kph} km/h`);
  if (s.maxRain && s.maxRain > 0) parts.push(`up to ${s.maxRain} mm rain`);
  return parts.join(" · ");
}

/** Cross-region comparison line (warmest vs coolest region), or null if <2 regions report. */
function crossRegionHeadline(regions: { country: string; stats: RegionStats }[]): string | null {
  const withTemp = regions.filter((r) => r.stats.avgTemp !== null);
  if (withTemp.length < 2) return null;
  const warm = withTemp.reduce((m, r) => (r.stats.avgTemp! > m.stats.avgTemp! ? r : m));
  const cool = withTemp.reduce((m, r) => (r.stats.avgTemp! < m.stats.avgTemp! ? r : m));
  const diff = r1(warm.stats.avgTemp! - cool.stats.avgTemp!);
  if (diff < 0.1) return `All ${withTemp.length} regions are averaging about ${warm.stats.avgTemp}° right now.`;
  return `${warm.country} is the warmest region right now (avg ${warm.stats.avgTemp}°), ${cool.country} the coolest (${cool.stats.avgTemp}°) — ${diff}° apart.`;
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

function StationCard({ s, now }: { s: StationWithLatest; now: Date }) {
  const stale =
    s.latest &&
    (now.getTime() - new Date(s.latest.observed_at).getTime()) / 60000 >
      (s.source === "weathercloud" ? 120 : 30);
  const time = localTime(s.timezone, now);

  return (
    <a
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
          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
            <span>{s.source === "weathercloud" ? s.source_id : s.wunderground_id}</span>
            {time && <span className="text-slate-500">· {time} local</span>}
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
          {s.summary && (
            <p className="text-xs text-slate-500 mt-4 leading-relaxed border-t border-slate-100 pt-3">
              {s.summary}
            </p>
          )}
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
}

export default function Home() {
  const [stations, setStations] = useState<StationWithLatest[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

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
    const clock = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => {
      supabaseBrowser.removeChannel(channel);
      clearInterval(fallback);
      clearInterval(clock);
    };
  }, []);

  // Group by country; stations without one fall into "Other". The primary
  // station's country is shown first, then the rest alphabetically.
  const groups = new Map<string, StationWithLatest[]>();
  for (const s of stations) {
    const key = s.country ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const primaryCountry = stations.find((s) => s.is_primary)?.country ?? null;
  const countries = Array.from(groups.keys()).sort((a, b) => {
    if (a === primaryCountry) return -1;
    if (b === primaryCountry) return 1;
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });

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
        <div className="space-y-8">
          {(() => {
            const regionData = countries.map((country) => ({ country, stats: regionStats(groups.get(country)!) }));
            const cross = crossRegionHeadline(regionData);
            return (
              <>
                {cross && (
                  <div className="bg-sky-50 border border-sky-100 rounded-xl p-4">
                    <h2 className="text-sm font-medium text-sky-800 mb-1">Across regions</h2>
                    <p className="text-sm text-slate-700 leading-relaxed">{cross}</p>
                  </div>
                )}
                {countries.map((country) => (
                  <section key={country}>
                    <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-1">
                      {country}
                    </h2>
                    <p className="text-xs text-slate-500 mb-3">{regionHeadline(regionStats(groups.get(country)!))}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {groups.get(country)!.map((s) => (
                        <StationCard key={s.id} s={s} now={now} />
                      ))}
                    </div>
                  </section>
                ))}
              </>
            );
          })()}
        </div>
      )}
    </main>
  );
}
