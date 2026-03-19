import type { GameMode } from "./gameShellTypes";

interface BottomStripProps {
  mode: GameMode;
  turnNumber: number;
  factionName: string;
}

export default function BottomStrip({ mode, turnNumber, factionName }: BottomStripProps) {
  const modeLabels: Record<GameMode, string> = {
    diplomacy: "Diplomatic Mode",
    military: "Strategic Mode",
    production: "Production Mode",
  };

  return (
    <div className="h-6 bg-marble-dark border-t border-border flex items-center justify-between px-4 text-[9px] font-heading uppercase tracking-[0.15em] text-muted-foreground shrink-0 relative z-20">
      <div className="flex items-center gap-4">
        <span>{modeLabels[mode]}</span>
        <span className="text-bronze/40">|</span>
        <span>{factionName} Provincial Command</span>
      </div>
      <div className="flex items-center gap-4">
        <span>Turn {turnNumber}</span>
        <span className="text-bronze/40">|</span>
        <span className="text-bronze">Orders Pending</span>
      </div>
    </div>
  );
}
