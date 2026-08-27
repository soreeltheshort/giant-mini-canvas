/**
 * buildTurnBriefing — pure summariser for the start-of-turn Politics briefing.
 *
 * Takes the raw `game_logs` rows for the LAST PROCESSED turn plus the player's
 * economic snapshot and produces a typed, section-based summary. Kept pure so a
 * later phase can hand the same object to an LLM for a narrated version.
 */
import { ownerMatchesFaction } from "@/lib/factionUtils";

export interface BriefingLogRow {
  id: string;
  turn_number: number;
  phase: string;
  log_type: string;
  message: string;
  details_json: any;
}

export interface BriefingItem {
  id: string;
  text: string;
  /** Optional secondary detail line. */
  detail?: string;
  tone?: "good" | "bad" | "neutral";
}

export interface BriefingSection {
  key: "economy" | "territory" | "military" | "orders" | "dispatches";
  title: string;
  items: BriefingItem[];
  /** Set when the underlying data isn't recorded yet (shown as a notice). */
  unavailable?: string;
}

export interface TurnBriefing {
  turn: number;
  reportedTurn: number;
  factionName: string;
  lede: string;
  sections: BriefingSection[];
  isEmpty: boolean;
}

export interface BriefingInput {
  /** Turn the player is now playing. */
  turn: number;
  /** Turn that was processed to produce these logs (turn - 1). */
  reportedTurn: number;
  factionName: string;
  playerId: string;
  ownClassification: string;
  logs: BriefingLogRow[];
  /** system_id → system name for systems the player currently owns. */
  ownedSystems: Map<number, string>;
  /** game_fleets.fleet_id values belonging to the player. */
  ownFleetIds: Set<string>;
  economy: {
    treasury: number;
    tribute: number;
    maintenance: number;
    adminPoints: number;
    combatPoints: number;
  };
}

const credits = (n: number) => `₡${Math.round(n).toLocaleString()}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${credits(Math.abs(n))}`;

export function buildTurnBriefing(input: BriefingInput): TurnBriefing {
  const { logs, ownedSystems, ownFleetIds, economy, playerId, ownClassification } = input;
  const mine = (owner?: string | null) => !!owner && ownerMatchesFaction(owner, ownClassification);

  /* ── 1. Economy ── */
  const net = economy.tribute - economy.maintenance;
  const economyItems: BriefingItem[] = [
    {
      id: "econ-treasury",
      text: `Treasury ${credits(economy.treasury)}`,
      detail: `${signed(net)} last turn — tribute ${credits(economy.tribute)}, upkeep ${credits(economy.maintenance)}`,
      tone: net >= 0 ? "good" : "bad",
    },
    {
      id: "econ-points",
      text: `Capability available: ${economy.adminPoints} administrative · ${economy.combatPoints} military`,
      tone: "neutral",
    },
  ];

  const completedFacilities: string[] = [];
  for (const l of logs) {
    if (l.log_type !== "system_processed") continue;
    const sysId = Number(l.details_json?.system_id);
    if (!ownedSystems.has(sysId)) continue;
    const completed: string[] = Array.isArray(l.details_json?.completed) ? l.details_json.completed : [];
    for (const f of completed) completedFacilities.push(`${f} — ${ownedSystems.get(sysId)}`);
  }

  /* ── 2. Territory ── */
  const territoryItems: BriefingItem[] = [];
  for (const l of logs) {
    const d = l.details_json || {};
    const sysName = d.system_name || ownedSystems.get(Number(d.system_id)) || "an unknown world";
    switch (l.log_type) {
      case "planet_captured":
      case "planet_colonized": {
        const gained = mine(d.new_owner);
        const lost = mine(d.previous_owner) && !gained;
        if (!gained && !lost) break;
        territoryItems.push({
          id: `terr-${l.id}`,
          text: gained
            ? (l.log_type === "planet_colonized" ? `Colony established at ${sysName}` : `${sysName} captured`)
            : `${sysName} lost to ${d.new_owner || "an enemy"}`,
          detail: l.message,
          tone: gained ? "good" : "bad",
        });
        break;
      }
      case "surface_combat_ongoing":
      case "ground_invasion_repulsed": {
        if (!mine(d.previous_owner) && !mine(d.new_owner)) break;
        territoryItems.push({
          id: `terr-${l.id}`,
          text: l.message,
          tone: l.log_type === "ground_invasion_repulsed" ? "good" : "bad",
        });
        break;
      }
      case "starbase_started": {
        if (!mine(d.owner)) break;
        territoryItems.push({ id: `terr-${l.id}`, text: l.message, tone: "good" });
        break;
      }
      case "starbase_destroyed": {
        if (!mine(d.owner) && !mine(d.defender_owner)) break;
        territoryItems.push({ id: `terr-${l.id}`, text: l.message, tone: "bad" });
        break;
      }
      default:
        break;
    }
  }

  /* ── 3. Military ── */
  const militaryItems: BriefingItem[] = [];
  for (const l of logs) {
    const d = l.details_json || {};
    if (l.log_type === "battle_resolved" || l.log_type === "starbase_battle_resolved" || l.log_type === "mutual_attack_resolved") {
      const asAttacker = mine(d.attacker_owner);
      const asDefender = mine(d.defender_owner);
      if (!asAttacker && !asDefender) continue;
      const winner = d.winner === "draw" ? "draw" : d.winner === "A" ? "attacker" : d.winner === "B" ? "defender" : null;
      const won = winner === "draw" ? null : winner === "attacker" ? asAttacker : asDefender;
      militaryItems.push({
        id: `mil-${l.id}`,
        text: l.message,
        detail: asAttacker ? "Our fleet was the attacker." : "Our fleet was the defender.",
        tone: won == null ? "neutral" : won ? "good" : "bad",
      });
      continue;
    }
    if (l.log_type === "dispatch_ground_combat" && d.observer?.player_id === playerId) {
      militaryItems.push({
        id: `mil-${l.id}`,
        text: d.narration_hints?.headline_seed || stripFactionPrefix(l.message),
        detail: stripFactionPrefix(l.message),
        tone: "neutral",
      });
      continue;
    }
    if (l.log_type === "fleet_destroyed" && mine(d.owner_classification || d.owner)) {
      militaryItems.push({ id: `mil-${l.id}`, text: l.message, tone: "bad" });
    }
  }

  /* ── 4. Orders & production ── */
  const orderItems: BriefingItem[] = [];
  for (const f of completedFacilities) {
    orderItems.push({ id: `ord-fac-${f}`, text: `Facility completed: ${f}`, tone: "good" });
  }
  for (const l of logs) {
    const d = l.details_json || {};
    if (l.log_type === "facility_build_started" && ownedSystems.has(Number(d.system_id))) {
      orderItems.push({
        id: `ord-${l.id}`,
        text: `Construction begun at ${ownedSystems.get(Number(d.system_id))}`,
        detail: l.message,
        tone: "neutral",
      });
      continue;
    }
    if ((l.log_type === "garrison_recruited" || l.log_type === "garrison_disbanded") && ownedSystems.has(Number(d.system_id))) {
      orderItems.push({ id: `ord-${l.id}`, text: l.message, tone: l.log_type === "garrison_recruited" ? "good" : "neutral" });
      continue;
    }
    if (
      (l.log_type === "ship_built_arrived" || l.log_type === "ship_built_new_fleet" || l.log_type === "ship_arrived" || l.log_type === "ship_built_in_transit")
      && d.fleet_id && ownFleetIds.has(String(d.fleet_id))
    ) {
      orderItems.push({ id: `ord-${l.id}`, text: l.message, tone: "good" });
      continue;
    }
    if (l.log_type === "supply_replenished" && ownFleetIds.has(String(d.fleet_id))) {
      orderItems.push({ id: `ord-${l.id}`, text: l.message, tone: "neutral" });
    }
  }

  /* ── 5. All dispatches addressed to this player ── */
  const dispatchItems: BriefingItem[] = logs
    .filter(l => l.log_type.startsWith("dispatch_") && l.details_json?.observer?.player_id === playerId)
    .map(l => ({
      id: `disp-${l.id}`,
      text: l.details_json?.narration_hints?.headline_seed || stripFactionPrefix(l.message),
      detail: stripFactionPrefix(l.message),
      tone: "neutral" as const,
    }));

  const sections: BriefingSection[] = ([
    { key: "economy", title: "Treasury & Economy", items: economyItems },
    { key: "territory", title: "Territory", items: territoryItems },
    { key: "military", title: "Military", items: militaryItems },
    { key: "orders", title: "Orders & Production", items: orderItems },
    { key: "dispatches", title: "Dispatches", items: dispatchItems },
  ] as BriefingSection[]).filter(s => s.items.length > 0 || s.key === "economy");

  const changeCount = territoryItems.length + militaryItems.length + orderItems.length;
  const lede = changeCount === 0
    ? `A quiet turn — treasury ${signed(net)}, no engagements or territorial changes reported.`
    : `${changeCount} development${changeCount === 1 ? "" : "s"} since last turn — treasury ${signed(net)}.`;

  return {
    turn: input.turn,
    reportedTurn: input.reportedTurn,
    factionName: input.factionName,
    lede,
    sections,
    isEmpty: changeCount === 0 && dispatchItems.length === 0,
  };
}

/** Dispatch messages are prefixed with "[Faction] " for per-observer rows. */
function stripFactionPrefix(msg: string): string {
  return (msg || "").replace(/^\[[^\]]+\]\s*/, "");
}
