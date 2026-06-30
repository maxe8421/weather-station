"use client";

import { windDirToCompass } from "@/lib/utils";

/**
 * A small compass dial with an arrow pointing toward the direction the wind is
 * coming from (meteorological convention). North is up; the arrow rotates
 * clockwise with the bearing so 90° points east, etc. When `calm` (no wind), the
 * arrow is hidden — a reported bearing at 0 km/h is meaningless.
 */
export default function Compass({ deg, size = 64, calm = false }: { deg: number | null; size?: number; calm?: boolean }) {
  const compass = windDirToCompass(deg);
  const showArrow = deg !== null && !calm;
  const cardinals: [string, number, number][] = [
    ["N", 50, 13],
    ["E", 87, 53],
    ["S", 50, 91],
    ["W", 13, 53],
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={calm ? "Calm — no wind" : deg !== null ? `Wind from ${compass} (${deg}°)` : "No wind direction"}
    >
      <circle cx="50" cy="50" r="47" fill="white" stroke="#e2e8f0" strokeWidth="2" />
      {cardinals.map(([l, x, y]) => (
        <text key={l} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="600" fill="#94a3b8">
          {l}
        </text>
      ))}
      {showArrow && (
        <g transform={`rotate(${deg} 50 50)`}>
          <path d="M50 22 L45 34 L50 31 L55 34 Z" fill="#059669" />
          <line x1="50" y1="31" x2="50" y2="74" stroke="#059669" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      <circle cx="50" cy="50" r="3.5" fill="#334155" />
    </svg>
  );
}
