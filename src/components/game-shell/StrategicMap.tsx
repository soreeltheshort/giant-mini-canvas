import { useState } from "react";
import type { GameMode, MapMarker, MapSelection } from "./gameShellTypes";

interface StrategicMapProps {
  markers: MapMarker[];
  mode: GameMode;
  selection: MapSelection;
  onSelect: (sel: MapSelection) => void;
}

const MODE_OVERLAYS: Record<GameMode, { gridColor: string; label: string }> = {
  diplomacy: { gridColor: "hsl(35 55% 45% / 0.08)", label: "Political View" },
  military: { gridColor: "hsl(0 65% 38% / 0.06)", label: "Strategic View" },
  production: { gridColor: "hsl(35 55% 45% / 0.1)", label: "Economy View" },
};

const MARKER_STYLES: Record<MapMarker["type"], { base: string; size: string; shape: string }> = {
  region: { base: "bg-bronze/20 border-bronze/50", size: "w-5 h-5", shape: "rounded-full" },
  army: { base: "bg-crimson/30 border-crimson/60", size: "w-4 h-4", shape: "rotate-45" },
  "faction-capital": { base: "bg-bronze/40 border-bronze", size: "w-6 h-6", shape: "rounded-sm" },
  "production-center": { base: "bg-amber-500/25 border-amber-600/50", size: "w-4 h-4", shape: "rounded-sm" },
};

const VISIBLE_TYPES: Record<GameMode, MapMarker["type"][]> = {
  diplomacy: ["region", "faction-capital"],
  military: ["region", "army", "faction-capital"],
  production: ["region", "production-center"],
};

export default function StrategicMap({ markers, mode, selection, onSelect }: StrategicMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const overlay = MODE_OVERLAYS[mode];
  const visibleTypes = VISIBLE_TYPES[mode];

  const visibleMarkers = markers.filter((m) => visibleTypes.includes(m.type));

  const isSelected = (id: string) =>
    (selection.type === "region" || selection.type === "army" || selection.type === "faction" || selection.type === "production-center") && selection.id === id;

  const handleClick = (m: MapMarker) => {
    if (m.type === "faction-capital") {
      onSelect({ type: "faction", id: m.faction || m.id });
    } else {
      onSelect({ type: m.type, id: m.id });
    }
  };

  return (
    <div className="flex-1 relative overflow-hidden bg-ivory-dark cursor-crosshair select-none">
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${overlay.gridColor} 1px, transparent 1px),
            linear-gradient(90deg, ${overlay.gridColor} 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Hex-like decorative rings */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-bronze/[0.06] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-bronze/[0.08] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] border border-bronze/[0.10] rounded-full" />
      </div>

      {/* Connection lines between regions */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
        {visibleMarkers
          .filter((m) => m.type === "region")
          .flatMap((a, i, arr) =>
            arr.slice(i + 1).map((b) => {
              const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
              if (dist > 35) return null;
              return (
                <line
                  key={`${a.id}-${b.id}`}
                  x1={`${a.x}%`} y1={`${a.y}%`}
                  x2={`${b.x}%`} y2={`${b.y}%`}
                  stroke="hsl(35 55% 45% / 0.12)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              );
            })
          )
          .filter(Boolean)}
      </svg>

      {/* Markers */}
      {visibleMarkers.map((m) => {
        const style = MARKER_STYLES[m.type];
        const sel = isSelected(m.id);
        const hov = hoveredId === m.id;
        return (
          <div
            key={m.id}
            className="absolute group"
            style={{ left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)" }}
          >
            {/* Pulse ring on select */}
            {sel && (
              <div className="absolute inset-0 -m-2 border-2 border-crimson/40 rounded-full animate-pulse pointer-events-none" />
            )}

            {/* Marker dot */}
            <button
              onClick={() => handleClick(m)}
              onMouseEnter={() => setHoveredId(m.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`
                ${style.size} ${style.shape}
                border-2 transition-all duration-150
                ${sel
                  ? "bg-crimson/50 border-crimson shadow-md shadow-crimson/20 scale-125"
                  : hov
                    ? "bg-bronze/40 border-bronze shadow-sm shadow-bronze/20 scale-110"
                    : style.base
                }
              `}
              title={m.label}
            />

            {/* Label */}
            <div
              className={`
                absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap
                font-heading text-[9px] uppercase tracking-wider
                transition-opacity duration-150 pointer-events-none
                ${sel ? "text-crimson font-bold opacity-100" : hov ? "text-foreground opacity-100" : "text-muted-foreground opacity-60"}
              `}
            >
              {m.label}
            </div>
          </div>
        );
      })}

      {/* Mode label */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <span className="font-heading text-[9px] uppercase tracking-[0.2em] text-bronze/50">
          {overlay.label}
        </span>
      </div>

      {/* Compass rose */}
      <div className="absolute bottom-3 right-3 pointer-events-none text-bronze/20">
        <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="1">
          <line x1="20" y1="2" x2="20" y2="38" />
          <line x1="2" y1="20" x2="38" y2="20" />
          <polygon points="20,2 18,8 22,8" fill="currentColor" />
          <text x="20" y="1" textAnchor="middle" fontSize="5" fill="currentColor" stroke="none">N</text>
        </svg>
      </div>
    </div>
  );
}
