import React, { useMemo, useState } from "react";

import {
  SystemData,
  FacilityType,
  HexData,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_COLORS,
  HexClassification,
  hexKey,
} from "@/lib/mapTypes";
import { DbFaction } from "@/hooks/useFactions";
import { DbFacilityType } from "@/hooks/useFacilityTypes";
import PlanetEditorCard from "./PlanetEditorCard";

interface Props {
  systems: Map<number, SystemData>;
  hexes: Map<string, HexData>;
  facilityTypes: FacilityType[];
  onSelectSystem: (hexId: number) => void;
  selectedHexId?: number | null;
  factions?: DbFaction[];
  dbFacilityTypes?: DbFacilityType[];
  onUpdateSystem?: (hexId: number, updates: Partial<Omit<SystemData, "system_id" | "map_id" | "hex_id">>) => void;
  onCloseEditor?: () => void;
}

const PlanetsPanel: React.FC<Props> = ({
  systems,
  hexes,
  facilityTypes,
  onSelectSystem,
  selectedHexId,
  factions = [],
  dbFacilityTypes = [],
  onUpdateSystem,
  onCloseEditor,
}) => {
  const ftMap = useMemo(() => {
    const m = new Map<string, FacilityType>();
    for (const ft of facilityTypes) m.set(ft.facility_type_id, ft);
    return m;
  }, [facilityTypes]);

  const systemList = useMemo(() => {
    const list: (SystemData & { hex?: HexData })[] = [];
    for (const sys of systems.values()) {
      let hex: HexData | undefined;
      for (const h of hexes.values()) {
        if (h.hex_id === sys.hex_id) { hex = h; break; }
      }
      list.push({ ...sys, hex });
    }
    list.sort((a, b) => a.system_name.localeCompare(b.system_name));
    return list;
  }, [systems, hexes]);

  const ownerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of systemList) set.add(s.owner || "");
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [systemList]);

  const [ownerFilter, setOwnerFilter] = useState<string>("__all");
  const [condMin, setCondMin] = useState<string>("");
  const [condMax, setCondMax] = useState<string>("");
  const [popMin, setPopMin] = useState<string>("");
  const [popMax, setPopMax] = useState<string>("");

  const filteredList = useMemo(() => {
    const cMin = condMin === "" ? -Infinity : Number(condMin);
    const cMax = condMax === "" ? Infinity : Number(condMax);
    const pMin = popMin === "" ? -Infinity : Number(popMin);
    const pMax = popMax === "" ? Infinity : Number(popMax);
    return systemList.filter((s) => {
      if (ownerFilter !== "__all" && (s.owner || "") !== ownerFilter) return false;
      const c = s.condition ?? 0;
      const p = s.current_population ?? 0;
      if (c < cMin || c > cMax) return false;
      if (p < pMin || p > pMax) return false;
      return true;
    });
  }, [systemList, ownerFilter, condMin, condMax, popMin, popMax]);


  if (systemList.length === 0) {
    return (
      <div className="p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Planets
        </h3>
        <p className="text-xs text-muted-foreground">No systems placed on the map yet.</p>
      </div>
    );
  }

  const selectedSystem = selectedHexId != null ? systems.get(selectedHexId) : undefined;
  const selectedHex = selectedSystem
    ? Array.from(hexes.values()).find((h) => h.hex_id === selectedHexId)
    : undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Planets ({filteredList.length}/{systemList.length})
        </h3>
        <div className="space-y-1.5">
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
          >
            <option value="__all">All owners</option>
            {ownerOptions.map((o) => (
              <option key={o || "__none"} value={o}>{o || "(unowned)"}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <span className="text-[10px] w-12 text-muted-foreground">Cond</span>
            <input
              type="number" placeholder="min" value={condMin}
              onChange={(e) => setCondMin(e.target.value)}
              className="w-full min-w-0 rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            />
            <input
              type="number" placeholder="max" value={condMax}
              onChange={(e) => setCondMax(e.target.value)}
              className="w-full min-w-0 rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] w-12 text-muted-foreground">Pop</span>
            <input
              type="number" placeholder="min" value={popMin}
              onChange={(e) => setPopMin(e.target.value)}
              className="w-full min-w-0 rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            />
            <input
              type="number" placeholder="max" value={popMax}
              onChange={(e) => setPopMax(e.target.value)}
              className="w-full min-w-0 rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {selectedSystem && selectedHex && onUpdateSystem && (
          <div className="mb-3 px-1">
            <PlanetEditorCard
              system={selectedSystem}
              hex={selectedHex}
              factions={factions}
              facilityTypes={facilityTypes}
              dbFacilityTypes={dbFacilityTypes}
              onUpdateSystem={onUpdateSystem}
              onClose={() => onCloseEditor?.()}
            />
          </div>
        )}
        <div className="space-y-1">
          {filteredList.map((sys) => {
            const classification = sys.classification as HexClassification;
            const color = CLASSIFICATION_COLORS[classification] || "#666";
            const label = CLASSIFICATION_LABELS[classification] || sys.classification;

            return (
              <button
                key={sys.hex_id}
                onClick={() => onSelectSystem(sys.hex_id)}
                className="w-full text-left rounded border border-border px-2.5 py-2 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-foreground truncate">
                    {sys.system_name}
                  </span>
                  <span className="text-[10px] px-1 rounded bg-accent text-accent-foreground capitalize">
                    {sys.system_type || "system"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    {label}
                  </span>
                  {sys.hex && (
                    <span>({sys.hex.x}, {sys.hex.y})</span>
                  )}
                  <span>ID: {sys.system_id}</span>
                </div>

                {sys.owner && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Owner: <span className="text-foreground">{sys.owner}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-muted-foreground mt-0.5">
                  {sys.current_population > 0 && <span>Pop: {sys.current_population}</span>}
                  {sys.resources > 0 && <span>Res: {sys.resources}</span>}
                  {sys.morale > 0 && <span>Mor: {sys.morale}</span>}
                  {sys.condition > 0 && <span>Cond: {sys.condition}</span>}
                </div>

                {sys.facilities && sys.facilities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {sys.facilities.map((f) => {
                      const ft = ftMap.get(f.facility_type_id);
                      if (!ft) return null;
                      return (
                        <span
                          key={f.facility_type_id}
                          className="inline-flex items-center gap-0.5 rounded bg-accent px-1 py-0.5 text-[10px] text-accent-foreground"
                          title={ft.description}
                        >
                          {ft.icon} {ft.name}
                          {f.quantity > 1 && <span>×{f.quantity}</span>}
                        </span>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PlanetsPanel;
