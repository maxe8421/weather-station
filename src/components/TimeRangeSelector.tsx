"use client";

import { TimeRange } from "@/lib/types";

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All Time" },
];

interface Props {
  selected: TimeRange;
  onSelect: (range: TimeRange) => void;
}

export default function TimeRangeSelector({ selected, onSelect }: Props) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onSelect(r.value)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            selected === r.value
              ? "bg-white shadow-sm font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
