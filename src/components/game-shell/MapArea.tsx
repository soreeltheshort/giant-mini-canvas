import { MousePointer2 } from "lucide-react";

interface MapAreaProps {
  visibleSystems: number;
  onSystemClick?: () => void;
}

export default function MapArea({ visibleSystems, onSystemClick }: MapAreaProps) {
  return (
    <div
      className="flex-1 bg-ivory-dark relative overflow-hidden cursor-crosshair"
      onClick={onSystemClick}
    >
      {/* Grid overlay for visual interest */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(35 55% 45% / 0.3) 1px, transparent 1px),
            linear-gradient(90deg, hsl(35 55% 45% / 0.3) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />

      {/* Placeholder star dots */}
      <div className="absolute inset-0">
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-bronze/30 hover:bg-crimson/60 transition-colors cursor-pointer"
            style={{
              left: `${10 + ((i * 37) % 80)}%`,
              top: `${8 + ((i * 53) % 80)}%`,
            }}
            title={`System ${i + 1}`}
          />
        ))}
      </div>

      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center space-y-2 opacity-60">
          <MousePointer2 className="w-8 h-8 text-bronze mx-auto" />
          <p className="font-heading text-sm text-muted-foreground uppercase tracking-widest">
            Strategic Map
          </p>
          <p className="text-xs text-muted-foreground">
            {visibleSystems > 0
              ? `${visibleSystems} systems visible`
              : "Awaiting intelligence reports"}
          </p>
        </div>
      </div>
    </div>
  );
}
