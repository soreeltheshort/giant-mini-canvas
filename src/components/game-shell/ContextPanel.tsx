import { X, Landmark, Swords, Hammer, Scroll } from "lucide-react";
import type { GameMode, MapSelection, NewsStory } from "./gameShellTypes";
import { REGION_DETAILS, ARMY_DETAILS, PRODUCTION_DETAILS } from "./gameShellTypes";
import { ImperialCard } from "./ImperialCard";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";
import FleetDetailContent from "./FleetDetailContent";
import type { SystemData, MapFleet, FacilityType } from "@/lib/mapTypes";
import { CLASSIFICATION_LABELS, type HexClassification } from "@/lib/mapTypes";

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
  /** Province classification owned by the current player, e.g. "PROVINCE_2" */
  playerOwnerClassification?: string;
  fleetOrderContext?: { gameId: string; playerId: string; turnNumber: number };
  onStartTargeting?: (
    t: { mode: "hex"; orderType: "fleet_move"; fleetId: string }
      | { mode: "fleet"; orderType: "attack"; fleetId: string }
  ) => void;
  combatPointsAvailable?: number;
  onOrdersChanged?: () => void;
}

export default function ContextPanel({ mode, selection, news, onClose, onClearSelection, gameData, onBuildFacility, playerTreasury, playerOwnerClassification, fleetOrderContext, onStartTargeting, combatPointsAvailable, onOrdersChanged }: ContextPanelProps) {
  return (
    <aside className="w-72 bg-marble border-l-2 border-bronze/40 flex flex-col relative z-20 shrink-0 animate-fade-in">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border bronze-border-b shrink-0">
        <h2 className="font-heading text-[10px] font-semibold uppercase tracking-[0.15em] text-bronze-dark flex items-center gap-1.5">
          <ModeIcon mode={mode} selection={selection} />
          {getPanelTitle(mode, selection)}
        </h2>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {selection.type === "news" ? (
          <NewsDetail story={news.find((n) => n.id === selection.id)} />
        ) : selection.type === "region" ? (
          <RegionDetail id={selection.id} gameData={gameData} mode={mode} onBuildFacility={onBuildFacility} playerTreasury={playerTreasury} />
        ) : selection.type === "army" ? (
          <ArmyDetail id={selection.id} gameData={gameData} playerOwnerClassification={playerOwnerClassification} fleetOrderContext={fleetOrderContext} onStartTargeting={onStartTargeting} />
        ) : selection.type === "production-center" ? (
          <ProductionDetail id={selection.id} />
        ) : selection.type === "faction" ? (
          <FactionDetail id={selection.id} />
        ) : (
          <EmptyState mode={mode} />
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
  if (selection.type === "production-center") return "Production";
  if (selection.type === "faction") return "Faction Intel";
  const titles = { diplomacy: "Diplomatic Overview", military: "Strategic Overview", production: "Production Overview" };
  return titles[mode];
}

/* ── Empty States ── */
function EmptyState({ mode }: { mode: GameMode }) {
  const content = {
    diplomacy: {
      icon: Landmark,
      title: "Diplomatic Overview",
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
    military: {
      icon: Swords,
      title: "Strategic Overview",
      lines: [
        "Select a fleet or garrison on the map to view details.",
        "Fleet movement orders can be issued from this panel.",
      ],
      stats: [
        { label: "Total Fleets", value: "2" },
        { label: "Total Ships", value: "16" },
        { label: "Active Engagements", value: "0" },
      ],
    },
    production: {
      icon: Hammer,
      title: "Production Overview",
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
  };

  const c = content[mode];

  return (
    <>
      <div className="text-center py-4 space-y-2">
        <c.icon className="w-8 h-8 text-bronze/40 mx-auto" />
        <h3 className="font-heading text-sm font-semibold text-foreground">{c.title}</h3>
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

/* ── Detail Views ── */
function RegionDetail({ id, gameData, mode, onBuildFacility, playerTreasury }: {
  id: string;
  gameData?: GameMapData;
  mode?: GameMode;
  onBuildFacility?: (systemId: number, facilityTypeId: string) => void;
  playerTreasury?: number;
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

    // Calculate buildable facilities
    const buildableFacilities = mode === "production" ? getBuildableFacilities(realSys, gameData!) : [];

    return (
      <>
        <ImperialCard title={realSys.system_name} subtitle={classLabel}>
          <div className="space-y-2">
            <Row label="Population" value={realSys.current_population.toLocaleString()} />
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

        {(realSys.facilities_in_production || []).length > 0 && (
          <ImperialCard title="Under Construction">
            <div className="space-y-1.5">
              {realSys.facilities_in_production.map((p, i) => {
                const ft = gameData!.facilityTypes.find(t => t.facility_type_id === p.facility_type_id);
                return (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                    <span>{ft?.icon || "🏭"} {ft?.name || p.facility_type_id}</span>
                    <span className="text-muted-foreground">{p.turns_remaining}T</span>
                  </div>
                );
              })}
            </div>
          </ImperialCard>
        )}

        {mode === "production" && buildableFacilities.length > 0 && (
          <ImperialCard title="Build New Facility">
            <div className="space-y-1.5">
              {buildableFacilities.map((bf) => {
                const canAfford = (playerTreasury ?? 0) >= bf.cost;
                return (
                  <div key={bf.facility_type_id} className="border border-border rounded-sm p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{bf.icon} {bf.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>₡{bf.cost} · {bf.turns_to_build}T · ₡{bf.maintenance}/turn</span>
                    </div>
                    {bf.consumesName && (
                      <p className="text-[9px] text-muted-foreground italic">Upgrades {bf.consumesName}</p>
                    )}
                    <button
                      onClick={() => onBuildFacility?.(realSys.system_id, bf.facility_type_id)}
                      disabled={!canAfford}
                      className={`w-full mt-1 py-1 rounded-sm text-[10px] font-heading font-semibold uppercase tracking-wider transition-colors
                        ${canAfford
                          ? "bg-crimson text-primary-foreground hover:bg-crimson-light bronze-glow-hover"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                        }`}
                    >
                      {canAfford ? "Commission" : "Insufficient Funds"}
                    </button>
                  </div>
                );
              })}
            </div>
          </ImperialCard>
        )}

        {mode === "production" && buildableFacilities.length === 0 && (
          <ImperialCard title="Build New Facility">
            <p className="text-[10px] text-muted-foreground italic">No eligible facilities to build at this system.</p>
          </ImperialCard>
        )}

        <ImperialCard title="Defenses">
          <div className="space-y-2">
            <ProgressBar label="Ground Forces" value={realSys.current_ground_defenses} max={realSys.max_ground_defenses || 1} color="bronze" />
            <StrikecraftDisplay system={realSys} gameData={gameData!} />
          </div>
        </ImperialCard>
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

function ArmyDetail({ id, gameData, playerOwnerClassification, fleetOrderContext, onStartTargeting }: { id: string; gameData?: GameMapData; playerOwnerClassification?: string; fleetOrderContext?: { gameId: string; playerId: string; turnNumber: number }; onStartTargeting?: (t: { mode: "hex"; orderType: "fleet_move"; fleetId: string } | { mode: "fleet"; orderType: "attack"; fleetId: string }) => void }) {
  // Try real data (selection id = "fleet-{fleet_id}")
  const fleetId = id.startsWith("fleet-") ? id.replace("fleet-", "") : null;
  const realFleet = fleetId && gameData ? gameData.fleets.find(f => f.fleet_id === fleetId) : undefined;

  if (realFleet) {
    const canEdit = !!playerOwnerClassification && realFleet.owner_classification === playerOwnerClassification;
    return <FleetDetailContent fleet={realFleet} shipTypes={gameData?.shipTypes} canEdit={canEdit} orderContext={fleetOrderContext} onStartTargeting={onStartTargeting} />;
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
      <p className="text-xs text-foreground leading-relaxed">{story.summary}</p>
    </ImperialCard>
  );
}

/* ── Buildable Facilities Logic ── */
interface BuildableFacility {
  facility_type_id: string;
  name: string;
  icon: string;
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
              <span className="font-semibold text-foreground">×{f.quantity}</span>
            </div>
          ))}
          {lightFighters.map(f => (
            <div key={f.ship_type_id} className="flex justify-between text-[11px] pl-2">
              <span className="text-muted-foreground">↳ {getShipName(f.ship_type_id)}</span>
              <span className="font-semibold text-foreground">×{f.quantity}</span>
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
              <span className="font-semibold text-foreground">×{f.quantity}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ── Helpers ── */
function Row({ label, value, children, figured }: { label: string; value?: string; children?: React.ReactNode; figured?: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children || (
        <span className={figured
          ? "font-bold text-senate-dark font-heading"
          : "font-semibold text-foreground"
        }>{value}</span>
      )}
    </div>
  );
}
