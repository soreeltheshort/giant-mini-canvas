/**
 * useTurnBriefing — loads the start-of-turn briefing for the current player.
 *
 * Reads game_logs for the last processed turn (turn - 1), the player's economy
 * snapshot, and their fleet ids, then builds a typed TurnBriefing. Auto-opens
 * once per turn: `game_factions.last_briefing_turn` records acknowledgement so
 * it never re-opens for the same turn on any device.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildTurnBriefing, type TurnBriefing, type BriefingLogRow } from "@/lib/briefing/buildTurnBriefing";
import { ownerMatchesFaction } from "@/lib/factionUtils";

interface Args {
  gameId?: string;
  turnNumber?: number;
  playerId?: string;
  factionName: string;
  ownClassification: string;
  economy: {
    treasury: number;
    tribute: number;
    maintenance: number;
    adminPoints: number;
    combatPoints: number;
  };
  /** Current map systems (owner filter source). */
  systems?: Iterable<any>;
  /** Skip loading entirely (e.g. player not ready). */
  enabled?: boolean;
}

export function useTurnBriefing(args: Args) {
  const { gameId, turnNumber, playerId, factionName, ownClassification, economy, systems, enabled = true } = args;
  const [briefing, setBriefing] = useState<TurnBriefing | null>(null);
  const [open, setOpen] = useState(false);
  const [acknowledgedTurn, setAcknowledgedTurn] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !gameId || !playerId || !turnNumber) return;
    let cancelled = false;
    (async () => {
      const reportedTurn = Math.max(0, turnNumber - 1);

      const [{ data: logs }, { data: fleets }, { data: factionRow }] = await Promise.all([
        reportedTurn > 0
          ? (supabase as any)
              .from("game_logs")
              .select("id, turn_number, phase, log_type, message, details_json")
              .eq("game_id", gameId)
              .eq("turn_number", reportedTurn)
              .order("created_at", { ascending: true })
              .limit(1000)
          : Promise.resolve({ data: [] }),
        (supabase as any).from("game_fleets").select("fleet_id, owner_classification").eq("game_id", gameId),
        (supabase as any).from("game_factions").select("last_briefing_turn").eq("id", playerId).maybeSingle(),
      ]);
      if (cancelled) return;

      const ownedSystems = new Map<number, string>();
      for (const s of systems || []) {
        if (ownerMatchesFaction(s?.owner, ownClassification)) {
          ownedSystems.set(Number(s.system_id), s.system_name || `System #${s.system_id}`);
        }
      }
      const ownFleetIds = new Set<string>(
        ((fleets || []) as any[])
          .filter(f => ownerMatchesFaction(f.owner_classification, ownClassification))
          .map(f => String(f.fleet_id))
      );

      setBriefing(
        buildTurnBriefing({
          turn: turnNumber,
          reportedTurn,
          factionName,
          playerId,
          ownClassification,
          logs: (logs || []) as BriefingLogRow[],
          ownedSystems,
          ownFleetIds,
          economy,
        })
      );

      const ackTurn = Number((factionRow as any)?.last_briefing_turn ?? 0);
      setAcknowledgedTurn(ackTurn);
      if (ackTurn < turnNumber) setOpen(true);
    })();
    return () => { cancelled = true; };
    // economy/systems intentionally omitted: briefing is a snapshot per turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, playerId, turnNumber, enabled]);

  const acknowledge = useCallback(async () => {
    setOpen(false);
    if (!playerId || !turnNumber) return;
    if ((acknowledgedTurn ?? 0) >= turnNumber) return;
    setAcknowledgedTurn(turnNumber);
    await (supabase as any).from("game_factions").update({ last_briefing_turn: turnNumber }).eq("id", playerId);
  }, [playerId, turnNumber, acknowledgedTurn]);

  return { briefing, open, setOpen, acknowledge };
}
