"use client";

import { Station } from "@/lib/types";

interface Props {
  stations: Station[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function StationPicker({ stations, selected, onSelect }: Props) {
  return (
    <select
      value={selected || ""}
      onChange={(e) => onSelect(e.target.value)}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
    >
      {stations.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.wunderground_id}){s.is_primary ? " ★" : ""}
        </option>
      ))}
    </select>
  );
}
