import {
  Coins,
  Star,
  Crown,
  Target,
  Scroll,
  Swords,
  Landmark,
  Hammer,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Globe2,
  Sword,
} from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GameMode, GlobalStats, NewsStory, MapSelection } from "./gameShellTypes";
import { REGION_DETAILS, ARMY_DETAILS, PRODUCTION_DETAILS } from "./gameShellTypes";
import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";
import { ImperialCard } from "./ImperialCard";
import FleetDetailContent from "./FleetDetailContent";
import GarrisonCard from "./GarrisonCard";
import { type GameMapData, DispatchesCard } from "./ContextPanel";
import BuildShipsDialog from "./BuildShipsDialog";
import ShipProductionList from "./ShipProductionList";
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
  /** Open issues that block turn submission. Empty array = ready to submit. */
  submissionIssues?: string[];
  /** Solo game: button reads "Next Turn" and processes the turn in-place. */
  soloMode?: boolean;
  /** Disable + show processing label while the turn engine runs. */
  processingTurn?: boolean;
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
      t:
        | { mode: "hex"; orderType: "fleet_move"; fleetId: string }
        | { mode: "fleet"; orderType: "attack"; fleetId: string },
    ) => void;
    combatPointsAvailable?: number;
    onOrdersChanged?: () => void;
    /** Selection setter so the empty Military Overview can list-select planets/fleets/news. */
    onSelect?: (selection: MapSelection) => void;
    /** Submit a build_facility order for the selected system. */
    onBuildFacility?: (systemId: number, facilityTypeId: string) => void;
    /** Undo a build_facility order placed this turn. */
    onUndoBuildOrder?: (orderId: string) => void;
    /** Queue a cancel-without-refund for an in-progress facility from a previous turn. */
    onCancelInProduction?: (systemId: number, facilityTypeId: string) => void;
    /** Undo a queued cancel-build order placed this turn. */
    onUndoCancelBuild?: (systemId: number, facilityTypeId: string) => void;
    /** Pending build orders this turn keyed by system_id. */
    pendingBuildOrders?: Map<number, Array<{ orderId: string; facilityTypeId: string; cost: number; maintenance: number }>>;
    /** Pending cancel-build orders this turn keyed by system_id. */
    pendingCancelBuildOrders?: Map<number, Set<string>>;
    /** Player's current treasury, used to gate the Commission button. */
    playerTreasury?: number;
    /** Player's admin points still available this turn (gates Commission). */
    adminPointsAvailable?: number;
    /** Create a new empty fleet at a given hex (Military Overview action). */
    onCreateFleet?: (name: string, hexX: number, hexY: number) => Promise<void> | void;
    /** Begin map-click targeting for commissioning a fleet with a chosen name. */
    onStartCommissionTargeting?: (fleetName: string) => void;
  };
}

const STAT_ITEMS: { key: keyof GlobalStats; label: string; icon: React.ElementType; format?: (v: number) => string }[] =
  [
    { key: "treasury", label: "Treasury", icon: Coins, format: (v) => `₡${v.toLocaleString()}` },
    { key: "tribute", label: "Income", icon: TrendingUp, format: (v) => `+₡${v.toLocaleString()}` },
    { key: "maintenance", label: "Costs", icon: TrendingDown, format: (v) => `-₡${v.toLocaleString()}` },
    { key: "influence", label: "Influence", icon: Star, format: (v) => `${v}` },
  ];

const MODE_ITEMS: { id: GameMode; label: string; icon: React.ElementType }[] = [
  { id: "diplomacy", label: "Politics", icon: Landmark },
  { id: "military", label: "Military", icon: Swords },
  { id: "production", label: "Economy", icon: Hammer },
];

const CATEGORY_COLORS: Record<string, string> = {
  diplomatic: "info",
  military: "danger",
  economic: "success",
  event: "warning",
};

export default function LeftPanel({
  stats,
  news,
  activeMode,
  onModeChange,
  onViewNews,
  inlineContext,
  ordersSubmitted = false,
  onSubmitOrders,
  submissionIssues = [],
  soloMode = false,
  processingTurn = false,
  fullWidth = false,
}: LeftPanelProps) {
  const unreadCount = news.filter((n) => !n.read).length;
  const latestUnread = news.find((n) => !n.read);

  return (
    <aside
      className={`${fullWidth ? "w-full border-b-2 border-r-0" : "w-72 border-r-2"} bg-marble flex flex-col border-bronze/40 relative z-20 shrink-0 overflow-hidden`}
    >
      <div className="flex-1 overflow-y-auto">
        {/* ── Global Stats ── */}
        <div className="p-3 space-y-2 border-b border-border">
          <div className="space-y-1.5">
            {STAT_ITEMS.map(({ key, label, icon: Icon, format }) => {
              const val = stats[key];
              const showCostsPending = key === "maintenance" && (stats.costsPending ?? 0) > 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3 h-3 text-bronze" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-semibold text-accent font-heading">
                        {format ? format(val) : val}
                      </span>
                      {showCostsPending && (
                        <span className="text-[10px] text-crimson font-bold">
                          (-₡{(stats.costsPending ?? 0).toLocaleString()})
                        </span>
                      )}
                    </div>
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
              {(stats.adminPointsPending ?? 0) > 0 && (
                <span className="text-[10px] text-crimson font-bold">(-{stats.adminPointsPending})</span>
              )}
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
                    flex-1 flex items-center justify-center gap-1 px-1 py-1
                    transition-all duration-150
                    ${
                      active
                        ? "bg-crimson text-primary-foreground shadow-sm"
                        : "text-senate-dark hover:bg-ivory-dark bronze-glow-hover"
                    }
                  `}
                >
                  <Icon className="w-3 h-3" />
                  <span className="text-[10px] font-heading font-bold uppercase tracking-wider">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Inline Context (tablet mode) ── */}
        {inlineContext && <InlineContextContent {...inlineContext} />}
      </div>

      {/* ── Bottom: Submit Orders ── */}
      <div className="p-3 border-t border-border shrink-0 space-y-1.5">
        {submissionIssues.length > 0 && !ordersSubmitted && (
          <div className="rounded-sm border border-crimson/60 bg-crimson/5 p-2 space-y-1 max-h-40 overflow-y-auto">
            <div className="text-[9px] font-heading uppercase tracking-widest text-crimson font-bold">
              {submissionIssues.length} issue{submissionIssues.length === 1 ? "" : "s"} block submission
            </div>
            <ul className="space-y-0.5">
              {submissionIssues.map((msg, i) => (
                <li key={i} className="text-[10px] text-crimson-dark leading-tight flex gap-1">
                  <span className="text-crimson">•</span>
                  <span>{msg}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={onSubmitOrders}
          disabled={!onSubmitOrders || processingTurn || (!ordersSubmitted && submissionIssues.length > 0)}
          className={`w-full py-2 rounded-sm font-heading text-xs font-semibold uppercase tracking-wider transition-colors bronze-glow-hover ${
            ordersSubmitted && !soloMode
              ? "bg-ivory border border-bronze/60 text-bronze-dark hover:bg-ivory-dark"
              : "bg-crimson text-primary-foreground hover:bg-crimson-light"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {soloMode
            ? (processingTurn ? "Processing…" : "Next Turn")
            : (ordersSubmitted ? "Withdraw Turn" : "Submit Turn")}
        </button>
        {!soloMode && ordersSubmitted && (
          <p className="text-[9px] font-heading uppercase tracking-widest text-center text-bronze-dark">
            ✓ Submitted — you may keep editing
          </p>
        )}
      </div>
    </aside>
  );
}

/* ── Inline Context Content (mirrors ContextPanel content) ── */
function InlineContextContent({
  mode,
  selection,
  news,
  onClearSelection,
  gameData,
  playerOwnerClassification,
  fleetOrderContext,
  onStartTargeting,
  combatPointsAvailable,
  onOrdersChanged,
  onSelect,
  onBuildFacility,
  onUndoBuildOrder,
  onCancelInProduction,
  onUndoCancelBuild,
  pendingBuildOrders,
  pendingCancelBuildOrders,
  playerTreasury,
  adminPointsAvailable,
  onCreateFleet,
  onStartCommissionTargeting,
}: {
  mode: GameMode;
  selection: MapSelection;
  news: NewsStory[];
  onClearSelection: () => void;
  gameData?: GameMapData;
  playerOwnerClassification?: string;
  fleetOrderContext?: { gameId: string; playerId: string; turnNumber: number };
  onStartTargeting?: (
    t:
      | { mode: "hex"; orderType: "fleet_move"; fleetId: string }
      | { mode: "fleet"; orderType: "attack"; fleetId: string },
  ) => void;
  combatPointsAvailable?: number;
  onOrdersChanged?: () => void;
  onSelect?: (selection: MapSelection) => void;
  onBuildFacility?: (systemId: number, facilityTypeId: string) => void;
  onUndoBuildOrder?: (orderId: string) => void;
  onCancelInProduction?: (systemId: number, facilityTypeId: string) => void;
  onUndoCancelBuild?: (systemId: number, facilityTypeId: string) => void;
  pendingBuildOrders?: Map<number, Array<{ orderId: string; facilityTypeId: string; cost: number; maintenance: number }>>;
  pendingCancelBuildOrders?: Map<number, Set<string>>;
  playerTreasury?: number;
  adminPointsAvailable?: number;
  onCreateFleet?: (name: string, hexX: number, hexY: number) => Promise<void> | void;
  onStartCommissionTargeting?: (fleetName: string) => void;
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
    if (selection.type === "production-center") return "Economy";
    if (selection.type === "faction") return "Faction Intel";
    const titles = {
      diplomacy: "POLITICAL OVERVIEW",
      military: "MILITARY OVERVIEW",
      production: "ECONOMY OVERVIEW",
    };
    return titles[mode];
  };

  return (
    <div className="border-t-2 border-bronze/40">
      <div className="h-10 flex items-center px-3 border-b border-border bronze-border-b">
        <h3 className="font-heading text-[10px] font-semibold uppercase tracking-[0.15em] flex items-center gap-1.5 text-destructive-foreground">
          {getModeIcon()}
          {getTitle()}
        </h3>
      </div>
      <div className="p-3 space-y-3">
        {selection.type === "news" ? (
          <InlineNewsDetail story={news.find((n) => n.id === selection.id)} />
        ) : selection.type === "region" ? (
          <InlineRegionDetail
            id={selection.id}
            gameData={gameData}
            mode={mode}
            gameId={fleetOrderContext?.gameId}
            onBuildFacility={onBuildFacility}
            onUndoBuildOrder={onUndoBuildOrder}
            onCancelInProduction={onCancelInProduction}
            onUndoCancelBuild={onUndoCancelBuild}
            pendingBuildOrders={pendingBuildOrders}
            pendingCancelBuildOrders={pendingCancelBuildOrders}
            playerTreasury={playerTreasury}
            adminPointsAvailable={adminPointsAvailable}
            playerOwnerClassification={playerOwnerClassification}
          />
        ) : selection.type === "army" ? (
          <InlineArmyDetail
            id={selection.id}
            gameData={gameData}
            playerOwnerClassification={playerOwnerClassification}
            fleetOrderContext={fleetOrderContext}
            onStartTargeting={onStartTargeting}
            combatPointsAvailable={combatPointsAvailable}
            onOrdersChanged={onOrdersChanged}
          />
        ) : selection.type === "production-center" ? (
          <InlineProductionDetail id={selection.id} />
        ) : selection.type === "faction" ? (
          <InlineFactionDetail id={selection.id} />
        ) : (
          <InlineEmptyState
            mode={mode}
            news={news}
            gameData={gameData}
            playerOwnerClassification={playerOwnerClassification}
            onSelect={onSelect}
            onCreateFleet={onCreateFleet}
            combatPointsAvailable={combatPointsAvailable}
          />
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

/* ── Create Fleet (Military Overview action) ── */
function CreateFleetCard({
  gameData,
  playerOwnerClassification,
  combatPointsAvailable,
  onCreateFleet,
}: {
  gameData?: GameMapData;
  playerOwnerClassification?: string;
  combatPointsAvailable: number;
  onCreateFleet: (name: string, hexX: number, hexY: number) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"hex" | "name">("hex");
  const [name, setName] = useState("");
  const [hexValue, setHexValue] = useState("");
  const [busy, setBusy] = useState(false);

  const resetAndClose = () => {
    setOpen(false);
    setStep("hex");
    setName("");
    setHexValue("");
  };

  // Compute eligible hexes: owned by player AND no fleet currently on the hex.
  const eligible = (() => {
    if (!gameData || !playerOwnerClassification || !gameData.hexes) return [] as Array<{ key: string; x: number; y: number; label: string }>;
    const factionLabel = CLASSIFICATION_LABELS[playerOwnerClassification as HexClassification] ?? null;
    const ownedSystemHexIds = new Set<number>();
    for (const s of gameData.systems.values()) {
      if (s.owner === playerOwnerClassification || (factionLabel && s.owner === factionLabel)) {
        ownedSystemHexIds.add(s.hex_id);
      }
    }
    const occupied = new Set<string>();
    for (const f of gameData.fleets) occupied.add(`${f.hex_x},${f.hex_y}`);
    const out: Array<{ key: string; x: number; y: number; label: string }> = [];
    for (const h of gameData.hexes.values()) {
      const key = `${h.x},${h.y}`;
      if (occupied.has(key)) continue;
      const isProvince = h.classification === playerOwnerClassification;
      const hasOwnedSystem = ownedSystemHexIds.has(h.hex_id);
      if (!isProvince && !hasOwnedSystem) continue;
      const sys = Array.from(gameData.systems.values()).find(s => s.hex_id === h.hex_id);
      const label = sys ? `(${h.x}, ${h.y}) — ${sys.system_name}` : `(${h.x}, ${h.y})`;
      out.push({ key, x: h.x, y: h.y, label });
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  })();

  const canSubmit = !busy && name.trim().length > 0 && hexValue !== "" && combatPointsAvailable >= 1;

  const handleSubmit = async () => {
    const hex = eligible.find(e => e.key === hexValue);
    if (!hex) return;
    setBusy(true);
    try {
      await onCreateFleet(name.trim(), hex.x, hex.y);
      resetAndClose();
    } finally {
      setBusy(false);
    }
  };

  const selectedHex = eligible.find(e => e.key === hexValue);

  return (
    <ImperialCard title="Commission Fleet">
      <div className="space-y-1.5">
        <p className="text-[10px] text-muted-foreground leading-snug">
          Create a new empty fleet on an owned, unoccupied hex.
          <span className="block text-bronze-dark font-semibold mt-0.5">Cost: 1 Combat Point</span>
        </p>
        <button
          onClick={() => { setStep("hex"); setOpen(true); }}
          disabled={combatPointsAvailable < 1 || eligible.length === 0}
          className="w-full py-1.5 rounded-sm bg-crimson text-primary-foreground text-[11px] font-heading uppercase tracking-wider hover:bg-crimson-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {combatPointsAvailable < 1 ? "No Combat Points" : eligible.length === 0 ? "No Eligible Hexes" : "Commission New Fleet"}
        </button>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else setOpen(true); }}>
        <DialogContent className="bg-marble border-bronze/40">
          <DialogHeader>
            <DialogTitle className="font-heading text-senate-dark">
              {step === "hex" ? "Commission New Fleet — Choose Location" : "Commission New Fleet — Name Fleet"}
            </DialogTitle>
          </DialogHeader>

          {step === "hex" ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">Place at Hex</label>
                <select
                  value={hexValue}
                  onChange={e => setHexValue(e.target.value)}
                  autoFocus
                  className="w-full rounded-sm border border-border bg-ivory px-2 py-1.5 text-sm text-senate-dark"
                >
                  <option value="">Select an owned hex…</option>
                  {eligible.map(e => (
                    <option key={e.key} value={e.key}>{e.label}</option>
                  ))}
                </select>
              </div>
              <div className="text-[10px] text-bronze-dark font-semibold">
                Cost: 1 Combat Point · Available: {combatPointsAvailable}
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={resetAndClose}
                  className="px-3 py-1.5 rounded-sm border border-border text-[11px] font-heading uppercase tracking-wider text-senate-dark hover:bg-ivory-dark"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep("name")}
                  disabled={hexValue === ""}
                  className="px-3 py-1.5 rounded-sm bg-crimson text-primary-foreground text-[11px] font-heading uppercase tracking-wider hover:bg-crimson-light disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[10px] text-muted-foreground">
                Location: <span className="text-senate-dark font-semibold">{selectedHex?.label}</span>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">Fleet Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. First Legion"
                  className="w-full rounded-sm border border-border bg-ivory px-2 py-1.5 text-sm text-senate-dark"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-between pt-1">
                <button
                  onClick={() => setStep("hex")}
                  className="px-3 py-1.5 rounded-sm border border-border text-[11px] font-heading uppercase tracking-wider text-senate-dark hover:bg-ivory-dark"
                >
                  Back
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={resetAndClose}
                    className="px-3 py-1.5 rounded-sm border border-border text-[11px] font-heading uppercase tracking-wider text-senate-dark hover:bg-ivory-dark"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="px-3 py-1.5 rounded-sm bg-crimson text-primary-foreground text-[11px] font-heading uppercase tracking-wider hover:bg-crimson-light disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy ? "Commissioning…" : "Done"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ImperialCard>
  );
}

/* ── Inline detail sub-components ── */
function InlineEmptyState({
  mode,
  news,
  gameData,
  playerOwnerClassification,
  onSelect,
  onCreateFleet,
  combatPointsAvailable,
}: {
  mode: GameMode;
  news?: NewsStory[];
  gameData?: GameMapData;
  playerOwnerClassification?: string;
  onSelect?: (selection: MapSelection) => void;
  onCreateFleet?: (name: string, hexX: number, hexY: number) => Promise<void> | void;
  combatPointsAvailable?: number;
}) {
  if (mode === "military") {
    const playerFactionName = playerOwnerClassification
      ? (CLASSIFICATION_LABELS[playerOwnerClassification as HexClassification] ?? null)
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
        <DispatchesCard mode="military" news={news ?? []} onSelect={onSelect} />

        {onCreateFleet && (
          <CreateFleetCard
            gameData={gameData}
            playerOwnerClassification={playerOwnerClassification}
            combatPointsAvailable={combatPointsAvailable ?? 0}
            onCreateFleet={onCreateFleet}
          />
        )}

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
                    <span className="text-[9px] text-senate-dark/70">
                      {f.hex_x},{f.hex_y}
                    </span>
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

  if (mode === "production") {
    const playerFactionName = playerOwnerClassification
      ? (CLASSIFICATION_LABELS[playerOwnerClassification as HexClassification] ?? null)
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
    return (
      <>
        <DispatchesCard mode="production" news={news ?? []} onSelect={onSelect} />
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
      </>
    );
  }

  const content = {
    diplomacy: {
      stats: [
        { label: "Active Treaties", value: "3" },
        { label: "Pending Proposals", value: "1" },
        { label: "Senate Standing", value: "Favorable" },
      ],
    },
    production: {
      stats: [
        { label: "Active Facilities", value: "4" },
        { label: "Queue Items", value: "3" },
        { label: "Avg Efficiency", value: "72%" },
      ],
    },
  } as const;
  const c = content[mode as "diplomacy" | "production"];
  return (
    <>
      <DispatchesCard mode={mode} news={news ?? []} onSelect={onSelect} />
      <ImperialCard title="Summary">
        <div className="space-y-2">
          {c.stats.map((s) => (
            <div key={s.label} className="flex justify-between items-center text-xs text-slate-500">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-semibold">{s.value}</span>
            </div>
          ))}
        </div>
      </ImperialCard>
    </>
  );
}

function InlineRegionDetail({
  id,
  gameData,
  mode,
  gameId,
  onBuildFacility,
  onUndoBuildOrder,
  onCancelInProduction,
  onUndoCancelBuild,
  pendingBuildOrders,
  pendingCancelBuildOrders,
  playerTreasury,
  adminPointsAvailable,
  playerOwnerClassification,
}: {
  id: string;
  gameData?: GameMapData;
  mode?: GameMode;
  gameId?: string;
  onBuildFacility?: (systemId: number, facilityTypeId: string) => void;
  onUndoBuildOrder?: (orderId: string) => void;
  onCancelInProduction?: (systemId: number, facilityTypeId: string) => void;
  onUndoCancelBuild?: (systemId: number, facilityTypeId: string) => void;
  pendingBuildOrders?: Map<number, Array<{ orderId: string; facilityTypeId: string; cost: number; maintenance: number }>>;
  pendingCancelBuildOrders?: Map<number, Set<string>>;
  playerTreasury?: number;
  adminPointsAvailable?: number;
  playerOwnerClassification?: string;
}) {
  const sysId = id.startsWith("sys-") ? parseInt(id.replace("sys-", ""), 10) : NaN;
  const realSys =
    !isNaN(sysId) && gameData ? Array.from(gameData.systems.values()).find((s) => s.system_id === sysId) : undefined;

  if (realSys) {
    const facilityNames = (realSys.facilities || []).map((f) => {
      const ft = gameData!.facilityTypes.find((t) => t.facility_type_id === f.facility_type_id);
      return { name: ft?.name || f.facility_type_id, icon: ft?.icon || "🏭", qty: f.quantity };
    });
    const conditionVariant = realSys.condition >= 70 ? "success" : realSys.condition >= 40 ? "warning" : "danger";
    const classLabel = CLASSIFICATION_LABELS[realSys.classification as HexClassification] || realSys.classification;
    const sysPending = pendingBuildOrders?.get(realSys.system_id) || [];
    const sysCancels = pendingCancelBuildOrders?.get(realSys.system_id) || new Set<string>();
    const buildable = gameData
      ? getBuildableFacilitiesForSystem(realSys, gameData, sysPending.map((p) => p.facilityTypeId))
      : [];
    const adminPointsLeft = adminPointsAvailable ?? 0;
    const ftFull = gameData?.facilityTypesFull || [];
    const hasShipyard = (realSys.facilities || []).some((f) => {
      const ft = gameData?.facilityTypes.find((t) => t.facility_type_id === f.facility_type_id);
      return (ft?.name || "").toLowerCase().includes("shipyard");
    });
    const [shipDialogOpen, setShipDialogOpen] = useState(false);
    const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);
    const [queueRefresh, setQueueRefresh] = useState(0);
    const shipBuildCapacity = (realSys.facilities || []).reduce((sum, f) => {
      const ft = (gameData?.facilityTypesFull || []).find(t => String(t.facility_type_id) === String(f.facility_type_id)) as any;
      const cap = Number(ft?.ship_build_capacity) || 0;
      return sum + cap * (f.quantity || 1);
    }, 0);
    return (
      <>
        <ImperialCard title={realSys.system_name} subtitle={classLabel}>
          <div className="space-y-2">
            <Row className="text-slate-500" label="Net Tribute" value={`₡${(realSys.tribute - realSys.upkeep).toLocaleString()}`} />
            <Row
              label="Population"
              value={realSys.current_population > 0 ? realSys.current_population.toLocaleString() : "Uninhabited"}
            />
            <Row label="Condition">
              <StatusBadge variant={conditionVariant}>{realSys.condition}</StatusBadge>
            </Row>
            <Row label="Morale" value={`${realSys.morale}`} />
            <Row label="Resources" value={`${realSys.resources}`} />
          </div>
        </ImperialCard>
        <ImperialCard title="Facilities">
          {facilityNames.length > 0 ? (
            <div className="space-y-1.5">
              {facilityNames.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs text-slate-500 py-1 border-b border-border last:border-0"
                >
                  <span>
                    {f.icon} {f.name}
                  </span>
                  <span className="font-semibold text-bronze">×{f.qty}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">No facilities built at this system.</p>
          )}
        </ImperialCard>

        {mode === "military" && gameId ? (
          <GarrisonCard gameId={gameId} systemId={realSys.system_id} />
        ) : null}

        <ImperialCard title="Production Queue">
          <div className="space-y-1.5">
            {(() => {
              const fipList = realSys.facilities_in_production || [];
              let cumulative = 0;
              const fipNodes = fipList.map((p, i) => {
                const ft = gameData!.facilityTypes.find((t) => t.facility_type_id === p.facility_type_id);
                const queuedCancel = sysCancels.has(String(p.facility_type_id));
                cumulative += p.turns_remaining;
                const displayTurns = cumulative;
                return (
                  <div
                    key={`fip-${i}`}
                    className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0 gap-2"
                  >
                    <span className={queuedCancel ? "line-through text-muted-foreground" : "text-slate-500"}>
                      {ft?.icon || "🏭"} {ft?.name || p.facility_type_id}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{displayTurns}T</span>
                      {queuedCancel ? (
                        <button
                          onClick={() => onUndoCancelBuild?.(realSys.system_id, p.facility_type_id)}
                          className="text-[9px] uppercase tracking-wider text-bronze hover:text-bronze-dark"
                          title="Undo cancellation"
                        >
                          Undo
                        </button>
                      ) : (
                        <button
                          onClick={() => onCancelInProduction?.(realSys.system_id, p.facility_type_id)}
                          className="text-[9px] uppercase tracking-wider text-crimson hover:text-crimson-light"
                          title="Cancel without refund"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                );
              });
              const pendingNodes = sysPending.map((po, i) => {
                const ft = ftFull.find((t) => t.facility_type_id === po.facilityTypeId);
                const buildTime = ft?.turns_to_build ?? 1;
                cumulative += buildTime;
                return (
                  <div
                    key={`pen-${i}`}
                    className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0 gap-2"
                  >
                    <span>
                      {ft?.icon || "🏭"} {ft?.name || po.facilityTypeId}
                      <span className="ml-1 text-[9px] text-crimson uppercase tracking-wider">New</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{cumulative}T</span>
                      <button
                        onClick={() => onUndoBuildOrder?.(po.orderId)}
                        className="text-[9px] uppercase tracking-wider text-bronze hover:text-bronze-dark"
                        title="Undo this order"
                      >
                        Undo
                      </button>
                    </div>
                  </div>
                );
              });
              const nodes = [...fipNodes, ...pendingNodes];
              if (nodes.length === 0) {
                return <p className="text-[10px] text-muted-foreground italic">No facilities under construction.</p>;
              }
              return nodes;
            })()}
            <button
              onClick={() => setFacilityDialogOpen(true)}
              className="w-full mt-1 py-1.5 rounded-sm text-[10px] font-heading font-semibold uppercase tracking-wider transition-colors bg-crimson text-primary-foreground hover:bg-crimson-light bronze-glow-hover"
            >
              Build Facility
            </button>
          </div>
        </ImperialCard>

        <ImperialCard title="Manufacturing Queue">
          <div className="space-y-1.5">
            <ShipProductionList
              gameId={gameId}
              systemId={realSys.system_id}
              ownerClassification={playerOwnerClassification}
              shipTypes={gameData?.shipTypes || []}
              shipBuildCapacity={shipBuildCapacity}
              refreshKey={queueRefresh}
            />
            <button
              onClick={() => setShipDialogOpen(true)}
              disabled={!hasShipyard}
              className={`w-full mt-1 py-1.5 rounded-sm text-[10px] font-heading font-semibold uppercase tracking-wider transition-colors
                ${hasShipyard
                  ? "bg-crimson text-primary-foreground hover:bg-crimson-light bronze-glow-hover"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              title={hasShipyard ? "Build ships at this shipyard" : "Requires a shipyard facility"}
            >
              {hasShipyard ? "Build Ships" : "No Shipyard"}
            </button>
          </div>
        </ImperialCard>

        <Dialog open={facilityDialogOpen} onOpenChange={setFacilityDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Build Facility — {realSys.system_name}</DialogTitle>
            </DialogHeader>
            {buildable.length > 0 ? (
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {buildable.map((bf) => {
                  const canAfford = (playerTreasury ?? 0) >= bf.cost;
                  const hasAdminPoint = adminPointsLeft > 0;
                  const canCommission = canAfford && hasAdminPoint;
                  const label = !canAfford
                    ? "Insufficient Funds"
                    : !hasAdminPoint
                      ? "No Admin Points"
                      : `Commission · ₡${bf.cost} · ${bf.turns_to_build}T`;
                  return (
                    <div key={bf.facility_type_id} className="border border-border rounded-sm p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-accent">
                          {bf.icon} {bf.name}
                        </span>
                      </div>
                      {bf.description && (
                        <p className="text-[10px] text-slate-500">{bf.description}</p>
                      )}
                      {bf.consumesName && (
                        <p className="text-[9px] text-muted-foreground italic">Upgrades {bf.consumesName}</p>
                      )}
                      <button
                        onClick={() => {
                          onBuildFacility?.(realSys.system_id, bf.facility_type_id);
                          setFacilityDialogOpen(false);
                        }}
                        disabled={!canCommission}
                        className={`w-full mt-1 py-1 rounded-sm text-[10px] font-heading font-semibold uppercase tracking-wider transition-colors
                          ${canCommission
                            ? "bg-crimson text-primary-foreground hover:bg-crimson-light bronze-glow-hover"
                            : "bg-muted text-muted-foreground cursor-not-allowed"
                          }`}
                      >
                        {label}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground italic py-4 text-center">
                No eligible facilities to build at this system.
              </p>
            )}
          </DialogContent>
        </Dialog>

        <BuildShipsDialog
          open={shipDialogOpen}
          onOpenChange={setShipDialogOpen}
          gameId={gameId}
          systemId={realSys.system_id}
          ownerClassification={playerOwnerClassification ?? undefined}
          onQueueChanged={() => setQueueRefresh((n) => n + 1)}
          systemName={realSys.system_name}
          systemHexX={(() => {
            const h = gameData?.hexes ? Array.from(gameData.hexes.values()).find((h) => h.hex_id === realSys.hex_id) : undefined;
            return h?.x;
          })()}
          systemHexY={(() => {
            const h = gameData?.hexes ? Array.from(gameData.hexes.values()).find((h) => h.hex_id === realSys.hex_id) : undefined;
            return h?.y;
          })()}
          shipBuildCapacity={shipBuildCapacity}
          shipTypes={gameData?.shipTypes || []}
          playerFleets={(() => {
            if (!gameData || !playerOwnerClassification) return [];
            const sysHex = Array.from(gameData.hexes.values()).find((h) => h.hex_id === realSys.hex_id);
            return gameData.fleets
              .filter((f) => f.owner_classification === playerOwnerClassification)
              .map((f) => ({
                fleet_id: f.fleet_id,
                fleet_name: f.fleet_name,
                hex_x: f.hex_x,
                hex_y: f.hex_y,
                is_garrison: !!(f as any).is_garrison,
                atSystem: !!sysHex && f.hex_x === sysHex.x && f.hex_y === sysHex.y,
              }))
              .sort((a, b) => Number(b.atSystem) - Number(a.atSystem));
          })()}
          ownedHexes={(() => {
            if (!gameData?.hexes || !playerOwnerClassification) return [];
            const sysByHexId = new Map<number, string>();
            for (const s of gameData.systems.values()) sysByHexId.set(s.hex_id, s.system_name);
            return Array.from(gameData.hexes.values())
              .filter((h) => h.classification === playerOwnerClassification)
              .map((h) => ({ x: h.x, y: h.y, system_name: sysByHexId.get(h.hex_id) ?? null }));
          })()}
          onConfirm={async (queue) => {
            if (!gameId || !playerOwnerClassification || queue.length === 0) return;
            const { supabase } = await import("@/integrations/supabase/client");
            const { data: maxRow } = await (supabase as any)
              .from("system_ship_production")
              .select("position")
              .eq("game_id", gameId)
              .eq("system_id", realSys.system_id)
              .order("position", { ascending: false })
              .limit(1)
              .maybeSingle();
            const basePos = (maxRow?.position ?? 0) + 1;
            const rows = queue.map((q, idx) => {
              const st = (gameData?.shipTypes || []).find(s => s.id === q.ship_type_id);
              const cost = (st?.point_cost ?? 0) * q.quantity;
              return {
                game_id: gameId,
                system_id: realSys.system_id,
                position: basePos + idx,
                ship_type_id: q.ship_type_id,
                quantity: q.quantity,
                destination_fleet_id: q.destination_fleet_id,
                destination_hex_x: q.destination_hex_x,
                destination_hex_y: q.destination_hex_y,
                points_remaining: cost,
                cost_paid: cost,
                owner_classification: playerOwnerClassification,
              };
            });
            const { error } = await (supabase as any).from("system_ship_production").insert(rows);
            if (error) {
              console.error("[ship build] insert failed", error);
              const { toast } = await import("@/hooks/use-toast");
              toast({ title: "Build failed", description: error.message, variant: "destructive" });
              return;
            }
            setQueueRefresh((n) => n + 1);
          }}
        />

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
          <Row label="Condition">
            <StatusBadge
              variant={
                d.condition === "Stable" || d.condition === "Prosperous"
                  ? "success"
                  : d.condition === "Contested"
                    ? "danger"
                    : "info"
              }
            >
              {d.condition}
            </StatusBadge>
          </Row>
          <Row label="Garrison" value={d.garrison} />
        </div>
      </ImperialCard>
      <ImperialCard title="Resources">
        <div className="space-y-2.5">
          {d.resources.map((r) => (
            <ProgressBar
              key={r.label}
              label={r.label}
              value={r.value}
              max={r.max}
              color={r.value >= 70 ? "bronze" : r.value >= 40 ? "bronze" : "crimson"}
            />
          ))}
        </div>
      </ImperialCard>
    </>
  );
}

/** Local copy of buildable-facility logic from ContextPanel — kept inline to avoid cross-import. */
interface InlineBuildable {
  facility_type_id: string;
  name: string;
  icon: string;
  description: string;
  cost: number;
  turns_to_build: number;
  maintenance: number;
  consumesName?: string;
}
function getBuildableFacilitiesForSystem(
  system: import("@/lib/mapTypes").SystemData,
  gameData: GameMapData,
  pendingFacilityTypeIds: string[] = [],
): InlineBuildable[] {
  const ftFull = gameData.facilityTypesFull || [];
  const builtFacilities = system.facilities || [];
  const inProduction = system.facilities_in_production || [];
  const builtMap = new Map<string, number>();
  for (const f of builtFacilities) builtMap.set(f.facility_type_id, (builtMap.get(f.facility_type_id) || 0) + f.quantity);
  const prodMap = new Map<string, number>();
  for (const p of inProduction) prodMap.set(p.facility_type_id, (prodMap.get(p.facility_type_id) || 0) + 1);
  const pendingMap = new Map<string, number>();
  for (const fid of pendingFacilityTypeIds) pendingMap.set(fid, (pendingMap.get(fid) || 0) + 1);
  const result: InlineBuildable[] = [];
  for (const ft of ftFull) {
    const builtCount =
      (builtMap.get(ft.facility_type_id) || 0) +
      (prodMap.get(ft.facility_type_id) || 0) +
      (pendingMap.get(ft.facility_type_id) || 0);
    if (ft.max_per_system > 0 && builtCount >= ft.max_per_system) continue;
    if (ft.consumed_facility_id) {
      const prereqCount = builtMap.get(ft.consumed_facility_id) || 0;
      if (prereqCount <= 0) continue;
    }
    const consumedFt = ft.consumed_facility_id
      ? ftFull.find((f) => f.facility_type_id === ft.consumed_facility_id)
      : null;
    result.push({
      facility_type_id: ft.facility_type_id,
      name: ft.name,
      icon: ft.icon,
      description: (ft as any).description || "",
      cost: ft.cost,
      turns_to_build: ft.turns_to_build,
      maintenance: ft.maintenance,
      consumesName: consumedFt?.name,
    });
  }
  return result;
}

function InlineArmyDetail({
  id,
  gameData,
  playerOwnerClassification,
  fleetOrderContext,
  onStartTargeting,
  combatPointsAvailable,
  onOrdersChanged,
}: {
  id: string;
  gameData?: GameMapData;
  playerOwnerClassification?: string;
  fleetOrderContext?: { gameId: string; playerId: string; turnNumber: number };
  onStartTargeting?: (
    t:
      | { mode: "hex"; orderType: "fleet_move"; fleetId: string }
      | { mode: "fleet"; orderType: "attack"; fleetId: string },
  ) => void;
  combatPointsAvailable?: number;
  onOrdersChanged?: () => void;
}) {
  const fleetId = id.startsWith("fleet-") ? id.replace("fleet-", "") : null;
  const realFleet = fleetId && gameData ? gameData.fleets.find((f) => f.fleet_id === fleetId) : undefined;

  if (realFleet) {
    const canEdit = !!playerOwnerClassification && realFleet.owner_classification === playerOwnerClassification;
    return (
      <FleetDetailContent
        fleet={realFleet}
        shipTypes={gameData?.shipTypes}
        allFleets={gameData?.fleets}
        allSystems={gameData ? Array.from(gameData.systems.values()) : []}
        allHexes={gameData?.hexes}
        canEdit={canEdit}
        orderContext={fleetOrderContext}
        onStartTargeting={onStartTargeting}
        combatPointsAvailable={combatPointsAvailable}
        onOrdersChanged={onOrdersChanged}
      />
    );
  }

  const d = ARMY_DETAILS[id];
  if (!d) return <p className="text-xs text-muted-foreground">Unknown fleet.</p>;
  return (
    <>
      <ImperialCard title={d.name} subtitle={`Commander: ${d.commander}`}>
        <div className="space-y-2">
          <Row label="Status">
            <StatusBadge variant={d.status === "Alert" ? "warning" : "info"}>{d.status}</StatusBadge>
          </Row>
          <ProgressBar label="Strength" value={d.strength} max={d.maxStrength} color="bronze" />
          <ProgressBar label="Morale" value={d.morale} max={100} color={d.morale >= 70 ? "bronze" : "crimson"} />
        </div>
      </ImperialCard>
      <ImperialCard title="Fleet Composition">
        <div className="space-y-1.5">
          {d.ships.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0"
            >
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
          <ProgressBar
            label="Efficiency"
            value={d.efficiency}
            max={100}
            color={d.efficiency >= 70 ? "bronze" : "crimson"}
          />
        </div>
      </ImperialCard>
      <ImperialCard title="Build Queue">
        <div className="space-y-1.5">
          {d.queue.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">Queue empty.</p>
          ) : (
            d.queue.map((q, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0"
              >
                <span>{q.item}</span>
                <span className="text-muted-foreground">{q.turns}T</span>
              </div>
            ))
          )}
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
        <Row label="Relations">
          <StatusBadge variant="warning">Neutral</StatusBadge>
        </Row>
        <Row label="Military Posture">
          <StatusBadge variant="info">Defensive</StatusBadge>
        </Row>
        <Row label="Trade Status" value="Open" />
      </div>
    </ImperialCard>
  );
}

function InlineNewsDetail({ story }: { story?: NewsStory }) {
  if (!story) return <p className="text-xs text-muted-foreground">Dispatch not found.</p>;
  return (
    <ImperialCard title={story.headline} subtitle={`Turn ${story.turn} · ${story.category}`}>
      <p className="text-xs leading-relaxed font-normal text-slate-500">{story.summary}</p>
    </ImperialCard>
  );
}

function Row({ label, value, children, className = "" }: { label: string; value?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex justify-between items-center text-xs ${className}`}>
      <span className="text-muted-foreground">{label}</span>
      {children || <span className="font-semibold text-accent">{value}</span>}
    </div>
  );
}
