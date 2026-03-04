// Deterministic seeded RNG (mulberry32)
function createRNG(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

export interface ShipTypeData {
  id: string;
  name: string;
  class: string;
  hull_class: string;
  point_cost: number;
  hull: number;
  armor: number;
  lasers: number;
  missiles: number;
  sensor_rating: number;
  max_jump: number;
  supply_capacity: number;
}

export interface FleetShipData {
  ship_type: ShipTypeData;
  quantity: number;
  tactical_group: string;
}

export interface FleetSnapshot {
  id: string;
  name: string;
  ships: FleetShipData[];
  points_budget: number;
}

interface ShipInstance {
  instanceId: string;
  typeId: string;
  name: string;
  class: string;
  hull_class: string;
  maxHull: number;
  currentHull: number;
  armor: number;
  lasers: number;
  missiles: number;
  sensor_rating: number;
  max_jump: number;
  tacticalGroup: string;
  fleet: "A" | "B";
  crippled: boolean;
}

export interface BattleEvent {
  seq: number;
  tick: number;
  event_type: string;
  payload_json: Record<string, unknown>;
  public_summary_text: string;
  admin_explain_text: string;
}

export interface BattleResult {
  winner: "A" | "B" | "draw";
  events: BattleEvent[];
  finalState: { fleetA: ShipInstance[]; fleetB: ShipInstance[] };
  seed: string;
}

const TACTICAL_GROUPS = ["Core", "Rear", "Retreat", "Special1", "Special2"];

// Target selection: General→smaller, Assault→larger, Escort→smaller
function getTargetPriority(attackerClass: string): string[] {
  switch (attackerClass) {
    case "General": return ["Light", "Medium", "Heavy", "Capital"];
    case "Assault": return ["Capital", "Heavy", "Medium", "Light"];
    case "Escort": return ["Light", "Medium", "Heavy", "Capital"];
    default: return ["Light", "Medium", "Heavy", "Capital"];
  }
}

// Phase definitions (simplified)
const PHASES = [
  { name: "Skirmishers vs Skirmishers", groupsA: ["Special1"], groupsB: ["Special1"], modA: 0.1, modB: 0.1 },
  { name: "Outflank vs Flank", groupsA: ["Special2"], groupsB: ["Special1", "Special2"], modA: 0.1, modB: -0.1 },
  { name: "Flank vs Cover Retreat", groupsA: ["Special1", "Special2"], groupsB: ["Retreat"], modA: 0, modB: 0 },
  { name: "Attack vs Attack", groupsA: ["Core"], groupsB: ["Core"], modA: 0, modB: 0 },
  { name: "Main Engagement", groupsA: ["Core", "Special1", "Special2"], groupsB: ["Core", "Rear", "Special1", "Special2"], modA: 0, modB: 0 },
];

function getGroupModifier(group: string, type: "attack" | "defense"): number {
  if (group === "Special1" || group === "Special2") return type === "attack" ? 0.1 : -0.1;
  if (group === "Rear") return type === "defense" ? 0.2 : -0.1;
  return 0;
}

export function runBattle(fleetA: FleetSnapshot, fleetB: FleetSnapshot, seedStr: string): BattleResult {
  const rng = createRNG(hashSeed(seedStr));
  const events: BattleEvent[] = [];
  let seq = 0;
  let tick = 0;

  function emit(type: string, payload: Record<string, unknown>, pub: string, admin: string) {
    events.push({ seq: seq++, tick, event_type: type, payload_json: payload, public_summary_text: pub, admin_explain_text: admin });
  }

  // 1) PREPROCESS - expand ships into instances
  const shipsA: ShipInstance[] = [];
  const shipsB: ShipInstance[] = [];
  let idCounter = 0;

  function expandFleet(snapshot: FleetSnapshot, fleet: "A" | "B"): ShipInstance[] {
    const instances: ShipInstance[] = [];
    for (const fs of snapshot.ships) {
      for (let i = 0; i < fs.quantity; i++) {
        instances.push({
          instanceId: `${fleet}-${idCounter++}`,
          typeId: fs.ship_type.id,
          name: `${fs.ship_type.name} #${i + 1}`,
          class: fs.ship_type.class,
          hull_class: fs.ship_type.hull_class,
          maxHull: fs.ship_type.hull,
          currentHull: fs.ship_type.hull,
          armor: fs.ship_type.armor,
          lasers: fs.ship_type.lasers,
          missiles: fs.ship_type.missiles,
          sensor_rating: fs.ship_type.sensor_rating,
          max_jump: fs.ship_type.max_jump,
          tacticalGroup: fs.tactical_group,
          fleet,
          crippled: false,
        });
      }
    }
    return instances;
  }

  shipsA.push(...expandFleet(fleetA, "A"));
  shipsB.push(...expandFleet(fleetB, "B"));

  emit("battle_start", { fleetA: fleetA.name, fleetB: fleetB.name, seed: seedStr, shipsA: shipsA.length, shipsB: shipsB.length },
    `Battle begins: ${fleetA.name} vs ${fleetB.name}`,
    `Battle initialized with seed "${seedStr}". Fleet A: ${shipsA.length} ships, Fleet B: ${shipsB.length} ships.`);

  // 2) INITIATIVE
  const minJumpA = shipsA.length ? Math.min(...shipsA.map(s => s.max_jump)) : 0;
  const minJumpB = shipsB.length ? Math.min(...shipsB.map(s => s.max_jump)) : 0;
  const initA = 100 + minJumpA * 5;
  const initB = 100 + minJumpB * 5;

  emit("initiative", { initA, initB, minJumpA, minJumpB },
    `Initiative: Fleet A=${initA}, Fleet B=${initB}. ${initA >= initB ? "Fleet A" : "Fleet B"} has initiative.`,
    `Initiative calc: Base 100 + movement*5. A: 100+${minJumpA}*5=${initA}. B: 100+${minJumpB}*5=${initB}.`);

  tick++;

  // 3) PHASED COMBAT
  const allShips = [...shipsA, ...shipsB];

  function alive(fleet: "A" | "B") {
    return allShips.filter(s => s.fleet === fleet && !s.crippled);
  }

  function selectTarget(attacker: ShipInstance, enemies: ShipInstance[]): ShipInstance | null {
    const priority = getTargetPriority(attacker.class);
    // Prioritize damaged but not crippled
    for (const hullClass of priority) {
      const damaged = enemies.filter(e => e.hull_class === hullClass && !e.crippled && e.currentHull < e.maxHull);
      if (damaged.length > 0) return damaged[Math.floor(rng() * damaged.length)];
    }
    for (const hullClass of priority) {
      const targets = enemies.filter(e => e.hull_class === hullClass && !e.crippled);
      if (targets.length > 0) return targets[Math.floor(rng() * targets.length)];
    }
    const remaining = enemies.filter(e => !e.crippled);
    return remaining.length > 0 ? remaining[Math.floor(rng() * remaining.length)] : null;
  }

  function fireWeapon(attacker: ShipInstance, target: ShipInstance, weaponType: "laser" | "missile", attackMod: number, defenseMod: number) {
    const power = weaponType === "laser" ? attacker.lasers : attacker.missiles;
    if (power <= 0) return;

    const baseHitChance = weaponType === "laser" ? 0.65 : 0.45;
    const hitChance = Math.min(0.95, Math.max(0.1, baseHitChance + attackMod - defenseMod));
    const roll = rng();
    const hit = roll <= hitChance;

    if (hit) {
      const baseDmg = weaponType === "laser" ? power * 2 : power * 4;
      const dmgVariance = 0.7 + rng() * 0.6;
      const rawDmg = Math.round(baseDmg * dmgVariance);
      const actualDmg = Math.max(1, rawDmg - target.armor);
      target.currentHull -= actualDmg;

      if (target.currentHull <= 0) {
        target.currentHull = 0;
        target.crippled = true;
      }

      emit("fire_hit", {
        attacker: attacker.instanceId, target: target.instanceId, weapon: weaponType,
        roll: Math.round(roll * 1000) / 1000, hitChance: Math.round(hitChance * 100),
        rawDmg, armor: target.armor, actualDmg, remainingHull: target.currentHull, crippled: target.crippled
      },
        `${attacker.name} (${attacker.fleet}) hits ${target.name} (${target.fleet}) with ${weaponType}s for ${actualDmg} damage.${target.crippled ? " DESTROYED!" : ""}`,
        `${weaponType} fire: roll=${roll.toFixed(3)} vs ${(hitChance * 100).toFixed(0)}% chance. Hit! Raw dmg=${rawDmg}, armor=${target.armor}, actual=${actualDmg}. Hull: ${target.currentHull}/${target.maxHull}.${target.crippled ? " Ship crippled." : ""}`
      );
    } else {
      emit("fire_miss", {
        attacker: attacker.instanceId, target: target.instanceId, weapon: weaponType,
        roll: Math.round(roll * 1000) / 1000, hitChance: Math.round(hitChance * 100)
      },
        `${attacker.name} (${attacker.fleet}) fires ${weaponType}s at ${target.name} (${target.fleet}) — miss.`,
        `${weaponType} fire: roll=${roll.toFixed(3)} vs ${(hitChance * 100).toFixed(0)}% chance. Miss.`
      );
    }
  }

  for (const phase of PHASES) {
    if (alive("A").length === 0 || alive("B").length === 0) break;

    const aInPhase = alive("A").filter(s => phase.groupsA.includes(s.tacticalGroup));
    const bInPhase = alive("B").filter(s => phase.groupsB.includes(s.tacticalGroup));

    if (aInPhase.length === 0 && bInPhase.length === 0) continue;

    tick++;
    emit("phase_start", { phase: phase.name, aShips: aInPhase.length, bShips: bInPhase.length },
      `Phase: ${phase.name} — ${aInPhase.length} vs ${bInPhase.length} ships engaged.`,
      `Phase "${phase.name}" begins. Groups A: [${phase.groupsA}], Groups B: [${phase.groupsB}]. Phase mods: A attack+${phase.modA}, B defense+${phase.modB}.`);

    // Fire sequence: Lasers, Missiles, Lasers
    const fireSequence: ("laser" | "missile")[] = ["laser", "missile", "laser"];

    for (const weaponType of fireSequence) {
      if (alive("A").length === 0 || alive("B").length === 0) break;

      // Fleet A fires at B
      for (const attacker of aInPhase) {
        if (attacker.crippled) continue;
        const enemies = alive("B");
        if (enemies.length === 0) break;
        const target = selectTarget(attacker, enemies);
        if (!target) continue;
        const attackMod = phase.modA + getGroupModifier(attacker.tacticalGroup, "attack");
        const defenseMod = getGroupModifier(target.tacticalGroup, "defense");
        fireWeapon(attacker, target, weaponType, attackMod, defenseMod);
      }

      // Fleet B fires at A
      for (const attacker of bInPhase) {
        if (attacker.crippled) continue;
        const enemies = alive("A");
        if (enemies.length === 0) break;
        const target = selectTarget(attacker, enemies);
        if (!target) continue;
        const attackMod = phase.modB + getGroupModifier(attacker.tacticalGroup, "attack");
        const defenseMod = getGroupModifier(target.tacticalGroup, "defense");
        fireWeapon(attacker, target, weaponType, attackMod, defenseMod);
      }
    }
  }

  // 6) END CONDITIONS
  tick++;
  const aliveA = alive("A").length;
  const aliveB = alive("B").length;
  const winner: "A" | "B" | "draw" = aliveA > 0 && aliveB === 0 ? "A" : aliveB > 0 && aliveA === 0 ? "B" : aliveA === 0 && aliveB === 0 ? "draw" : aliveA > aliveB ? "A" : aliveB > aliveA ? "B" : "draw";

  emit("battle_end", { winner, aliveA, aliveB },
    `Battle over! ${winner === "draw" ? "Draw!" : `Fleet ${winner} wins!`} Survivors: A=${aliveA}, B=${aliveB}.`,
    `Battle concluded. Fleet A survivors: ${aliveA}/${shipsA.length}. Fleet B survivors: ${aliveB}/${shipsB.length}. Winner: ${winner}.`);

  return {
    winner,
    events,
    finalState: { fleetA: shipsA, fleetB: shipsB },
    seed: seedStr,
  };
}

// Log export utilities
export function eventsToJSON(result: BattleResult, fleetA: FleetSnapshot, fleetB: FleetSnapshot): string {
  return JSON.stringify({ seed: result.seed, fleetA, fleetB, events: result.events, winner: result.winner, finalState: result.finalState }, null, 2);
}

export function eventsToCSV(events: BattleEvent[]): string {
  const header = "seq,tick,event_type,public_summary_text\n";
  return header + events.map(e =>
    `${e.seq},${e.tick},"${e.event_type}","${e.public_summary_text.replace(/"/g, '""')}"`
  ).join("\n");
}

export function eventsToTXT(events: BattleEvent[]): string {
  return events.map(e => `[${e.seq}] ${e.public_summary_text}`).join("\n");
}
