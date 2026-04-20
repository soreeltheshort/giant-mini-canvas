import {
  Coins, Star, Crown, Target,
  Scroll, Swords, Landmark, Hammer, ChevronRight,
  TrendingUp, TrendingDown, Globe2, Sword,
} from "lucide-react";
import type { GameMode, GlobalStats, NewsStory, MapSelection } from "./gameShellTypes";
import { REGION_DETAILS, ARMY_DETAILS, PRODUCTION_DETAILS } from "./gameShellTypes";
import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";
import { ImperialCard } from "./ImperialCard";
import FleetDetailContent from "./FleetDetailContent";
import type { GameMapData } from "./ContextPanel";
import type { HexClassification } from "@/lib/mapTypes";
import { CLASSIFICATION_LABELS } from "@/lib/mapTypes";

interface LeftPanelProps {
  stats: GlobalStats;
  news: NewsStory[];
  activeMode: GameMode;
  onModeChange: (mode: GameMode) => void;
  onViewNews: () => void;
  /** Whether the player has marked their orders as submitted this turn. */
  ordersSubmitted?: boolean;
  /** Toggle order submission. */
  onSubmitOrders?: () => void;
  /** When true, render full-width (mobile stacked layout) instead of fixed 14rem rail. */
  fullWidth?: boolean;
  /** Inline context (used on tablet where right panel is hidden) */
  inlineContext?: {
    mode: GameMode;
    selection: MapSelection;
    news: NewsStory[];
    onClearSelection: () => void;
    gameData?: GameMapData;
    playerOwnerClassification?: string;
    fleetOrderContext?: { gameId: string; playerId: string; turnNumber: number };
    onStartTargeting?: (
      t: { mode: "hex"; orderType: "fleet_move"; fleetId: string }
        | { mode: "fleet"; orderType: "attack"; fleetId: string }
    ) => void;
    combatPointsAvailable?: number;
    onOrdersChanged?: () => void;
    /** Selection setter so the empty Strategic Overview can list-select planets/fleets/news. */
    onSelect?: (selection: MapSelection) => void;
  };
}

const STAT_ITEMS: { key: keyof GlobalStats; label: string; icon: React.ElementType; format?: (v: number) => string }[] = [
  { key: "treasury", label: "Treasury", icon: Coins, format: (v) => `₡${v.toLocaleString()}` },
  { key: "tribute", label: "Income", icon: TrendingUp, format: (v) => `+₡${v.toLocaleString()}` },
  { key: "maintenance", label: "Costs", icon: TrendingDown, format: (v) => `-₡${v.toLocaleString()}` },
  { key: "influence", label: "Influence", icon: Star, format: (v) => `${v}` },
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

export default function LeftPanel({ stats, news, activeMode, onModeChange, onViewNews, inlineContext, ordersSubmitted = false, onSubmitOrders, fullWidth = false }: LeftPanelProps) {
  const unreadCount = news.filter((n) => !n.read).length;
  const latestUnread = news.find((n) => !n.read);

  return (
    <aside className={`${fullWidth ? "w-full border-b-2 border-r-0" : "w-72 border-r-2"} bg-marble flex flex-col border-bronze/40 relative z-20 shrink-0 overflow-hidden`}>
      <div className="flex-1 overflow-y-auto">
        {/* ── Global Stats ── */}
        <div className="p-3 space-y-2 border-b border-border">
          <div className="space-y-1.5">
            {STAT_ITEMS.map(({ key, label, icon: Icon, format }) => {
              const val = stats[key];
              return (
                <div key={key}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3 h-3 text-bronze" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground font-heading">
                      {format ? format(val) : val}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Capability Ratings ── */}
        <div className="p-3 space-y-1.5 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Crown className="w-3 h-3 text-bronze" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Admin</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-senate-dark font-heading">{stats.adminCapability}</span>
              <span className="text-[9px] text-muted-foreground">·</span>
              <span className="text-[10px] text-bronze font-semibold">{stats.adminPointsRemaining}pt</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Target className="w-3 h-3 text-bronze" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Combat</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-senate-dark font-heading">{stats.combatCapability}</span>
              <span className="text-[9px] text-muted-foreground">·</span>
              <span className="text-[10px] text-bronze font-semibold">{stats.combatPointsRemaining}pt</span>
              {(stats.combatPointsPending ?? 0) > 0 && (
                <span className="text-[10px] text-crimson font-bold">(-{stats.combatPointsPending})</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Mode Navigation (horizontal tabs) ── */}
        <div className="p-3 border-b border-border">
          <div className="flex items-stretch gap-1 rounded-sm border border-bronze/40 bg-ivory overflow-hidden">
            {MODE_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = activeMode === id;
              return (
                <button
                  key={id}
                  onClick={() => onModeChange(id)}
                  className={`
                    flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2
                    transition-all duration-150
                    ${active
                      ? "bg-crimson text-primary-foreground shadow-sm"
                      : "text-senate-dark hover:bg-ivory-dark bronze-glow-hover"
                    }
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-heading font-bold uppercase tracking-wider">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Inline Context (tablet mode) ── */}
        {inlineContext && (
          <InlineContextContent {...inlineContext} />
        )}
      </div>

      {/* ── Bottom: Submit Orders ── */}
      <div className="p-3 border-t border-border shrink-0 space-y-1.5">
        <button
          onClick={onSubmitOrders}
          disabled={!onSubmitOrders}
          className={`w-full py-2 rounded-sm font-heading text-xs font-semibold uppercase tracking-wider transition-colors bronze-glow-hover ${
            ordersSubmitted
              ? "bg-ivory border border-bronze/60 text-bronze-dark hover:bg-ivory-dark"
              : "bg-crimson text-primary-foreground hover:bg-crimson-light"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {ordersSubmitted ? "Withdraw Orders" : "Submit Orders"}
        </button>
        {ordersSubmitted && (
          <p className="text-[9px] font-heading uppercase tracking-widest text-center text-bronze-dark">
            ✓ Submitted — you may keep editing
          </p>
        )}
      </div>
    </aside>
  );
}

/* ── Inline Context Content (mirrors ContextPanel content) ── */
function InlineContextContent({ mode, selection, news, onClearSelection, gameData, playerOwnerClassification, fleetOrderContext, onStartTargeting, combatPointsAvailable, onOrdersChanged, onSelect }: {
  mode: GameMode;
  selection: MapSelection;
  news: NewsStory[];
  onClearSelection: () => void;
  gameData?: GameMapData;
  playerOwnerClassification?: string;
  fleetOrderContext?: { gameId: string; playerId: string; turnNumber: number };
  onStartTargeting?: (t: { mode: "hex"; orderType: "fleet_move"; fleetId: string } | { mode: "fleet"; orderType: "attack"; fleetId: string }) => void;
  combatPointsAvailable?: number;
  onOrdersChanged?: () => void;
  onSelect?: (selection: MapSelection) => void;
}) {
  const getModeIcon = () => {
    if (selection.type === "news") return <Scroll className="w-3.5 h-3.5" />;
    const icons = { diplomacy: Landmark, military: Swords, production: Hammer };
    const Icon = icons[mode];
    return <Icon className="w-3.5 h-3.5" />;
  };

  const getTitle = (): string => {
    if (selection.type === "news") return "Dispatch";
    if (selection.type === "region") return "System Detail";
    if (selection.type === "army") return "Fleet Detail";
    if (selection.type === "production-center") return "Production";
    if (selection.type === "faction") return "Faction Intel";
    const titles = { diplomacy: "Diplomatic Overview", military: "Strategic Overview", production: "Production Overview" };
    return titles[mode];
  };

  return (
    <div className="border-t-2 border-bronze/40">
      <div className="h-10 flex items-center px-3 border-b border-border bronze-border-b">
        <h3 className="font-heading text-[10px] font-semibold uppercase tracking-[0.15em] text-bronze-dark flex items-center gap-1.5">
          {getModeIcon()}
          {getTitle()}
        </h3>
      </div>
      <div className="p-3 space-y-3">
        {selection.type === "news" ? (
          <InlineNewsDetail story={news.find((n) => n.id === selection.id)} />
        ) : selection.type === "region" ? (
          <InlineRegionDetail id={selection.id} gameData={gameData} />
        ) : selection.type === "army" ? (
          <InlineArmyDetail id={selection.id} gameData={gameData} playerOwnerClassification={playerOwnerClassification} fleetOrderContext={fleetOrderContext} onStartTargeting={onStartTargeting} combatPointsAvailable={combatPointsAvailable} onOrdersChanged={onOrdersChanged} />
        ) : selection.type === "production-center" ? (
          <InlineProductionDetail id={selection.id} />
        ) : selection.type === "faction" ? (
          <InlineFactionDetail id={selection.id} />
        ) : (
          <InlineEmptyState mode={mode} news={news} gameData={gameData} playerOwnerClassification={playerOwnerClassification} onSelect={onSelect} />
        )}
      </div>
      {selection.type !== "none" && (
        <div className="px-3 pb-3">
          <button
            onClick={onClearSelection}
            className="w-full text-center text-[10px] font-heading uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors py-1 border border-border rounded-sm"
          >
            ← Back to overview
          </button>
        </div>
      )}
    </div>
  );
}

const NEWS_CATEGORY_VARIANT: Record<NewsStory["category"], "info" | "danger" | "success" | "warning"> = {
  diplomatic: "info",
  military: "danger",
  economic: "success",
  event: "warning",
};

/* ── Inline detail sub-components ── */
function InlineEmptyState({ mode, news, gameData, playerOwnerClassification, onSelect }: {
  mode: GameMode;
  news?: NewsStory[];
  gameData?: GameMapData;
  playerOwnerClassification?: string;
  onSelect?: (selection: MapSelection) => void;
}) {
  if (mode === "military") {
    const playerFactionName = playerOwnerClassification
      ? CLASSIFICATION_LABELS[playerOwnerClassification as HexClassification] ?? null
      : null;
    const matchesOwner = (owner: string | undefined | null) => {
      if (!owner || !playerOwnerClassification) return false;
      return owner === playerOwnerClassification || (!!playerFactionName && owner === playerFactionName);
    };
    const ownedSystems = gameData
      ? Array.from(gameData.systems.values())
          .filter((s) => matchesOwner(s.owner))
          .sort((a, b) => a.system_name.localeCompare(b.system_name))
      : [];
    const ownedFleets = gameData
      ? gameData.fleets
          .filter((f) => matchesOwner(f.owner_classification))
          .slice()
          .sort((a, b) => a.fleet_name.localeCompare(b.fleet_name))
      : [];
    return (
      <>

        <ImperialCard title={`Planets (${ownedSystems.length})`}>
          {ownedSystems.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">No systems under your control.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
              {ownedSystems.map((s) => (
                <button
                  key={s.system_id}
                  onClick={() => onSelect?.({ type: "region", id: `sys-${s.system_id}` })}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm border border-border bg-ivory hover:border-bronze/60 bronze-glow-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Globe2 className="w-3 h-3 text-bronze shrink-0" />
                    <span className="text-[11px] font-semibold text-senate-dark truncate">{s.system_name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] text-senate-dark/70">Cnd {s.condition}</span>
                    <ChevronRight className="w-3 h-3 text-senate-dark/60" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </ImperialCard>

        <ImperialCard title={`Fleets (${ownedFleets.length})`}>
          {ownedFleets.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">No fleets in service.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
              {ownedFleets.map((f) => (
                <button
                  key={f.fleet_id}
                  onClick={() => onSelect?.({ type: "army", id: `fleet-${f.fleet_id}` })}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm border border-border bg-ivory hover:border-bronze/60 bronze-glow-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sword className="w-3 h-3 text-bronze shrink-0" />
                    <span className="text-[11px] font-semibold text-senate-dark truncate">{f.fleet_name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] text-senate-dark/70">{f.hex_x},{f.hex_y}</span>
                    <ChevronRight className="w-3 h-3 text-senate-dark/60" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </ImperialCard>
      </>
    );
  }

  const content = {
    diplomacy: { stats: [{ label: "Active Treaties", value: "3" }, { label: "Pending Proposals", value: "1" }, { label: "Senate Standing", value: "Favorable" }] },
    production: { stats: [{ label: "Active Facilities", value: "4" }, { label: "Queue Items", value: "3" }, { label: "Avg Efficiency", value: "72%" }] },
  } as const;
  const c = content[mode as "diplomacy" | "production"];
  return (
    <ImperialCard title="Summary">
      <div className="space-y-2">
        {c.stats.map((s) => (
          <div key={s.label} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-semibold">{s.value}</span>
          </div>
        ))}
      </div>
    </ImperialCard>
  );
}

function InlineRegionDetail({ id, gameData }: { id: string; gameData?: GameMapData }) {
  const sysId = id.startsWith("sys-") ? parseInt(id.replace("sys-", ""), 10) : NaN;
  const realSys = !isNaN(sysId) && gameData
    ? Array.from(gameData.systems.values()).find(s => s.system_id === sysId)
    : undefined;

  if (realSys) {
    const facilityNames = (realSys.facilities || []).map(f => {
      const ft = gameData!.facilityTypes.find(t => t.facility_type_id === f.facility_type_id);
      return { name: ft?.name || f.facility_type_id, icon: ft?.icon || "🏭", qty: f.quantity };
    });
    const conditionVariant = realSys.condition >= 70 ? "success" : realSys.condition >= 40 ? "warning" : "danger";
    const classLabel = CLASSIFICATION_LABELS[realSys.classification as HexClassification] || realSys.classification;
    return (
      <>
        <ImperialCard title={realSys.system_name} subtitle={classLabel}>
          <div className="space-y-2">
            <Row label="Population" value={realSys.current_population > 0 ? realSys.current_population.toLocaleString() : "Uninhabited"} />
            <Row label="Condition"><StatusBadge variant={conditionVariant}>{realSys.condition}</StatusBadge></Row>
            <Row label="Morale" value={`${realSys.morale}`} />
            <Row label="Resources" value={`${realSys.resources}`} />
          </div>
        </ImperialCard>
        {facilityNames.length > 0 && (
          <ImperialCard title="Facilities">
            <div className="space-y-1.5">
              {facilityNames.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                  <span>{f.icon} {f.name}</span>
                  <span className="font-semibold text-bronze">×{f.qty}</span>
                </div>
              ))}
            </div>
          </ImperialCard>
        )}
      </>
    );
  }

  const d = REGION_DETAILS[id];
  if (!d) return <p className="text-xs text-muted-foreground">Unknown system.</p>;
  return (
    <>
      <ImperialCard title={d.name} subtitle={d.classification}>
        <div className="space-y-2">
          <Row label="Population" value={d.population} />
          <Row label="Condition"><StatusBadge variant={d.condition === "Stable" || d.condition === "Prosperous" ? "success" : d.condition === "Contested" ? "danger" : "info"}>{d.condition}</StatusBadge></Row>
          <Row label="Garrison" value={d.garrison} />
        </div>
      </ImperialCard>
      <ImperialCard title="Resources">
        <div className="space-y-2.5">
          {d.resources.map((r) => (
            <ProgressBar key={r.label} label={r.label} value={r.value} max={r.max} color={r.value >= 70 ? "bronze" : r.value >= 40 ? "bronze" : "crimson"} />
          ))}
        </div>
      </ImperialCard>
    </>
  );
}

function InlineArmyDetail({ id, gameData, playerOwnerClassification, fleetOrderContext, onStartTargeting, combatPointsAvailable, onOrdersChanged }: { id: string; gameData?: GameMapData; playerOwnerClassification?: string; fleetOrderContext?: { gameId: string; playerId: string; turnNumber: number }; onStartTargeting?: (t: { mode: "hex"; orderType: "fleet_move"; fleetId: string } | { mode: "fleet"; orderType: "attack"; fleetId: string }) => void; combatPointsAvailable?: number; onOrdersChanged?: () => void }) {
  const fleetId = id.startsWith("fleet-") ? id.replace("fleet-", "") : null;
  const realFleet = fleetId && gameData ? gameData.fleets.find(f => f.fleet_id === fleetId) : undefined;

  if (realFleet) {
    const canEdit = !!playerOwnerClassification && realFleet.owner_classification === playerOwnerClassification;
    return <FleetDetailContent fleet={realFleet} shipTypes={gameData?.shipTypes} allFleets={gameData?.fleets} canEdit={canEdit} orderContext={fleetOrderContext} onStartTargeting={onStartTargeting} combatPointsAvailable={combatPointsAvailable} onOrdersChanged={onOrdersChanged} />;
  }

  const d = ARMY_DETAILS[id];
  if (!d) return <p className="text-xs text-muted-foreground">Unknown fleet.</p>;
  return (
    <>
      <ImperialCard title={d.name} subtitle={`Commander: ${d.commander}`}>
        <div className="space-y-2">
          <Row label="Status"><StatusBadge variant={d.status === "Alert" ? "warning" : "info"}>{d.status}</StatusBadge></Row>
          <ProgressBar label="Strength" value={d.strength} max={d.maxStrength} color="bronze" />
          <ProgressBar label="Morale" value={d.morale} max={100} color={d.morale >= 70 ? "bronze" : "crimson"} />
        </div>
      </ImperialCard>
      <ImperialCard title="Fleet Composition">
        <div className="space-y-1.5">
          {d.ships.map((s) => (
            <div key={s.name} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
              <span>{s.name}</span>
              <span className="font-semibold text-bronze">×{s.count}</span>
            </div>
          ))}
        </div>
      </ImperialCard>
    </>
  );
}

function InlineProductionDetail({ id }: { id: string }) {
  const d = PRODUCTION_DETAILS[id];
  if (!d) return <p className="text-xs text-muted-foreground">Unknown facility.</p>;
  return (
    <>
      <ImperialCard title={d.name} subtitle={d.type}>
        <div className="space-y-2">
          <ProgressBar label="Output" value={d.output} max={d.capacity} color="bronze" />
          <ProgressBar label="Efficiency" value={d.efficiency} max={100} color={d.efficiency >= 70 ? "bronze" : "crimson"} />
        </div>
      </ImperialCard>
      <ImperialCard title="Build Queue">
        <div className="space-y-1.5">
          {d.queue.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">Queue empty.</p>
          ) : d.queue.map((q, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
              <span>{q.item}</span>
              <span className="text-muted-foreground">{q.turns}T</span>
            </div>
          ))}
        </div>
      </ImperialCard>
    </>
  );
}

function InlineFactionDetail({ id }: { id: string }) {
  return (
    <ImperialCard title="Faction Intelligence">
      <div className="space-y-2">
        <Row label="Faction" value={id} />
        <Row label="Relations"><StatusBadge variant="warning">Neutral</StatusBadge></Row>
        <Row label="Military Posture"><StatusBadge variant="info">Defensive</StatusBadge></Row>
        <Row label="Trade Status" value="Open" />
      </div>
    </ImperialCard>
  );
}

function InlineNewsDetail({ story }: { story?: NewsStory }) {
  if (!story) return <p className="text-xs text-muted-foreground">Dispatch not found.</p>;
  return (
    <ImperialCard title={story.headline} subtitle={`Turn ${story.turn} · ${story.category}`}>
      <p className="text-xs text-foreground leading-relaxed">{story.summary}</p>
    </ImperialCard>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children || <span className="font-semibold text-foreground">{value}</span>}
    </div>
  );
}
