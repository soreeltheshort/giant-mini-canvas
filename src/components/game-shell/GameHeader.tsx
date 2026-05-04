import { Link } from "react-router-dom";
import type { GlobalStats } from "./gameShellTypes";

interface GameHeaderProps {
  gameName: string;
  turnNumber: number;
  factionName: string;
  playerName: string;
  backTo: string;
  /** When true, the viewer is an admin impersonating a player — show the player name. */
  isImpersonating?: boolean;
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
  isImpersonating = false,
}: GameHeaderProps) {
  return (
    <header className="h-11 flex items-center justify-between px-4 bg-marble border-b-2 border-bronze/60 relative z-30 shrink-0">
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
        <span className="font-heading text-sm font-semibold text-accent">{gameName}</span>
        <span className="text-bronze/40">|</span>
        <span className="font-heading text-sm font-semibold text-accent">
          Turn {turnNumber}
        </span>
      </div>

      {/* Right: faction (and player name only when admin is impersonating) */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-[10px] font-heading font-semibold text-bronze-dark uppercase tracking-wider">{factionName}</p>
          {isImpersonating && (
            <p className="text-[9px] text-muted-foreground">Logged in as: {playerName}</p>
          )}
        </div>
      </div>
    </header>
  );
}
