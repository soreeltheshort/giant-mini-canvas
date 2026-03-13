import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HexData,
  SystemData,
  SystemType,
  FacilityType,
  SystemFacility,
  HexClassification,
  ALL_CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_COLORS,
} from "@/lib/mapTypes";
import { DbFaction } from "@/hooks/useFactions";
import { DbFacilityType } from "@/hooks/useFacilityTypes";
import { DEFAULT_TURN_CONSTANTS } from "@/lib/turnEngine";
interface Props {
  hex: HexData | null;
  system: SystemData | undefined;
  facilityTypes: FacilityType[];
  dbFacilityTypes: DbFacilityType[];
  factions: DbFaction[];
  onClassificationChange: (hexId: number, c: HexClassification) => void;
  onAddSystem: (hexId: number, name: string, rank: number) => void;
  onUpdateSystem: (hexId: number, updates: Partial<Omit<SystemData, "system_id" | "map_id" | "hex_id">>) => void;
  onRemoveSystem: (hexId: number) => void;
  onSearchCoords: (x: number, y: number) => void;
}

const RightPanel: React.FC<Props> = ({
  hex,
  system,
  facilityTypes,
  dbFacilityTypes,
  factions,
  onClassificationChange,
  onAddSystem,
  onUpdateSystem,
  onRemoveSystem,
  onSearchCoords,
}) => {
  const [sysName, setSysName] = useState("");
  const [sysRank, setSysRank] = useState(1);
  const [sysOwner, setSysOwner] = useState("");
  const [sysType, setSysType] = useState<SystemType>("system");
  const [curPop, setCurPop] = useState(0);
  const [survey, setSurvey] = useState(0);
  const [tribute, setTribute] = useState(0);
  const [upkeep, setUpkeep] = useState(0);
  const [resources, setResources] = useState(0);
  const [condition, setCondition] = useState(0);
  const [morale, setMorale] = useState(0);
  const [maxGD, setMaxGD] = useState(0);
  const [curGD, setCurGD] = useState(0);
  const [planetIndex, setPlanetIndex] = useState(0);

  const [searchX, setSearchX] = useState("");
  const [searchY, setSearchY] = useState("");

  useEffect(() => {
    if (system) {
      setSysName(system.system_name);
      setSysRank(system.importance_rank);
      setSysOwner(system.owner || "");
      setSysType(system.system_type || "system");
      setCurPop(system.current_population || 0);
      setSurvey(system.survey || 0);
      setTribute(system.tribute || 0);
      setUpkeep(system.upkeep || 0);
      setResources(system.resources || 0);
      setCondition(system.condition || 0);
      setMorale(system.morale || 0);
      setMaxGD(system.max_ground_defenses || 0);
      setCurGD(system.current_ground_defenses || 0);
      setPlanetIndex(system.planet_index || 0);
    } else {
      setSysName("");
      setSysRank(1);
      setSysOwner("");
      setSysType("system");
      setCurPop(0);
      setSurvey(0);
      setTribute(0);
      setUpkeep(0);
      setResources(0);
      setCondition(0);
      setMorale(0);
      setMaxGD(0);
      setCurGD(0);
      setPlanetIndex(0);
    }
  }, [system, hex?.hex_id]);

  const handleSave = () => {
    if (!hex || !system) return;

    // Calculate current condition from initial_condition + facility bonuses
    let conditionBonus = 0;
    for (const f of system.facilities || []) {
      const ft = dbFacilityTypes.find((t) => t.id === f.facility_type_id);
      if (ft?.condition_bonus) conditionBonus += ft.condition_bonus * f.quantity;
    }
    const calculatedCondition = condition + conditionBonus;

    // Calculate tribute: MIN(pop, res) * constA + ABS(pop - res) * constB, then facility modifiers
    const pop = curPop;
    const res = resources;
    const baseTribute =
      Math.min(pop, res) * DEFAULT_TURN_CONSTANTS.pop_and_resource_tribute +
      Math.abs(pop - res) * DEFAULT_TURN_CONSTANTS.pop_or_resources_tribute;
    let facilityFlatBonus = 0;
    let tributePercentSum = 0;
    for (const f of system.facilities || []) {
      const ft = dbFacilityTypes.find((t) => t.id === f.facility_type_id);
      if (ft?.tribute_flat) facilityFlatBonus += ft.tribute_flat * f.quantity;
      if (ft?.tribute_percent) tributePercentSum += ft.tribute_percent * f.quantity;
    }
    const calculatedTribute = Math.round((baseTribute + facilityFlatBonus) * (1 + tributePercentSum / 100));

    // If population > 0, morale = current condition
    const calculatedMorale = curPop > 0 ? calculatedCondition : morale;

    onUpdateSystem(hex.hex_id, {
      system_name: sysName,
      importance_rank: sysRank,
      owner: sysOwner,
      system_type: sysType,
      current_population: curPop,
      survey,
      tribute: calculatedTribute,
      upkeep,
      resources,
      condition: calculatedCondition,
      morale: calculatedMorale,
      max_ground_defenses: maxGD,
      current_ground_defenses: curGD,
      planet_index: planetIndex,
    });
  };

  const toggleFacility = (ftId: string) => {
    if (!hex || !system) return;
    const existing = system.facilities || [];
    const has = existing.find((f) => f.facility_type_id === ftId);
    const updated = has
      ? existing.filter((f) => f.facility_type_id !== ftId)
      : [...existing, { facility_type_id: ftId, quantity: 1 }];
    onUpdateSystem(hex.hex_id, { facilities: updated });
  };

  const updateFacilityQty = (ftId: string, qty: number) => {
    if (!hex || !system) return;
    const updated = (system.facilities || []).map((f) =>
      f.facility_type_id === ftId ? { ...f, quantity: Math.max(1, qty) } : f
    );
    onUpdateSystem(hex.hex_id, { facilities: updated });
  };

  return (
    <div className="flex h-full w-64 flex-col gap-4 overflow-y-auto border-l border-border bg-background p-4">
      {/* Search */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Search Coordinates
        </h3>
        <div className="flex gap-1">
          <Input placeholder="X" value={searchX} onChange={(e) => setSearchX(e.target.value)} className="h-8 text-xs" />
          <Input placeholder="Y" value={searchY} onChange={(e) => setSearchY(e.target.value)} className="h-8 text-xs" />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => {
              const x = parseInt(searchX);
              const y = parseInt(searchY);
              if (!isNaN(x) && !isNaN(y)) onSearchCoords(x, y);
            }}
          >
            Go
          </Button>
        </div>
      </div>

      {!hex ? (
        <p className="text-xs text-muted-foreground">Select a hex to inspect</p>
      ) : (
        <>
          {/* Hex Inspector */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hex Inspector</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Coordinates</span>
                <span>({hex.x}, {hex.y})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cube</span>
                <span>({hex.cube_x}, {hex.cube_y}, {hex.cube_z})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hex ID</span>
                <span>{hex.hex_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Region ID</span>
                <span>{hex.region_id ?? "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Classification</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: CLASSIFICATION_COLORS[hex.classification] }} />
                  {CLASSIFICATION_LABELS[hex.classification]}
                </span>
              </div>
            </div>
          </div>

          {/* Change Classification */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Set Classification</h3>
            <div className="flex flex-col gap-1">
              {ALL_CLASSIFICATIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => onClassificationChange(hex.hex_id, c)}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${
                    hex.classification === c ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: CLASSIFICATION_COLORS[c] }} />
                  {CLASSIFICATION_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Solar System */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Solar System</h3>
            {hex.has_system && system ? (
              <div className="space-y-2">
                <Input value={sysName} onChange={(e) => setSysName(e.target.value)} placeholder="System name" className="h-8 text-xs" />

                {/* Type selector */}
                <div className="flex gap-1">
                  {(["system", "station"] as SystemType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSysType(t)}
                      className={`flex-1 rounded px-2 py-1 text-xs capitalize transition-colors ${
                        sysType === t ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground border border-border"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground">Owner (Faction)</label>
                  <select
                    value={sysOwner}
                    onChange={(e) => setSysOwner(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">— None —</option>
                    {factions.map((f) => (
                      <option key={f.id} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                </div>

                {/* Numeric fields in a compact grid */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <IntField label="Importance" value={sysRank} onChange={setSysRank} />
                  <IntField label="Planet Index" value={planetIndex} onChange={setPlanetIndex} />
                  <IntField label="Cur Population" value={curPop} onChange={setCurPop} />
                  <IntField label="Survey" value={survey} onChange={setSurvey} />
                  <FloatField label="Resources" value={resources} onChange={setResources} />
                  <IntField label="Base Condition" value={condition} onChange={setCondition} />
                  <IntField label="Morale" value={morale} onChange={setMorale} />
                  <IntField label="Max Ground Def" value={maxGD} onChange={setMaxGD} />
                  <IntField label="Cur Ground Def" value={curGD} onChange={setCurGD} />
                </div>

                {/* Location (read-only) */}
                <div className="text-[10px] text-muted-foreground">
                  Location: ({hex.x}, {hex.y})
                </div>

                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="text-xs" onClick={handleSave}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs text-destructive" onClick={() => onRemoveSystem(hex.hex_id)}>
                    Remove
                  </Button>
                </div>

                {/* Facilities */}
                {facilityTypes.length > 0 && (
                  <div className="border-t border-border pt-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Facilities</p>
                    <div className="space-y-1">
                      {facilityTypes.map((ft) => {
                        const existing = (system.facilities || []).find((f) => f.facility_type_id === ft.facility_type_id);
                        return (
                          <div key={ft.facility_type_id} className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={!!existing}
                              onChange={() => toggleFacility(ft.facility_type_id)}
                              className="h-3 w-3"
                            />
                            <span className="text-sm">{ft.icon}</span>
                            <span className="text-xs flex-1 truncate">{ft.name}</span>
                            {existing && (
                              <Input
                                type="number"
                                value={existing.quantity}
                                onChange={(e) => updateFacilityQty(ft.facility_type_id, parseInt(e.target.value) || 1)}
                                className="h-6 w-12 text-xs text-center p-0"
                                min={1}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Input value={sysName} onChange={(e) => setSysName(e.target.value)} placeholder="System name" className="h-8 text-xs" />
                <Input type="number" value={sysRank} onChange={(e) => setSysRank(parseInt(e.target.value) || 1)} placeholder="Importance rank" className="h-8 text-xs" />
                <Button size="sm" variant="outline" className="text-xs" onClick={() => onAddSystem(hex.hex_id, sysName || "New System", sysRank)}>
                  Add System
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

function IntField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground">{label}</label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="h-7 text-xs"
      />
    </div>
  );
}

function FloatField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground">{label}</label>
      <Input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-7 text-xs"
      />
    </div>
  );
}

export default RightPanel;
