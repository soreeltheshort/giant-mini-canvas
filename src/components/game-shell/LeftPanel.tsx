import {
  Flame, Coins, Star, Factory, Shield, Scale,
  Scroll, Swords, Landmark, Hammer, ChevronRight,
} from "lucide-react";
import type { GameMode, GlobalStats, NewsStory } from "./gameShellTypes";
import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";

interface LeftPanelProps {
  stats: GlobalStats;
  news: NewsStory[];
  activeMode: GameMode;
  onModeChange: (mode: GameMode) => void;
  onViewNews: () => void;
}

const STAT_ITEMS: { key: keyof GlobalStats; label: string; icon: React.ElementType; format?: (v: number) => string }[] = [
  { key: "cinders", label: "Cinders", icon: Flame, format: (v) => v.toLocaleString() },
  { key: "treasury", label: "Treasury", icon: Coins, format: (v) => `₡${v.toLocaleString()}` },
  { key: "influence", label: "Influence", icon: Star },
  { key: "production", label: "Production", icon: Factory },
  { key: "militaryReadiness", label: "Readiness", icon: Shield },
  { key: "stability", label: "Stability", icon: Scale },
];

const MODE_ITEMS: { id: GameMode; label: string; icon: React.ElementType }[] = [
  { id: "diplomacy", label: "Diplomacy", icon: Landmark },
  { id: "military", label: "Military", icon: Swords },
  { id: "production", label: "Production", icon: Hammer },
];

const CATEGORY_COLORS: Record<string, string> = {
  diplomatic: "info",
  military: "danger",
  economic: "success",
  event: "warning",
};

export default function LeftPanel({ stats, news, activeMode, onModeChange, onViewNews }: LeftPanelProps) {
  const unreadCount = news.filter((n) => !n.read).length;
  const latestUnread = news.find((n) => !n.read);

  return (
    <aside className="w-56 bg-marble flex flex-col border-r-2 border-bronze/40 relative z-20 shrink-0">
      {/* ── Global Stats ── */}
      <div className="p-3 space-y-2 border-b border-border">
        <h3 className="font-heading text-[10px] font-semibold uppercase tracking-[0.15em] text-bronze-dark">
          Provincial Status
        </h3>
        <div className="space-y-1.5">
          {STAT_ITEMS.map(({ key, label, icon: Icon, format }) => {
            const val = stats[key];
            const isBar = key === "militaryReadiness" || key === "stability" || key === "influence";
            return (
              <div key={key}>
                {isBar ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3 h-3 text-bronze" />
                      <ProgressBar
                        label={label}
                        value={val}
                        max={100}
                        color={val >= 70 ? "bronze" : val >= 40 ? "bronze" : "crimson"}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3 h-3 text-bronze" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground font-heading">
                      {format ? format(val) : val}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── News Feed ── */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Scroll className="w-3 h-3 text-bronze" />
            <h3 className="font-heading text-[10px] font-semibold uppercase tracking-[0.15em] text-bronze-dark">
              Dispatches
            </h3>
          </div>
          {unreadCount > 0 && (
            <span className="w-5 h-5 bg-crimson text-primary-foreground text-[9px] font-bold flex items-center justify-center rounded-sm">
              {unreadCount}
            </span>
          )}
        </div>

        {latestUnread ? (
          <div className="bg-ivory border border-border rounded-sm p-2 space-y-1.5 bronze-glow-hover">
            <div className="flex items-start gap-1.5">
              <StatusBadge variant={CATEGORY_COLORS[latestUnread.category] as any || "neutral"}>
                {latestUnread.category}
              </StatusBadge>
              <span className="text-[9px] text-muted-foreground ml-auto">T{latestUnread.turn}</span>
            </div>
            <p className="text-[11px] font-semibold text-foreground leading-tight">{latestUnread.headline}</p>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">No new dispatches.</p>
        )}

        <button
          onClick={onViewNews}
          className="flex items-center gap-1 text-[10px] font-heading font-semibold uppercase tracking-wider text-crimson hover:text-crimson-light transition-colors w-full justify-center py-1 border border-border rounded-sm hover:border-bronze/40 bg-ivory"
        >
          View Dispatches <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* ── Mode Navigation ── */}
      <div className="p-3 flex-1 space-y-1.5">
        <h3 className="font-heading text-[10px] font-semibold uppercase tracking-[0.15em] text-bronze-dark mb-2">
          Command
        </h3>
        {MODE_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeMode === id;
          return (
            <button
              key={id}
              onClick={() => onModeChange(id)}
              className={`
                w-full flex items-center gap-2.5 px-2.5 py-2 rounded-sm text-left
                transition-all duration-150
                ${active
                  ? "bg-crimson text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-ivory-dark bronze-glow-hover"
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs font-heading font-semibold uppercase tracking-wider">{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Bottom: Turn indicator ── */}
      <div className="p-3 border-t border-border">
        <button className="w-full py-2 bg-crimson text-primary-foreground rounded-sm font-heading text-xs font-semibold uppercase tracking-wider hover:bg-crimson-light transition-colors bronze-glow-hover">
          Submit Orders
        </button>
      </div>
    </aside>
  );
}
