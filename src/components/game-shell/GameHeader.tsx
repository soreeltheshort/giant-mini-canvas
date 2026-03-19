import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";

interface GameHeaderProps {
  gameName: string;
  turnNumber: number;
  factionName: string;
  playerName: string;
  backTo: string;
  resources?: { credits: number; materials: number; influence: number };
}

const LaurelIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2C9 6 4 8 4 12s5 6 8 10c3-4 8-6 8-10S15 6 12 2z" />
  </svg>
);

export default function GameHeader({
  gameName,
  turnNumber,
  factionName,
  playerName,
  backTo,
  resources = { credits: 12450, materials: 3200, influence: 87 },
}: GameHeaderProps) {
  return (
    <header className="h-12 flex items-center justify-between px-4 bg-marble border-b-2 border-bronze/60 relative z-30">
      {/* Left: title block */}
      <div className="flex items-center gap-3">
        <Link
          to={backTo}
          className="flex items-center gap-1.5 text-crimson hover:text-crimson-light transition-colors"
        >
          <LaurelIcon />
          <span className="font-heading font-bold text-sm tracking-wide uppercase">
            Third Republic
          </span>
        </Link>
        <span className="text-bronze/40">|</span>
        <span className="font-heading text-sm font-semibold text-foreground">{gameName}</span>
        <span className="text-xs text-muted-foreground font-medium">Turn {turnNumber}</span>
      </div>

      {/* Center: resource bar */}
      <div className="hidden md:flex items-center gap-6">
        <ResourceStat label="Credits" value={resources.credits.toLocaleString()} icon="₡" />
        <ResourceStat label="Materials" value={resources.materials.toLocaleString()} icon="◆" />
        <ResourceStat label="Influence" value={resources.influence.toString()} icon="★" />
      </div>

      {/* Right: faction & player */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs font-heading font-semibold text-bronze-dark uppercase tracking-wider">{factionName}</p>
          <p className="text-[10px] text-muted-foreground">{playerName}</p>
        </div>
        <button className="w-8 h-8 rounded-sm border border-bronze/40 bg-ivory-dark flex items-center justify-center text-bronze hover:border-bronze transition-colors bronze-glow-hover">
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

function ResourceStat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-bronze text-sm">{icon}</span>
      <div>
        <p className="text-xs font-semibold text-foreground leading-none">{value}</p>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}
