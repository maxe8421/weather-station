"use client";

import { useEffect, useState } from "react";
import { Station } from "@/lib/types";
import { Toast, ConfirmDialog } from "@/components/ui";

const HINTS: Record<string, string> = {
  wunderground: "Station ID from wunderground.com, e.g. IKINGS664",
  weathercloud: "Device ID (e.g. 3326837048) or a 4-letter airport code (e.g. CYZE)",
};

export default function StationsPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [name, setName] = useState("");
  const [stationId, setStationId] = useState("");
  const [source, setSource] = useState<"wunderground" | "weathercloud">("wunderground");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Station | null>(null);

  const fetchStations = () => {
    fetch("/api/stations")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setStations(data);
      })
      .catch(() => {});
  };

  useEffect(fetchStations, []);

  const verifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setVerifying(true);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "x-admin-secret": password },
      });
      if (res.ok) setAuthenticated(true);
      else setAuthError("Incorrect password");
    } catch {
      setAuthError("Could not verify password");
    } finally {
      setVerifying(false);
    }
  };

  const authHeaders = { "Content-Type": "application/json", "x-admin-secret": password };

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
      setToast(`Added ${name}`);
      setName("");
      setStationId("");
      fetchStations();
    }
    setAdding(false);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const station = pendingDelete;
    setPendingDelete(null);
    const res = await fetch("/api/stations", {
      method: "DELETE",
      headers: authHeaders,
      body: JSON.stringify({ id: station.id }),
    });
    if (res.ok) {
      setToast(`Removed ${station.name}`);
      fetchStations();
    }
  };

  const inputClass =
    "w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400";

  if (!authenticated) {
    return (
      <main className="max-w-sm mx-auto px-4 py-20 w-full">
        <a
          href="/"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4"
        >
          <span aria-hidden="true">←</span> All stations
        </a>
        <h1 className="text-xl font-semibold text-slate-900 mb-6 text-center">Manage stations</h1>
        <form onSubmit={verifyPassword} className="bg-white rounded-xl p-6 border border-slate-200">
          <label htmlFor="admin-pw" className="block text-sm text-slate-600 mb-2">
            Admin password
          </label>
          <input
            id="admin-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={`${inputClass} mb-4`}
          />
          <button
            type="submit"
            disabled={verifying}
            className="w-full px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
          >
            {verifying ? "Checking…" : "Continue"}
          </button>
          {authError && <p className="text-red-600 text-sm mt-3 text-center">{authError}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 w-full">
      <a
        href="/"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-2"
      >
        <span aria-hidden="true">←</span> All stations
      </a>
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Manage stations</h1>

      <form onSubmit={addStation} className="bg-white rounded-xl p-5 border border-slate-200 mb-8">
        <h2 className="font-medium text-slate-800 mb-4">Add a station</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as "wunderground" | "weathercloud")}
              className={inputClass}
            >
              <option value="wunderground">Weather Underground</option>
              <option value="weathercloud">Weathercloud</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Display name</label>
            <input
              type="text"
              placeholder="e.g. Kingston"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-500 mb-1">Station ID</label>
          <input
            type="text"
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            required
            className={inputClass}
          />
          <p className="text-xs text-slate-400 mt-1">{HINTS[source]}</p>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add station"}
          </button>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </form>

      <div className="space-y-3">
        {stations.map((s) => (
          <div
            key={s.id}
            className="bg-white rounded-xl p-4 border border-slate-200 flex items-center justify-between"
          >
            <div className="min-w-0">
              <div className="font-medium text-slate-900 flex items-center gap-2">
                <span className="truncate">{s.name}</span>
                {s.is_primary && (
                  <span className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full shrink-0">
                    Primary
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-500">
                {s.source === "weathercloud" ? `Weathercloud · ${s.source_id}` : s.wunderground_id}
              </div>
              {s.latitude && s.longitude && (
                <div className="text-xs text-slate-400">
                  {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                </div>
              )}
            </div>
            {s.is_primary ? (
              <span className="text-xs text-slate-400">Can’t remove</span>
            ) : (
              <button
                onClick={() => setPendingDelete(s)}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          message={`Remove ${pendingDelete.name}? Its stored history will be deleted.`}
          confirmLabel="Remove"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </main>
  );
}
