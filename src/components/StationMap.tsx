"use client";

interface Props {
  latitude: number;
  longitude: number;
  name: string;
}

export default function StationMap({ latitude, longitude, name }: Props) {
  // Small bounding box around the point for a neighbourhood-level view.
  const d = 0.02;
  const bbox = [longitude - d, latitude - d, longitude + d, latitude + d]
    .map((n) => n.toFixed(5))
    .join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
  const link = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=13/${latitude}/${longitude}`;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">Location</h3>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          View larger map
        </a>
      </div>
      <iframe
        title={`Map showing the location of ${name}`}
        src={src}
        loading="lazy"
        className="w-full h-[220px] rounded-lg border border-gray-100"
      />
      <div className="text-xs text-gray-400 mt-2">
        {latitude.toFixed(4)}, {longitude.toFixed(4)}
      </div>
    </div>
  );
}
