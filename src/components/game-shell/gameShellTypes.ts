// Shared types for the game shell state management

export type GameMode = "diplomacy" | "military" | "production";

export type MapSelection =
  | { type: "none" }
  | { type: "region"; id: string }
  | { type: "army"; id: string }
  | { type: "faction"; id: string }
  | { type: "production-center"; id: string }
  | { type: "news"; id: string };

export interface GlobalStats {
  cinders: number;
  treasury: number;
  influence: number;
  production: number;
  militaryReadiness: number;
  stability: number;
}

export interface NewsStory {
  id: string;
  headline: string;
  summary: string;
  turn: number;
  read: boolean;
  category: "diplomatic" | "military" | "economic" | "event";
}

export interface MapMarker {
  id: string;
  label: string;
  x: number; // percent
  y: number; // percent
  type: "region" | "army" | "faction-capital" | "production-center";
  faction?: string;
  selected?: boolean;
}

// Dummy data generators
export const DUMMY_STATS: GlobalStats = {
  cinders: 18740,
  treasury: 42350,
  influence: 73,
  production: 156,
  militaryReadiness: 82,
  stability: 64,
};

export const DUMMY_NEWS: NewsStory[] = [
  { id: "n1", headline: "Border Skirmish at Novus Gate", summary: "Aurelian fleet elements exchanged fire with unidentified raiders near the Novus Gate relay. Casualties reported as minimal. Provincial command has raised alert status in the sector.", turn: 4, read: false, category: "military" },
  { id: "n2", headline: "Trade Compact Ratified", summary: "The Cassian-Valerian trade compact has been ratified by both provincial senates, establishing preferential tariff rates on refined cinders and military-grade alloys for the next six turns.", turn: 4, read: false, category: "diplomatic" },
  { id: "n3", headline: "Forge-Complex Expansion Complete", summary: "The orbital forge-complex above Aurelia Prime has completed its third expansion phase, increasing provincial production capacity by 12%. Governor's office projects full utilization within two turns.", turn: 3, read: true, category: "economic" },
  { id: "n4", headline: "Senate Resolution 447 Passed", summary: "The Republican Senate has passed Resolution 447, mandating increased tribute contributions from all provinces. Provincial governors have expressed varied responses ranging from compliance to formal objection.", turn: 3, read: true, category: "event" },
  { id: "n5", headline: "Alien Signal Detected in Rim Sector", summary: "Deep-range sensor arrays in the outer rim have detected anomalous transmissions matching no known Republican cipher pattern. Military intelligence has classified the signal source and dispatched a reconnaissance squadron.", turn: 2, read: true, category: "military" },
];

export const DUMMY_MARKERS: MapMarker[] = [
  { id: "r1", label: "Aurelia Prime", x: 45, y: 35, type: "region", faction: "Valerian" },
  { id: "r2", label: "Nova Castrum", x: 62, y: 28, type: "region", faction: "Aurelian" },
  { id: "r3", label: "Cassian Gate", x: 30, y: 52, type: "region", faction: "Cassian" },
  { id: "r4", label: "Dravian Hold", x: 72, y: 55, type: "region", faction: "Dravian" },
  { id: "r5", label: "Marcellan Reach", x: 20, y: 70, type: "region", faction: "Marcellan" },
  { id: "r6", label: "Octavan Bastion", x: 78, y: 72, type: "region", faction: "Octavan" },
  { id: "a1", label: "1st Legion", x: 48, y: 40, type: "army", faction: "Valerian" },
  { id: "a2", label: "Garrison Fleet", x: 43, y: 30, type: "army", faction: "Valerian" },
  { id: "a3", label: "Aurelian Vanguard", x: 58, y: 32, type: "army", faction: "Aurelian" },
  { id: "p1", label: "Imperial Forge", x: 40, y: 38, type: "production-center", faction: "Valerian" },
  { id: "p2", label: "Cassian Yards", x: 28, y: 48, type: "production-center", faction: "Cassian" },
  { id: "fc1", label: "Valerian Capitol", x: 46, y: 33, type: "faction-capital", faction: "Valerian" },
  { id: "fc2", label: "Aurelian Throne", x: 64, y: 26, type: "faction-capital", faction: "Aurelian" },
];

// Detail data for right panel
export const REGION_DETAILS: Record<string, { name: string; classification: string; population: string; condition: string; garrison: string; facilities: string[]; resources: { label: string; value: number; max: number }[] }> = {
  r1: { name: "Aurelia Prime", classification: "Core World", population: "4.2B", condition: "Stable", garrison: "1st Legion, Garrison Fleet", facilities: ["Orbital Dock", "Senate Hall", "Shield Array", "Cinder Refinery"], resources: [{ label: "Industry", value: 78, max: 100 }, { label: "Agriculture", value: 45, max: 100 }, { label: "Research", value: 92, max: 100 }] },
  r2: { name: "Nova Castrum", classification: "Fortress World", population: "1.8B", condition: "Fortified", garrison: "Aurelian Vanguard", facilities: ["Citadel Complex", "Weapons Forge", "Sensor Grid"], resources: [{ label: "Industry", value: 65, max: 100 }, { label: "Agriculture", value: 22, max: 100 }, { label: "Research", value: 48, max: 100 }] },
  r3: { name: "Cassian Gate", classification: "Trade Hub", population: "3.1B", condition: "Prosperous", garrison: "Trade Defense Flotilla", facilities: ["Commerce Exchange", "Relay Station", "Tariff Bureau"], resources: [{ label: "Industry", value: 55, max: 100 }, { label: "Agriculture", value: 70, max: 100 }, { label: "Research", value: 60, max: 100 }] },
  r4: { name: "Dravian Hold", classification: "Mining Colony", population: "890M", condition: "Developing", garrison: "Local Militia", facilities: ["Deep Core Mine", "Processing Plant"], resources: [{ label: "Industry", value: 88, max: 100 }, { label: "Agriculture", value: 15, max: 100 }, { label: "Research", value: 30, max: 100 }] },
  r5: { name: "Marcellan Reach", classification: "Frontier World", population: "520M", condition: "Contested", garrison: "None", facilities: ["Outpost Alpha"], resources: [{ label: "Industry", value: 25, max: 100 }, { label: "Agriculture", value: 55, max: 100 }, { label: "Research", value: 18, max: 100 }] },
  r6: { name: "Octavan Bastion", classification: "Military World", population: "1.4B", condition: "Mobilized", garrison: "Octavan Iron Guard", facilities: ["Fleet Anchorage", "War Academy", "Shield Generator"], resources: [{ label: "Industry", value: 70, max: 100 }, { label: "Agriculture", value: 35, max: 100 }, { label: "Research", value: 72, max: 100 }] },
};

export const ARMY_DETAILS: Record<string, { name: string; strength: number; maxStrength: number; morale: number; status: string; ships: { name: string; count: number }[]; commander: string }> = {
  a1: { name: "1st Legion", strength: 12, maxStrength: 16, morale: 88, status: "Stationed", ships: [{ name: "Trireme-class Cruiser", count: 4 }, { name: "Corvus-class Destroyer", count: 6 }, { name: "Aquila-class Fighter Wing", count: 2 }], commander: "Legatus Varro" },
  a2: { name: "Garrison Fleet", strength: 4, maxStrength: 6, morale: 72, status: "Patrol", ships: [{ name: "Corvus-class Destroyer", count: 2 }, { name: "Scutum-class Frigate", count: 2 }], commander: "Praefectus Cassia" },
  a3: { name: "Aurelian Vanguard", strength: 9, maxStrength: 12, morale: 91, status: "Alert", ships: [{ name: "Trireme-class Cruiser", count: 3 }, { name: "Corvus-class Destroyer", count: 4 }, { name: "Ballista-class Carrier", count: 2 }], commander: "Legatus Aurelius" },
};

export const PRODUCTION_DETAILS: Record<string, { name: string; type: string; output: number; capacity: number; queue: { item: string; turns: number }[]; efficiency: number }> = {
  p1: { name: "Imperial Forge", type: "Orbital Forge-Complex", output: 42, capacity: 60, queue: [{ item: "Corvus-class Destroyer", turns: 3 }, { item: "Shield Generator Mk.II", turns: 1 }], efficiency: 78 },
  p2: { name: "Cassian Yards", type: "Planetary Shipyard", output: 28, capacity: 40, queue: [{ item: "Scutum-class Frigate", turns: 2 }], efficiency: 65 },
};
