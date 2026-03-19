import { useState } from "react";
import { Scroll, Landmark, Swords, Hammer, AlertTriangle } from "lucide-react";
import {
  NewsOverlay,
  DiplomacyOverlay,
  MilitaryOverlay,
  ProductionOverlay,
  MajorEventOverlay,
} from "./OverlayVariants";

const DEMOS = [
  { id: "news", label: "News Dispatch", icon: Scroll, desc: "Standard two-column news story" },
  { id: "diplomacy", label: "Diplomacy", icon: Landmark, desc: "Expanded treaty negotiation" },
  { id: "military", label: "Military Order", icon: Swords, desc: "Standard fleet movement" },
  { id: "production", label: "Production Queue", icon: Hammer, desc: "Standard build management" },
  { id: "event", label: "Major Event", icon: AlertTriangle, desc: "Cinematic critical event" },
] as const;

type DemoId = (typeof DEMOS)[number]["id"];

export default function OverlayDemoBar() {
  const [activeOverlay, setActiveOverlay] = useState<DemoId | null>(null);

  const close = () => setActiveOverlay(null);

  return (
    <>
      {/* Trigger bar — positioned at bottom of map area */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-marble-dark/80 border-t border-border">
        <span className="text-[9px] font-heading uppercase tracking-[0.15em] text-muted-foreground mr-2">
          Overlays
        </span>
        {DEMOS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveOverlay(id)}
            className={`
              flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-heading uppercase tracking-wider
              border transition-all duration-150
              ${id === "event"
                ? "border-crimson/30 text-crimson hover:bg-crimson/10 hover:border-crimson/60"
                : "border-bronze/30 text-muted-foreground hover:text-foreground hover:border-bronze/60 hover:bg-ivory-dark bronze-glow-hover"
              }
            `}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Overlay instances */}
      <NewsOverlay open={activeOverlay === "news"} onClose={close} />
      <DiplomacyOverlay open={activeOverlay === "diplomacy"} onClose={close} />
      <MilitaryOverlay open={activeOverlay === "military"} onClose={close} />
      <ProductionOverlay open={activeOverlay === "production"} onClose={close} />
      <MajorEventOverlay open={activeOverlay === "event"} onClose={close} />
    </>
  );
}
