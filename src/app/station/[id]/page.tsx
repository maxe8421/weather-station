"use client";

import { use } from "react";
import Dashboard from "@/components/Dashboard";

export default function StationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Dashboard stationId={id} />
      </div>
    </main>
  );
}
