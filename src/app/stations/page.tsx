"use client";

import { useEffect, useState } from "react";
import { Station } from "@/lib/types";

export default function StationsPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [name, setName] = useState("");
  const [stationId, setStationId] = useState("");
  const [source, setSource] = useState<"wunderground" | "weathercloud">("wunderground");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);

  const fetchStations = () => {
    fetch("/api/stations")
      .then((r) => r.json())
      .then(setStations);
  };

  useEffect(fetchStations, []);

  const authHeaders = {
    "Content-Type": "application/json",
    "x-admin-secret": password,
  };

  const addStation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAdding(true);

    const res = await fetch("/api/stations", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name, source, station_id: stationId }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to add station");
    } else {
      setName("");
      setStationId("");
      fetchStations();
    }
    setAdding(false);
  };

  const deleteStation = async (id: string) => {
    if (!confirm("Remove this station?")) return;
    const res = await fetch("/api/stations", {
      method: "DELETE",
      headers: authHeaders,
      body: JSON.stringify({ id }),
    });
    if (res.ok) fetchStations();
  };

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-gray-50 text-gray-900">
        <div className="max-w-sm mx-auto px-4 py-24">
          <h1 className="text-2xl font-bold mb-6 text-center">Manage Stations</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAuthenticated(true);
            }}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"
          >
            <label className="block text-sm text-gray-500 mb-2">Admin password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm mb-4"
            />
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Continue
            </button>
          </form>
          <div className="text-center mt-4">
            <a href="/" className="text-sm text-blue-600 hover:text-blue-800">
              ← Home
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Manage Stations</h1>
          <a href="/" className="text-sm text-blue-600 hover:text-blue-800">
            ← Home
          </a>
        </div>

        <form onSubmit={addStation} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
          <h2 className="font-medium mb-3">Add Station</h2>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as "wunderground" | "weathercloud")}
                className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
              >
                <option value="wunderground">Weather Underground</option>
                <option value="weathercloud">Weathercloud</option>
              </select>
              <input
                type="text"
                placeholder="Station name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
              />
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder={source === "wunderground" ? "Wunderground ID (e.g. KLAX123)" : "Weathercloud device ID (e.g. 3326837048)"}
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                required
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
              />
              <button
                type="submit"
                disabled={adding}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {adding ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </form>

        <div className="space-y-3">
          {stations.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">
                  {s.name}
                  {s.is_primary && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Primary</span>}
                </div>
                <div className="text-sm text-gray-500">
                  {s.source === "weathercloud" ? `Weathercloud: ${s.source_id}` : s.wunderground_id}
                </div>
                {s.latitude && s.longitude && (
                  <div className="text-xs text-gray-400">{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}</div>
                )}
              </div>
              {!s.is_primary && (
                <button
                  onClick={() => deleteStation(s.id)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
