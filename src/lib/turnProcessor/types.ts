/**
 * Shared types for the phase-based turn processor.
 *
 * The turn processor is a registry of phases that run sequentially.
 * Each phase reads ALL conditional player_orders for the current turn,
 * applies its slice of game state changes, and emits log entries.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import type { MapState } from "@/lib/mapTypes";
import type { DbFacilityType } from "@/hooks/useFacilityTypes";
import type { ShipTypeForUpkeep } from "@/lib/turnEngine";
import type { FactionMeta } from "./ownerKey";
import type { PerfTimer } from "./perf";

export type PhaseName = "economy" | "movement" | "visibility" | "combat" | "ground_combat" | "infect_intel_leech" | "threat_assessment" | "ai_slates" | "ai_plans";

/** A single conditional order, as stored in player_orders. */
export interface ConditionalOrder {
  id: string;
  game_id: string;
  player_id: string;
  turn_number: number;
  order_type: string;
  order_json: any;
  notes: string;
}

/** Game player record (subset used by phases). */
export interface PlayerCtx {
  id: string;
  user_id: string | null;
  player_slot: number | null;
  faction_id: string | null;
  treasury: number;
  admin_capability: number;
  combat_capability: number;
  visible_system_ids: number[];
  scouted_hex_ids: number[];
}

/** Mutable accumulator for per-player economic deltas during a phase run. */
export interface PlayerEconDelta {
  tribute: number;
  maintenance: number;
}

/** A log entry queued during phase execution; flushed in bulk at the end. */
export interface PhaseLogEntry {
  game_id: string;
  turn_number: number;
  phase: PhaseName | "summary";
  log_type: string;
  message: string;
  details_json?: any;
}

/** Context passed into every phase. Phases mutate `mapState` and `playerEcon`. */
export interface TurnContext {
  supabase: SupabaseClient;
  gameId: string;
  /** Turn currently being processed (the one whose orders we're applying). */
  currentTurn: number;
  /** The next turn number that orders will be solicited for. */
  nextTurn: number;

  mapState: MapState;
  facilityTypes: DbFacilityType[];
  shipTypes: ShipTypeForUpkeep[];

  players: PlayerCtx[];
  /** All factions in the game (used to map owner strings → faction id). */
  factions: FactionMeta[];
  /** All conditional orders for currentTurn, loaded once before phases run. */
  orders: ConditionalOrder[];

  /**
   * Per-faction econ deltas accumulated by phases.
   * Keys: `slot:N` for province players, `faction:<UUID>` for AI/neutral.
   * Use ownerToEconKey / rowEconKey from ./ownerKey to compute keys.
   */
  playerEcon: Map<string, PlayerEconDelta>;

  /** Logs queued for bulk insertion at the end of processing. */
  logs: PhaseLogEntry[];

  /** Optional perf timer (admin-only). Phases may push nested timings via `perf?.time(...)`. */
  perf?: PerfTimer;
}

/** A phase definition. Phases are pure-ish functions over the context. */
export interface Phase {
  name: PhaseName;
  label: string;
  run: (ctx: TurnContext) => Promise<void>;
}
