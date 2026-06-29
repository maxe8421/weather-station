"use client";

import { useEffect, useState } from "react";
import { Station } from "@/lib/types";

export default function StationsPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [name, setName] = useState("");
  const [wuId, setWuId] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchStations = () => {
    fetch("/api/stations")
      .then((r) => r.json())
      .then(setStations);
  };

  useEffect(fetchStations, []);

  const addStation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAdding(true);

    const res = await fetch("/api/stations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, wunderground_id: wuId }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to add station");
    } else {
      setName("");
      setWuId("");
      fetchStations();
    }
    setAdding(false);
  };

  const deleteStation = async (id: string) => {
    if (!confirm("Remove this station?")) return;
    await fetch("/api/stations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchStations();
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Manage Stations</h1>
          <a href="/" className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400">
            ← Dashboard
          </a>
        </div>

        <form onSubmit={addStation} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
          <h2 className="font-medium mb-3">Add Station</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Station name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            />
            <input
              type="text"
              placeholder="Wunderground ID (e.g. KLAX123)"
              value={wuId}
              onChange={(e) => setWuId(e.target.value)}
              required
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            />
            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </form>

        <div className="space-y-3">
          {stations.map((s) => (
            <div
              key={s.id}
              className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">
                  {s.name}
                  {s.is_primary && <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">Primary</span>}
                </div>
                <div className="text-sm text-gray-500">{s.wunderground_id}</div>
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
