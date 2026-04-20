import { useState } from "react";
import { Swords } from "lucide-react";
import { MilitaryOverlay } from "./OverlayVariants";

const DEMOS = [
  { id: "military", label: "Military Order", icon: Swords, desc: "Standard fleet movement" },
] as const;

type DemoId = (typeof DEMOS)[number]["id"];

export default function OverlayDemoBar() {
  const [activeOverlay, setActiveOverlay] = useState<DemoId | null>(null);

  const close = () => setActiveOverlay(null);

  return (
    <>
      {/* Trigger bar — positioned at bottom of map area */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-marble-dark/80 border-t border-border">
        {DEMOS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveOverlay(id)}
            className="
              flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-heading uppercase tracking-wider
              border transition-all duration-150
              border-bronze/30 text-muted-foreground hover:text-foreground hover:border-bronze/60 hover:bg-ivory-dark bronze-glow-hover
            "
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Overlay instances */}
      <MilitaryOverlay open={activeOverlay === "military"} onClose={close} />
    </>
  );
}
