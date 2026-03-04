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
  sensor_rating: number;
  cbt_speed: number;
  map_speed: number;
  target_preference: string;
  // Lasers
  laser_2_5cm: number;
  laser_4_5cm: number;
  laser_6_5cm: number;
  laser_10cm: number;
  laser_14cm: number;
  laser_20cm: number;
  laser_28cm: number;
  laser_50cm: number;
  // Missiles
  missile_10kg: number;
  missile_50kg: number;
  missile_100kg: number;
  missile_half_kt: number;
  // Special
  fighter_bay: number;
  fighter_storage: number;
  gun_ship_link: number;
  gunship_storage: number;
  ground_invasion: number;
  repair_pod: number;
  supply_pod: number;
  scout_sensors: number;
}

interface WeaponMount {
  name: string;
  type: "laser" | "missile";
  count: number;
  damage: number;       // per mount
  baseHitChance: number;
  armorPenetration: number;
}

// Weapon stats lookup: damage per mount and base hit chance
const WEAPON_STATS: Record<string, { type: "laser" | "missile"; damage: number; hitChance: number; armorPenetration: number }> = {
  laser_2_5cm:    { type: "laser",   damage: 1,  hitChance: 0.75, armorPenetration: 0 },
  laser_4_5cm:    { type: "laser",   damage: 2,  hitChance: 0.70, armorPenetration: 0 },
  laser_6_5cm:    { type: "laser",   damage: 3,  hitChance: 0.68, armorPenetration: 1 },
  laser_10cm:     { type: "laser",   damage: 5,  hitChance: 0.65, armorPenetration: 1 },
  laser_14cm:     { type: "laser",   damage: 8,  hitChance: 0.60, armorPenetration: 2 },
  laser_20cm:     { type: "laser",   damage: 12, hitChance: 0.55, armorPenetration: 3 },
  laser_28cm:     { type: "laser",   damage: 18, hitChance: 0.50, armorPenetration: 4 },
  laser_50cm:     { type: "laser",   damage: 30, hitChance: 0.45, armorPenetration: 6 },
  missile_10kg:   { type: "missile", damage: 6,  hitChance: 0.50, armorPenetration: 1 },
  missile_50kg:   { type: "missile", damage: 15, hitChance: 0.45, armorPenetration: 3 },
  missile_100kg:  { type: "missile", damage: 25, hitChance: 0.40, armorPenetration: 5 },
  missile_half_kt:{ type: "missile", damage: 50, hitChance: 0.35, armorPenetration: 8 },
};

const WEAPON_DISPLAY_NAMES: Record<string, string> = {
  laser_2_5cm: "2.5cm Laser",
  laser_4_5cm: "4.5cm Laser",
  laser_6_5cm: "6.5cm Laser",
  laser_10cm: "10cm Laser",
  laser_14cm: "14cm Laser",
  laser_20cm: "20cm Laser",
  laser_28cm: "28cm Laser",
  laser_50cm: "50cm Laser",
  missile_10kg: "10kg Missile",
  missile_50kg: "50kg Missile",
  missile_100kg: "100kg Missile",
  missile_half_kt: "½kt Missile",
};

function getWeaponMounts(shipType: ShipTypeData): WeaponMount[] {
  const mounts: WeaponMount[] = [];
  for (const [key, stats] of Object.entries(WEAPON_STATS)) {
    const count = (shipType as any)[key] as number;
    if (count > 0) {
      mounts.push({
        name: WEAPON_DISPLAY_NAMES[key],
        type: stats.type,
        count,
        damage: stats.damage,
        baseHitChance: stats.hitChance,
        armorPenetration: stats.armorPenetration,
      });
    }
  }
  return mounts;
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
  weapons: WeaponMount[];
  sensor_rating: number;
  cbt_speed: number;
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

// Target selection: General→smaller, Assault→larger, Escort→smaller
function getTargetPriority(attackerClass: string): string[] {
  switch (attackerClass) {
    case "General": return ["Light", "Medium", "Heavy", "Capital"];
    case "Assault": return ["Capital", "Heavy", "Medium", "Light"];
    case "Escort": return ["Light", "Medium", "Heavy", "Capital"];
    default: return ["Light", "Medium", "Heavy", "Capital"];
  }
}

// Externalized phase/modifier types
export interface PhaseConfig {
  name: string;
  groupsA: string[];
  groupsB: string[];
  modA: number;
  modB: number;
}

export interface GroupModConfig {
  group_name: string;
  attack_mod: number;
  defense_mod: number;
}

export interface CombatConstants {
  hit_chance_min: number;
  hit_chance_max: number;
  dmg_variance_min: number;
  dmg_variance_range: number;
  critical_hit_chance: number;
  critical_hit_multiplier: number;
}

// Fallback defaults (used if DB data not provided)
const DEFAULT_PHASES: PhaseConfig[] = [
  { name: "Skirmishers vs Skirmishers", groupsA: ["Skirmish"], groupsB: ["Skirmish"], modA: 0.1, modB: 0.1 },
  { name: "Outflank vs Flank", groupsA: ["Outflank"], groupsB: ["Flank", "Outflank"], modA: 0.1, modB: -0.1 },
  { name: "Flank vs Cover Retreat", groupsA: ["Flank", "Outflank", "Skirmish"], groupsB: ["Retreat"], modA: 0, modB: 0 },
  { name: "Attack vs Attack", groupsA: ["Core"], groupsB: ["Core"], modA: 0, modB: 0 },
  { name: "Main Engagement", groupsA: ["Core", "Flank", "Outflank", "Skirmish"], groupsB: ["Core", "Rear", "Flank", "Outflank", "Skirmish"], modA: 0, modB: 0 },
];

const DEFAULT_GROUP_MODS: GroupModConfig[] = [
  { group_name: "Core", attack_mod: 0, defense_mod: 0 },
  { group_name: "Attack", attack_mod: 0, defense_mod: 0 },
  { group_name: "Flank", attack_mod: 0.1, defense_mod: -0.1 },
  { group_name: "Outflank", attack_mod: 0.1, defense_mod: -0.1 },
  { group_name: "Skirmish", attack_mod: 0.1, defense_mod: -0.1 },
  { group_name: "Attack Planet", attack_mod: 0, defense_mod: 0 },
  { group_name: "Cover Retreat", attack_mod: 0, defense_mod: 0 },
  { group_name: "Rear", attack_mod: -0.1, defense_mod: 0.2 },
  { group_name: "Retreat", attack_mod: 0, defense_mod: 0 },
];

const DEFAULT_COMBAT_CONSTANTS: CombatConstants = {
  hit_chance_min: 0.10,
  hit_chance_max: 0.95,
  dmg_variance_min: 0.70,
  dmg_variance_range: 0.60,
  critical_hit_chance: 0.05,
  critical_hit_multiplier: 2.0,
};

function getGroupModifier(group: string, type: "attack" | "defense", modifiers: GroupModConfig[]): number {
  const mod = modifiers.find(m => m.group_name === group);
  if (!mod) return 0;
  return type === "attack" ? mod.attack_mod : mod.defense_mod;
}

export function runBattle(fleetA: FleetSnapshot, fleetB: FleetSnapshot, seedStr: string, phases?: PhaseConfig[], groupModifiers?: GroupModConfig[], combatConsts?: CombatConstants): BattleResult {
  const activePhases = phases && phases.length > 0 ? phases : DEFAULT_PHASES;
  const activeMods = groupModifiers && groupModifiers.length > 0 ? groupModifiers : DEFAULT_GROUP_MODS;
  const cc = combatConsts ?? DEFAULT_COMBAT_CONSTANTS;
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
          weapons: getWeaponMounts(fs.ship_type),
          sensor_rating: fs.ship_type.sensor_rating,
          cbt_speed: fs.ship_type.cbt_speed,
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

  // 2) INITIATIVE (based on combat speed)
  const avgSpeedA = shipsA.length ? Math.round(shipsA.reduce((s, sh) => s + sh.cbt_speed, 0) / shipsA.length) : 0;
  const avgSpeedB = shipsB.length ? Math.round(shipsB.reduce((s, sh) => s + sh.cbt_speed, 0) / shipsB.length) : 0;
  const initA = 100 + avgSpeedA * 5;
  const initB = 100 + avgSpeedB * 5;

  emit("initiative", { initA, initB, avgSpeedA, avgSpeedB },
    `Initiative: Fleet A=${initA}, Fleet B=${initB}. ${initA >= initB ? "Fleet A" : "Fleet B"} has initiative.`,
    `Initiative calc: Base 100 + avgCbtSpeed*5. A: 100+${avgSpeedA}*5=${initA}. B: 100+${avgSpeedB}*5=${initB}.`);

  tick++;

  // 3) PHASED COMBAT
  const allShips = [...shipsA, ...shipsB];

  function alive(fleet: "A" | "B") {
    return allShips.filter(s => s.fleet === fleet && !s.crippled);
  }

  function selectTarget(attacker: ShipInstance, enemies: ShipInstance[]): ShipInstance | null {
    const priority = getTargetPriority(attacker.class);
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

  function fireWeaponsOfType(attacker: ShipInstance, target: ShipInstance, weaponType: "laser" | "missile", attackMod: number, defenseMod: number) {
    const mounts = attacker.weapons.filter(w => w.type === weaponType);
    if (mounts.length === 0) return;

    for (const mount of mounts) {
      for (let gun = 0; gun < mount.count; gun++) {
        if (target.crippled) break;

        const hitChance = Math.min(cc.hit_chance_max, Math.max(cc.hit_chance_min, mount.baseHitChance + attackMod - defenseMod));
        const roll = rng();
        const hit = roll <= hitChance;

        if (hit) {
          const critRoll = rng();
          const isCrit = critRoll <= cc.critical_hit_chance;
          const dmgVariance = cc.dmg_variance_min + rng() * cc.dmg_variance_range;
          const baseDmg = Math.round(mount.damage * dmgVariance);
          const rawDmg = isCrit ? Math.round(baseDmg * cc.critical_hit_multiplier) : baseDmg;
          // Crits bypass armor entirely; otherwise armor reduced by weapon's penetration
          const armorReduction = isCrit ? 0 : Math.max(target.armor - mount.armorPenetration, 0);
          const actualDmg = Math.max(0, rawDmg - armorReduction);
          target.currentHull -= actualDmg;

          if (target.currentHull <= 0) {
            target.currentHull = 0;
            target.crippled = true;
          }

          const critTag = isCrit ? " CRITICAL!" : "";
          emit("fire_hit", {
            attacker: attacker.instanceId, target: target.instanceId,
            weaponName: mount.name, weaponType: mount.type, gunIndex: gun + 1, totalGuns: mount.count,
            roll: Math.round(roll * 1000) / 1000, hitChance: Math.round(hitChance * 100),
            rawDmg, armor: target.armor, actualDmg, remainingHull: target.currentHull, crippled: target.crippled, critical: isCrit
          },
            `${attacker.name} (${attacker.fleet}) hits ${target.name} (${target.fleet}) with ${mount.name} #${gun + 1} for ${actualDmg} damage.${critTag}${target.crippled ? " DESTROYED!" : ""}`,
            `${mount.name} #${gun + 1}/${mount.count}: roll=${roll.toFixed(3)} vs ${(hitChance * 100).toFixed(0)}% chance. Hit!${isCrit ? ` CRIT(roll=${critRoll.toFixed(3)} vs ${(cc.critical_hit_chance * 100).toFixed(0)}%, x${cc.critical_hit_multiplier})` : ""} Raw dmg=${rawDmg}, armor=${target.armor}, AP=${mount.armorPenetration}, reduction=${armorReduction}, actual=${actualDmg}. Hull: ${target.currentHull}/${target.maxHull}.${target.crippled ? " Ship crippled." : ""}`
          );
        } else {
          emit("fire_miss", {
            attacker: attacker.instanceId, target: target.instanceId,
            weaponName: mount.name, weaponType: mount.type, gunIndex: gun + 1, totalGuns: mount.count,
            roll: Math.round(roll * 1000) / 1000, hitChance: Math.round(hitChance * 100)
          },
            `${attacker.name} (${attacker.fleet}) fires ${mount.name} #${gun + 1} at ${target.name} (${target.fleet}) — miss.`,
            `${mount.name} #${gun + 1}/${mount.count}: roll=${roll.toFixed(3)} vs ${(hitChance * 100).toFixed(0)}% chance. Miss.`
          );
        }
      }
    }
  }

  for (const phase of activePhases) {
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
        const attackMod = phase.modA + getGroupModifier(attacker.tacticalGroup, "attack", activeMods);
        const defenseMod = getGroupModifier(target.tacticalGroup, "defense", activeMods);
        fireWeaponsOfType(attacker, target, weaponType, attackMod, defenseMod);
      }

      // Fleet B fires at A
      for (const attacker of bInPhase) {
        if (attacker.crippled) continue;
        const enemies = alive("A");
        if (enemies.length === 0) break;
        const target = selectTarget(attacker, enemies);
        if (!target) continue;
        const attackMod = phase.modB + getGroupModifier(attacker.tacticalGroup, "attack", activeMods);
        const defenseMod = getGroupModifier(target.tacticalGroup, "defense", activeMods);
        fireWeaponsOfType(attacker, target, weaponType, attackMod, defenseMod);
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
