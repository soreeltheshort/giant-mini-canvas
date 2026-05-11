import { useState } from "react";
import { X, Landmark, Swords, Hammer, Scroll, Globe2, Sword, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GameMode, MapSelection, NewsStory } from "./gameShellTypes";
import { REGION_DETAILS, ARMY_DETAILS, PRODUCTION_DETAILS } from "./gameShellTypes";
import { ImperialCard } from "./ImperialCard";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";
import FleetDetailContent from "./FleetDetailContent";
import BuildShipsDialog from "./BuildShipsDialog";
import type { SystemData, MapFleet, FacilityType } from "@/lib/mapTypes";
import { CLASSIFICATION_LABELS, type HexClassification } from "@/lib/mapTypes";

const NEWS_CATEGORY_VARIANT: Record<NewsStory["category"], "info" | "danger" | "success" | "warning"> = {
  diplomatic: "info",
  military: "danger",
  economic: "success",
  event: "warning",
};

/** Maps a game mode to the dispatch category it should surface in its Overview. */
const MODE_DISPATCH_CATEGORY: Record<GameMode, NewsStory["category"]> = {
  diplomacy: "diplomatic",
  military: "military",
  production: "economic",
};

/**
 * Reusable Dispatches card. Filters `news` by the category that matches `mode`,
 * shows unread first, and lets the caller route clicks to a dispatch detail view.
 * Used at the top of every Overview empty state (Diplomacy / Military / Production)
 * so each modality surfaces its own incoming dispatches.
 */
export function DispatchesCard({
  mode,
  news,
  onSelect,
}: {
  mode: GameMode;
  news: NewsStory[];
  onSelect?: (selection: MapSelection) => void;
}) {
  const category = MODE_DISPATCH_CATEGORY[mode];
  const filtered = news
    .filter((n) => n.category === category)
    .slice()
    .sort((a, b) => Number(a.read) - Number(b.read) || b.turn - a.turn);
  const unread = filtered.filter((n) => !n.read).length;

  return (
    <ImperialCard title="Dispatches">
      {filtered.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">No new dispatches.</p>
      ) : (
        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelect?.({ type: "news", id: n.id })}
              className={`w-full text-left bg-ivory border border-border rounded-sm p-2 space-y-1 hover:border-bronze/60 bronze-glow-hover transition-colors ${n.read ? "opacity-70" : ""}`}
            >
              <div className="flex items-start gap-1.5">
                <StatusBadge variant={NEWS_CATEGORY_VARIANT[n.category]}>{n.category}</StatusBadge>
                <span className="text-[9px] text-muted-foreground ml-auto">T{n.turn}</span>
              </div>
              <p className="text-[11px] font-semibold text-senate-dark leading-tight">{n.headline}</p>
            </button>
          ))}
        </div>
      )}
      {unread > 0 && (
        <p className="mt-1.5 text-[9px] font-heading uppercase tracking-widest text-crimson">
          {unread} new
        </p>
      )}
    </ImperialCard>
  );
}

export interface ShipTypeLookup {
  id: string;
  name: string;
  hull_class: string;
  ship_id?: string | null;
  class?: string;
  point_cost?: number;
  maintenance?: number;
  map_speed?: number;
  repair_pod?: number;
  supply_pod?: number;
  hull?: number;
  ground_invasion?: number;
  scout_sensors?: number;
  fighter_bay?: number;
  gun_ship_link?: number;
  flavor_description?: string;
  laser_2_5cm?: number;
  laser_4_5cm?: number;
  laser_6_5cm?: number;
  laser_10cm?: number;
  laser_14cm?: number;
  laser_20cm?: number;
  laser_28cm?: number;
  laser_50cm?: number;
  missile_10kg?: number;
  missile_50kg?: number;
  missile_100kg?: number;
  missile_half_kt?: number;
}

export interface FacilityTypeFull {
  facility_type_id: string;
  name: string;
  description: string;
  icon: string;
  fighter_capacity: number;
  gunship_capacity: number;
  cost: number;
  turns_to_build: number;
  max_per_system: number;
  consumed_facility_id: string | null;
  maintenance: number;
}

export interface GameMapData {
  systems: Map<number, SystemData>;
  fleets: MapFleet[];
  facilityTypes: FacilityType[];
  facilityTypesFull?: FacilityTypeFull[];
  shipTypes?: ShipTypeLookup[];
  /** Hex lookup keyed by "x,y" — used for fleet-at-planet eligibility checks. */
  hexes?: Map<string, import("@/lib/mapTypes").HexData>;
}

interface ContextPanelProps {
  mode: GameMode;
  selection: MapSelection;
  news: NewsStory[];
  onClose: () => void;
  onClearSelection: () => void;
  gameData?: GameMapData;
  onBuildFacility?: (systemId: number, facilityTypeId: string) => void;
  playerTreasury?: number;
  /** Admin points the player still has available for new orders this turn. */
  adminPointsAvailable?: number;
  /** Province classification owned by the current player, e.g. "PROVINCE_2" */
  playerOwnerClassification?: string;
  fleetOrderContext?: { gameId: string; playerId: string; turnNumber: number };
  onStartTargeting?: (
    t: { mode: "hex"; orderType: "fleet_move"; fleetId: string }
      | { mode: "fleet"; orderType: "attack"; fleetId: string }
  ) => void;
  combatPointsAvailable?: number;
  onOrdersChanged?: () => void;
  /** Selection setter so the empty Military Overview can list-select planets/fleets/news. */
  onSelect?: (selection: MapSelection) => void;
}

export default function ContextPanel({ mode, selection, news, onClose, onClearSelection, gameData, onBuildFacility, playerTreasury, adminPointsAvailable, playerOwnerClassification, fleetOrderContext, onStartTargeting, combatPointsAvailable, onOrdersChanged, onSelect }: ContextPanelProps) {
  return (
    <aside className="w-72 bg-marble border-l-2 border-bronze/40 flex flex-col relative z-20 shrink-0 animate-fade-in">
      {/* Content — header bar removed; first card sits flush at the top. */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {selection.type === "news" ? (
          <NewsDetail story={news.find((n) => n.id === selection.id)} />
        ) : selection.type === "region" ? (
          <RegionDetail id={selection.id} gameData={gameData} mode={mode} onBuildFacility={onBuildFacility} playerTreasury={playerTreasury} adminPointsAvailable={adminPointsAvailable} playerOwnerClassification={playerOwnerClassification} />
        ) : selection.type === "army" ? (
          <ArmyDetail id={selection.id} gameData={gameData} playerOwnerClassification={playerOwnerClassification} fleetOrderContext={fleetOrderContext} onStartTargeting={onStartTargeting} combatPointsAvailable={combatPointsAvailable} onOrdersChanged={onOrdersChanged} />
        ) : selection.type === "production-center" ? (
          <ProductionDetail id={selection.id} />
        ) : selection.type === "faction" ? (
          <FactionDetail id={selection.id} />
        ) : (
          <EmptyState mode={mode} news={news} gameData={gameData} playerOwnerClassification={playerOwnerClassification} onSelect={onSelect} />
        )}
      </div>

      {/* Back link when viewing detail */}
      {selection.type !== "none" && (
        <div className="p-2 border-t border-border shrink-0">
          <button
            onClick={onClearSelection}
            className="w-full text-center text-[10px] font-heading uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            ← Back to overview
          </button>
        </div>
      )}
    </aside>
  );
}

function ModeIcon({ mode, selection }: { mode: GameMode; selection: MapSelection }) {
  if (selection.type === "news") return <Scroll className="w-3.5 h-3.5" />;
  const icons = { diplomacy: Landmark, military: Swords, production: Hammer };
  const Icon = icons[mode];
  return <Icon className="w-3.5 h-3.5" />;
}

function getPanelTitle(mode: GameMode, selection: MapSelection): string {
  if (selection.type === "news") return "Dispatch";
  if (selection.type === "region") return "System Detail";
  if (selection.type === "army") return "Fleet Detail";
  if (selection.type === "production-center") return "Economy";
  if (selection.type === "faction") return "Faction Intel";
  const titles = { diplomacy: "POLITICAL OVERVIEW", military: "MILITARY OVERVIEW", production: "ECONOMY OVERVIEW" };
  return titles[mode];
}

/* ── Empty States ── */
function EmptyState({
  mode,
  news,
  gameData,
  playerOwnerClassification,
  onSelect,
}: {
  mode: GameMode;
  news?: NewsStory[];
  gameData?: GameMapData;
  playerOwnerClassification?: string;
  onSelect?: (selection: MapSelection) => void;
}) {
  // Military Overview (military mode) — Dispatches + scrollable fleets.
  if (mode === "military") {
    return (
      <StrategicOverviewEmpty
        news={news ?? []}
        gameData={gameData}
        playerOwnerClassification={playerOwnerClassification}
        onSelect={onSelect}
      />
    );
  }

  // Production Overview — Economy Dispatches + scrollable planets.
  if (mode === "production") {
    return (
      <ProductionOverviewEmpty
        news={news ?? []}
        gameData={gameData}
        playerOwnerClassification={playerOwnerClassification}
        onSelect={onSelect}
      />
    );
  }

  const content = {
    diplomacy: {
      icon: Landmark,
      title: "POLITICAL OVERVIEW",
      lines: [
        "Select a faction capital on the map to view relations.",
        "Active treaties and pending proposals will appear here.",
      ],
      stats: [
        { label: "Active Treaties", value: "3" },
        { label: "Pending Proposals", value: "1" },
        { label: "Senate Standing", value: "Favorable" },
      ],
    },
    production: {
      icon: Hammer,
      title: "ECONOMY OVERVIEW",
      lines: [
        "Select a forge or shipyard on the map to manage output.",
        "Construction queues and efficiency reports appear here.",
      ],
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
      {/* Dispatches relevant to this modality, surfaced right under the title. */}
      <DispatchesCard mode={mode} news={news ?? []} onSelect={onSelect} />

      <div className="text-center py-4 space-y-2">
        <c.icon className="w-8 h-8 text-bronze/40 mx-auto" />
        <h3 className="font-heading text-sm font-semibold text-accent">{c.title}</h3>
        {c.lines.map((l, i) => (
          <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">{l}</p>
        ))}
      </div>
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
    </>
  );
}

/**
 * Military Overview default panel content:
 *   1. Dispatches (latest unread, then click into the news detail)
 *   2. Scrollable list of player-owned planets — click to open RegionDetail
 *   3. Scrollable list of player-owned fleets   — click to open ArmyDetail
 */
function StrategicOverviewEmpty({
  news,
  gameData,
  playerOwnerClassification,
  onSelect,
}: {
  news: NewsStory[];
  gameData?: GameMapData;
  playerOwnerClassification?: string;
  onSelect?: (selection: MapSelection) => void;
}) {
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
      {/* 1 ─ Dispatches (military category) */}
      <DispatchesCard mode="military" news={news} onSelect={onSelect} />

      {/* 2 ─ Fleets */}
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

/**
 * Production Overview default panel content:
 *   1. Dispatches (economic category)
 *   2. Scrollable list of player-owned planets — click to open RegionDetail
 */
function ProductionOverviewEmpty({
  news,
  gameData,
  playerOwnerClassification,
  onSelect,
}: {
  news: NewsStory[];
  gameData?: GameMapData;
  playerOwnerClassification?: string;
  onSelect?: (selection: MapSelection) => void;
}) {
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

  return (
    <>
      <DispatchesCard mode="production" news={news} onSelect={onSelect} />
      <ImperialCard title={`Planets (${ownedSystems.length})`}>
        {ownedSystems.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">No systems under your control.</p>
        ) : (
          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {ownedSystems.map((s) => {
              const fighters = (s.stationed_fighters ?? []).reduce((sum, sc) => sum + (sc.quantity || 0), 0);
              const gunships = (s.stationed_gunships ?? []).reduce((sum, sc) => sum + (sc.quantity || 0), 0);
              const garrison = s.current_ground_defenses ?? 0;
              return (
                <button
                  key={s.system_id}
                  onClick={() => onSelect?.({ type: "region", id: `sys-${s.system_id}` })}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm border border-border bg-ivory hover:border-bronze/60 bronze-glow-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Globe2 className="w-3 h-3 text-bronze shrink-0" />
                    <span className="text-[11px] font-semibold text-senate-dark truncate">{s.system_name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-[9px] text-senate-dark/80 font-mono">
                    <span title="Fighters">F {fighters}</span>
                    <span title="Gunships">G {gunships}</span>
                    <span title="Garrison">⚔ {garrison}</span>
                    <ChevronRight className="w-3 h-3 text-senate-dark/60" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ImperialCard>
    </>
  );
}
function RegionDetail({ id, gameData, mode, onBuildFacility, playerTreasury, adminPointsAvailable, playerOwnerClassification }: {
  id: string;
  gameData?: GameMapData;
  mode?: GameMode;
  onBuildFacility?: (systemId: number, facilityTypeId: string) => void;
  playerTreasury?: number;
  adminPointsAvailable?: number;
  playerOwnerClassification?: string;
}) {
  // Try real data first (selection id = "sys-{system_id}")
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

    // Calculate buildable facilities (always available — facility commissioning costs 1 admin point)
    const buildableFacilities = getBuildableFacilities(realSys, gameData!);
    const adminPointsLeft = adminPointsAvailable ?? 0;
    const hasShipyard = (realSys.facilities || []).some(f => {
      const ft = gameData!.facilityTypes.find(t => t.facility_type_id === f.facility_type_id);
      return (ft?.name || "").toLowerCase().includes("shipyard");
    });
    const [shipDialogOpen, setShipDialogOpen] = useState(false);
    const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);

    return (
      <>
        <ImperialCard title={realSys.system_name} subtitle={classLabel}>
          <div className="space-y-2">
            <Row className="text-slate-500" label="Net Tribute" value={`₡${(realSys.tribute - realSys.upkeep).toLocaleString()}`} figured />
            <Row label="Population" value={realSys.current_population > 0 ? realSys.current_population.toLocaleString() : "Uninhabited"} />
            <Row label="Condition" figured>
              <StatusBadge variant={conditionVariant}>{realSys.condition}</StatusBadge>
            </Row>
            <Row label="Morale" value={`${realSys.morale}`} figured />
            <Row label="Owner" value={CLASSIFICATION_LABELS[realSys.owner as HexClassification] || realSys.owner || "Unowned"} />
          </div>
        </ImperialCard>

        <ImperialCard title="Economy">
          <div className="space-y-2.5">
            <ProgressBar label="Resources" value={realSys.resources} max={100} color={realSys.resources >= 50 ? "bronze" : "crimson"} />
            <Row label="Tribute" value={`${realSys.tribute}`} figured />
            <Row label="Upkeep" value={`${realSys.upkeep}`} figured />
            <Row label="Survey" value={`${realSys.survey}`} figured />
          </div>
        </ImperialCard>

        <ImperialCard title="Facilities">
          {facilityNames.length > 0 ? (
            <div className="space-y-1.5">
              {facilityNames.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-slate-500 py-1 border-b border-border last:border-0">
                  <span>{f.icon} {f.name}</span>
                  <span className="font-semibold text-bronze">×{f.qty}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">No facilities built at this system.</p>
          )}
        </ImperialCard>


        <ImperialCard title="Production Queue">
          <div className="space-y-1.5">
            {(realSys.facilities_in_production || []).length > 0 ? (
              (realSys.facilities_in_production || []).map((p, i) => {
                const ft = gameData!.facilityTypes.find(t => t.facility_type_id === p.facility_type_id);
                return (
                  <div key={i} className="flex items-center justify-between text-xs text-slate-500 py-1 border-b border-border last:border-0">
                    <span>{ft?.icon || "🏭"} {ft?.name || p.facility_type_id}</span>
                    <span className="text-muted-foreground">{p.turns_remaining}T</span>
                  </div>
                );
              })
            ) : (
              <p className="text-[10px] text-muted-foreground italic">No facilities under construction.</p>
            )}
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
            <p className="text-[10px] text-muted-foreground italic">No ships under construction.</p>
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

        <ImperialCard title="Defenses">
          <div className="space-y-2">
            <ProgressBar label="Ground Forces" value={realSys.current_ground_defenses} max={realSys.max_ground_defenses || 1} color="bronze" />
            <StrikecraftDisplay system={realSys} gameData={gameData!} />
          </div>
        </ImperialCard>

        <Dialog open={facilityDialogOpen} onOpenChange={setFacilityDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Build Facility — {realSys.system_name}</DialogTitle>
            </DialogHeader>
            {buildableFacilities.length > 0 ? (
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {buildableFacilities.map((bf) => {
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
                        <span className="text-xs font-semibold text-accent">{bf.icon} {bf.name}</span>
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
          systemName={realSys.system_name}
          shipTypes={gameData?.shipTypes || []}
          playerFleets={(() => {
            if (!gameData || !playerOwnerClassification) return [];
            const sysHex = Array.from(gameData.hexes.values()).find((h) => h.hex_id === realSys.hex_id);
            return gameData.fleets
              .filter((f) => f.owner_classification === playerOwnerClassification)
              .map((f) => ({
                fleet_id: f.fleet_id,
                fleet_name: f.fleet_name,
                atSystem: !!sysHex && f.hex_x === sysHex.x && f.hex_y === sysHex.y,
              }))
              .sort((a, b) => Number(b.atSystem) - Number(a.atSystem));
          })()}
        />
      </>
    );
  }

  // Fallback to dummy data
  const d = REGION_DETAILS[id];
  if (!d) return <p className="text-xs text-muted-foreground">Unknown system.</p>;

  return (
    <>
      <ImperialCard title={d.name} subtitle={d.classification}>
        <div className="space-y-2">
          <Row label="Population" value={d.population} />
          <Row label="Condition">
            <StatusBadge variant={d.condition === "Stable" || d.condition === "Prosperous" ? "success" : d.condition === "Contested" ? "danger" : "info"}>
              {d.condition}
            </StatusBadge>
          </Row>
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
      <ImperialCard title="Facilities">
        <div className="space-y-1.5">
          {d.facilities.map((f) => (
            <div key={f} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
              <span>{f}</span>
              <StatusBadge variant="success">Active</StatusBadge>
            </div>
          ))}
        </div>
      </ImperialCard>
    </>
  );
}

function ArmyDetail({ id, gameData, playerOwnerClassification, fleetOrderContext, onStartTargeting, combatPointsAvailable, onOrdersChanged }: { id: string; gameData?: GameMapData; playerOwnerClassification?: string; fleetOrderContext?: { gameId: string; playerId: string; turnNumber: number }; onStartTargeting?: (t: { mode: "hex"; orderType: "fleet_move"; fleetId: string } | { mode: "fleet"; orderType: "attack"; fleetId: string }) => void; combatPointsAvailable?: number; onOrdersChanged?: () => void }) {
  // Try real data (selection id = "fleet-{fleet_id}")
  const fleetId = id.startsWith("fleet-") ? id.replace("fleet-", "") : null;
  const realFleet = fleetId && gameData ? gameData.fleets.find(f => f.fleet_id === fleetId) : undefined;

  if (realFleet) {
    const canEdit = !!playerOwnerClassification && realFleet.owner_classification === playerOwnerClassification;
    const allSystems = gameData ? Array.from(gameData.systems.values()) : [];
    return (
      <FleetDetailContent
        fleet={realFleet}
        shipTypes={gameData?.shipTypes}
        allFleets={gameData?.fleets}
        allSystems={allSystems}
        allHexes={gameData?.hexes}
        canEdit={canEdit}
        orderContext={fleetOrderContext}
        onStartTargeting={onStartTargeting}
        combatPointsAvailable={combatPointsAvailable}
        onOrdersChanged={onOrdersChanged}
      />
    );
  }

  // Fallback to dummy
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

function ProductionDetail({ id }: { id: string }) {
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
          ) : (
            d.queue.map((q, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
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

function FactionDetail({ id }: { id: string }) {
  return (
    <>
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
    </>
  );
}

function NewsDetail({ story }: { story?: NewsStory }) {
  if (!story) return <p className="text-xs text-muted-foreground">Dispatch not found.</p>;

  return (
    <ImperialCard title={story.headline} subtitle={`Turn ${story.turn} · ${story.category}`}>
      <p className="text-xs font-medium text-foreground leading-relaxed">{story.summary}</p>
    </ImperialCard>
  );
}

/* ── Buildable Facilities Logic ── */
interface BuildableFacility {
  facility_type_id: string;
  name: string;
  icon: string;
  description: string;
  cost: number;
  turns_to_build: number;
  maintenance: number;
  consumesName?: string;
}

function getBuildableFacilities(system: SystemData, gameData: GameMapData): BuildableFacility[] {
  const ftFull = gameData.facilityTypesFull || [];
  const builtFacilities = system.facilities || [];
  const inProduction = system.facilities_in_production || [];

  // Map of facility_type_id -> total built quantity
  const builtMap = new Map<string, number>();
  for (const f of builtFacilities) {
    builtMap.set(f.facility_type_id, (builtMap.get(f.facility_type_id) || 0) + f.quantity);
  }

  // Count in-production by type
  const prodMap = new Map<string, number>();
  for (const p of inProduction) {
    prodMap.set(p.facility_type_id, (prodMap.get(p.facility_type_id) || 0) + 1);
  }

  const result: BuildableFacility[] = [];

  for (const ft of ftFull) {
    const builtCount = (builtMap.get(ft.facility_type_id) || 0) + (prodMap.get(ft.facility_type_id) || 0);

    // Check max_per_system (0 = unlimited)
    if (ft.max_per_system > 0 && builtCount >= ft.max_per_system) continue;

    // Check prerequisite: consumed_facility_id must be built
    if (ft.consumed_facility_id) {
      const prereqCount = builtMap.get(ft.consumed_facility_id) || 0;
      if (prereqCount <= 0) continue;
    }

    const consumedFt = ft.consumed_facility_id
      ? ftFull.find(f => f.facility_type_id === ft.consumed_facility_id)
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

/* ── Strikecraft Display ── */
function StrikecraftDisplay({ system, gameData }: { system: SystemData; gameData: GameMapData }) {
  const ftFull = gameData.facilityTypesFull || [];
  const shipTypes = gameData.shipTypes || [];

  // Calculate capacity from facilities
  let fighterCap = 0;
  let gunshipCap = 0;
  for (const f of system.facilities || []) {
    const ft = ftFull.find(t => t.facility_type_id === f.facility_type_id);
    if (ft) {
      fighterCap += (ft.fighter_capacity || 0) * f.quantity;
      gunshipCap += (ft.gunship_capacity || 0) * f.quantity;
    }
  }

  const getShipName = (id: string) => shipTypes.find(s => s.id === id)?.name || id;
  const getHullClass = (id: string) => shipTypes.find(s => s.id === id)?.hull_class || "";

  const fighters = (system.stationed_fighters || []);
  const gunships = (system.stationed_gunships || []);

  // Split fighters into heavy (FH) and light (FL)
  const heavyFighters = fighters.filter(f => getHullClass(f.ship_type_id) === "FH");
  const lightFighters = fighters.filter(f => getHullClass(f.ship_type_id) === "FL");

  const totalFighters = fighters.reduce((s, f) => s + f.quantity, 0);
  const totalGunships = gunships.reduce((s, f) => s + f.quantity, 0);

  if (fighterCap === 0 && gunshipCap === 0 && totalFighters === 0 && totalGunships === 0) {
    return <p className="text-[10px] text-muted-foreground italic">No strikecraft capacity.</p>;
  }

  return (
    <div className="space-y-2 pt-1">
      {(fighterCap > 0 || totalFighters > 0) && (
        <>
          <ProgressBar label="Fighters" value={totalFighters} max={fighterCap || 1} color={totalFighters >= fighterCap ? "bronze" : "crimson"} />
          {heavyFighters.map(f => (
            <div key={f.ship_type_id} className="flex justify-between text-[11px] pl-2">
              <span className="text-muted-foreground">↳ {getShipName(f.ship_type_id)}</span>
              <span className="font-semibold text-accent">×{f.quantity}</span>
            </div>
          ))}
          {lightFighters.map(f => (
            <div key={f.ship_type_id} className="flex justify-between text-[11px] pl-2">
              <span className="text-muted-foreground">↳ {getShipName(f.ship_type_id)}</span>
              <span className="font-semibold text-accent">×{f.quantity}</span>
            </div>
          ))}
        </>
      )}
      {(gunshipCap > 0 || totalGunships > 0) && (
        <>
          <ProgressBar label="Gunships" value={totalGunships} max={gunshipCap || 1} color={totalGunships >= gunshipCap ? "bronze" : "crimson"} />
          {gunships.map(f => (
            <div key={f.ship_type_id} className="flex justify-between text-[11px] pl-2">
              <span className="text-muted-foreground">↳ {getShipName(f.ship_type_id)}</span>
              <span className="font-semibold text-accent">×{f.quantity}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ── Helpers ── */
function Row({ label, value, children, figured, className = "" }: { label: string; value?: string; children?: React.ReactNode; figured?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between items-center text-xs ${className}`}>
      <span className="text-muted-foreground">{label}</span>
      {children || (
        <span className={figured
          ? "font-bold text-senate-dark font-heading"
          : "font-semibold text-accent"
        }>{value}</span>
      )}
    </div>
  );
}
