"use client";

import { use } from "react";
import Dashboard from "@/components/Dashboard";

export default function StationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Dashboard stationId={id} />
    </main>
  );
}
