/**
 * Infect Intel Leech Phase
 *
 * Special rule (gated on faction `infect = true`):
 *   When an INFECT faction's fleet survives a full turn of combat (at least
 *   one ship still in the fleet after the battle), the INFECT faction
 *   instantly gains the complete world-state intelligence of the opposing
 *   faction for that turn — every system they've ever seen and every fleet
 *   sighting they hold. That knowledge is then remembered on later turns
 *   like any other fog-of-war memory.
 *
 * Runs AFTER combat (so we know who survived) and BEFORE visibility (so the
 * visibility phase can re-snapshot any newly granted systems with this
 * turn's fresh data).
 *
 * Implementation:
 *   - Scans ctx.logs for `battle_resolved` entries this phase already added.
 *   - For each battle where one side is INFECT and that side survived,
 *     mirrors the loser's intel onto the winner:
 *       • `game_factions.visible_system_ids` (union merge)
 *       • `player_system_intel` rows (copy snapshot_json, stamp last_seen_turn)
 *       • `player_fleet_intel` rows (copy quantities, stamp last_seen_turn)
 */
import type { Phase, TurnContext } from "../types";

interface FactionMeta { id: string; name: string; code_name: string | null; infect: boolean; }

export const infectIntelLeechPhase: Phase = {
  name: "infect_intel_leech",
  label: "Infect Intel Leech",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn } = ctx;

    const battleLogs = ctx.logs.filter(
      (l) => l.phase === "combat" && l.log_type === "battle_resolved",
    );
    if (battleLogs.length === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "infect_intel_leech",
        log_type: "noop", message: "No battles this turn — no INFECT intel leech.",
      });
      return;
    }

    // Load factions + game_factions so we can resolve owner_classification → player row.
    const [{ data: facRows }, { data: gfRows }] = await Promise.all([
      (supabase as any).from("factions").select("id, name, code_name, infect"),
      (supabase as any).from("game_factions").select("id, faction_id, visible_system_ids").eq("game_id", gameId),
    ]);

    const factions: FactionMeta[] = (facRows || []).map((f: any) => ({
      id: f.id, name: f.name || "", code_name: f.code_name || null, infect: !!f.infect,
    }));
    const factionById = new Map(factions.map((f) => [f.id, f]));

    // owner_classification (lowercased) → game_factions row.
    const gfByOwnerKey = new Map<string, { id: string; faction: FactionMeta | undefined; visible: number[] }>();
    for (const gf of (gfRows || [])) {
      const fac = gf.faction_id ? factionById.get(gf.faction_id) : undefined;
      const entry = {
        id: gf.id as string,
        faction: fac,
        visible: Array.isArray(gf.visible_system_ids) ? (gf.visible_system_ids as number[]) : [],
      };
      if (fac?.name) gfByOwnerKey.set(fac.name.toLowerCase(), entry);
      if (fac?.code_name) gfByOwnerKey.set(fac.code_name.toLowerCase(), entry);
    }
    const lookup = (owner: string | null | undefined) => {
      const k = (owner || "").trim().toLowerCase();
      return k ? gfByOwnerKey.get(k) : undefined;
    };

    // Build deduped (observer → victim) grants. If the same pair appears in
    // multiple battles, we only mirror once.
    const grants = new Map<string, { observerGfId: string; victimGfId: string; observerOwner: string; victimOwner: string }>();
    for (const log of battleLogs) {
      const d: any = log.details_json || {};
      const attackerOwner = d.attacker_owner as string | null;
      const defenderOwner = d.defender_owner as string | null;
      const attackerSurvivors = Number(d.attacker_survivors) || 0;
      const defenderSurvivors = Number(d.target_survivors) || 0;
      const attackerGf = lookup(attackerOwner);
      const defenderGf = lookup(defenderOwner);

      const consider = (
        observer: typeof attackerGf, observerOwner: string | null,
        victim: typeof defenderGf, victimOwner: string | null,
        survivors: number,
      ) => {
        if (!observer || !victim) return;
        if (observer.id === victim.id) return;
        if (!observer.faction?.infect) return;
        if (survivors <= 0) return;
        const key = `${observer.id}->${victim.id}`;
        if (grants.has(key)) return;
        grants.set(key, {
          observerGfId: observer.id, victimGfId: victim.id,
          observerOwner: observerOwner || "", victimOwner: victimOwner || "",
        });
      };
      consider(attackerGf, attackerOwner, defenderGf, defenderOwner, attackerSurvivors);
      consider(defenderGf, defenderOwner, attackerGf, attackerOwner, defenderSurvivors);
    }

    if (grants.size === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "infect_intel_leech",
        log_type: "noop",
        message: "No INFECT faction survived a battle this turn — no intel leeched.",
      });
      return;
    }

    let grantedCount = 0;
    for (const g of grants.values()) {
      // Re-read both sides' current intel inside the loop so chained grants
      // (rare but possible) see prior mirrors.
      const [{ data: obsGf }, { data: vicGf }, { data: vicSys }, { data: vicFleet }] = await Promise.all([
        (supabase as any).from("game_factions").select("visible_system_ids").eq("id", g.observerGfId).maybeSingle(),
        (supabase as any).from("game_factions").select("visible_system_ids").eq("id", g.victimGfId).maybeSingle(),
        (supabase as any).from("player_system_intel").select("system_id, snapshot_json").eq("game_id", gameId).eq("observer_player_id", g.victimGfId),
        (supabase as any).from("player_fleet_intel").select("enemy_fleet_id, ship_type_id, quantity_seen").eq("game_id", gameId).eq("observer_player_id", g.victimGfId),
      ]);

      const obsVisible: number[] = Array.isArray(obsGf?.visible_system_ids) ? obsGf!.visible_system_ids as number[] : [];
      const vicVisible: number[] = Array.isArray(vicGf?.visible_system_ids) ? vicGf!.visible_system_ids as number[] : [];
      const mergedVisible = Array.from(new Set<number>([...obsVisible, ...vicVisible]));

      await (supabase as any)
        .from("game_factions")
        .update({ visible_system_ids: mergedVisible })
        .eq("id", g.observerGfId);

      // Mirror system intel snapshots (stamped with the CURRENT turn — this
      // is fresh-as-of-now knowledge).
      const sysRows = (vicSys || []).map((r: any) => ({
        game_id: gameId,
        observer_player_id: g.observerGfId,
        system_id: r.system_id,
        last_seen_turn: currentTurn,
        snapshot_json: r.snapshot_json,
      }));
      const CHUNK = 500;
      for (let i = 0; i < sysRows.length; i += CHUNK) {
        await (supabase as any)
          .from("player_system_intel")
          .upsert(sysRows.slice(i, i + CHUNK), { onConflict: "observer_player_id,system_id" });
      }

      // Mirror fleet sightings.
      const fleetRows = (vicFleet || []).map((r: any) => ({
        game_id: gameId,
        observer_player_id: g.observerGfId,
        enemy_fleet_id: r.enemy_fleet_id,
        ship_type_id: r.ship_type_id,
        quantity_seen: r.quantity_seen,
        last_seen_turn: currentTurn,
      }));
      for (let i = 0; i < fleetRows.length; i += CHUNK) {
        await (supabase as any)
          .from("player_fleet_intel")
          .upsert(fleetRows.slice(i, i + CHUNK), { onConflict: "observer_player_id,enemy_fleet_id,ship_type_id" });
      }

      grantedCount++;
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "infect_intel_leech",
        log_type: "infect_intel_leeched",
        message: `${g.observerOwner || "INFECT faction"} leeched full world-state intel from ${g.victimOwner || "opposing faction"} after surviving combat.`,
        details_json: {
          observer_player_id: g.observerGfId,
          victim_player_id: g.victimGfId,
          observer_owner: g.observerOwner,
          victim_owner: g.victimOwner,
          systems_added_to_visibility: Math.max(0, mergedVisible.length - obsVisible.length),
          system_intel_rows_mirrored: sysRows.length,
          fleet_intel_rows_mirrored: fleetRows.length,
        },
      });
    }

    ctx.logs.push({
      game_id: gameId, turn_number: currentTurn, phase: "infect_intel_leech",
      log_type: "infect_intel_leech_summary",
      message: `INFECT intel leech complete — ${grantedCount} grant(s) applied.`,
    });
  },
};
