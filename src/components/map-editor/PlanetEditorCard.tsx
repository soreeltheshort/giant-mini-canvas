import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SystemData, SystemType, FacilityType, HexData } from "@/lib/mapTypes";
import { DbFaction } from "@/hooks/useFactions";
import { DbFacilityType } from "@/hooks/useFacilityTypes";
import { DEFAULT_TURN_CONSTANTS } from "@/lib/turnEngine";
import { X } from "lucide-react";

interface Props {
  system: SystemData;
  hex: HexData;
  factions: DbFaction[];
  facilityTypes: FacilityType[];
  dbFacilityTypes: DbFacilityType[];
  onUpdateSystem: (hexId: number, updates: Partial<Omit<SystemData, "system_id" | "map_id" | "hex_id">>) => void;
  onClose: () => void;
}

const PlanetEditorCard: React.FC<Props> = ({
  system,
  hex,
  factions,
  facilityTypes,
  dbFacilityTypes,
  onUpdateSystem,
  onClose,
}) => {
  const [sysName, setSysName] = useState(system.system_name);
  const [sysRank, setSysRank] = useState(system.importance_rank);
  const [sysOwner, setSysOwner] = useState(system.owner || "");
  const [sysType, setSysType] = useState<SystemType>(system.system_type || "system");
  const [curPop, setCurPop] = useState(system.current_population || 0);
  const [survey, setSurvey] = useState(system.survey || 0);
  const [upkeep, setUpkeep] = useState(system.upkeep || 0);
  const [resources, setResources] = useState(system.resources || 0);
  const [initialCondition, setInitialCondition] = useState(system.initial_condition || 0);
  const [morale, setMorale] = useState(system.morale || 0);
  const [maxGD, setMaxGD] = useState(system.max_ground_defenses || 0);
  const [curGD, setCurGD] = useState(system.current_ground_defenses || 0);

  useEffect(() => {
    setSysName(system.system_name);
    setSysRank(system.importance_rank);
    setSysOwner(system.owner || "");
    setSysType(system.system_type || "system");
    setCurPop(system.current_population || 0);
    setSurvey(system.survey || 0);
    setUpkeep(system.upkeep || 0);
    setResources(system.resources || 0);
    setInitialCondition(system.initial_condition || 0);
    setMorale(system.morale || 0);
    setMaxGD(system.max_ground_defenses || 0);
    setCurGD(system.current_ground_defenses || 0);
  }, [system.system_id]);

  const conditionBonus = (system.facilities || []).reduce((sum, f) => {
    const ft = dbFacilityTypes.find((t) => t.id === f.facility_type_id);
    return sum + (ft?.condition_bonus || 0) * f.quantity;
  }, 0);
  const calculatedCondition = initialCondition + conditionBonus;

  const handleSave = () => {
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
      initial_condition: initialCondition,
      morale: calculatedMorale,
      max_ground_defenses: maxGD,
      current_ground_defenses: curGD,
    });
  };

  const toggleFacility = (ftId: string) => {
    const existing = system.facilities || [];
    const has = existing.find((f) => f.facility_type_id === ftId);
    const updated = has
      ? existing.filter((f) => f.facility_type_id !== ftId)
      : [...existing, { facility_type_id: ftId, quantity: 1 }];
    onUpdateSystem(hex.hex_id, { facilities: updated });
  };

  const updateFacilityQty = (ftId: string, qty: number) => {
    const updated = (system.facilities || []).map((f) =>
      f.facility_type_id === ftId ? { ...f, quantity: Math.max(1, qty) } : f
    );
    onUpdateSystem(hex.hex_id, { facilities: updated });
  };

  return (
    <div className="rounded border-2 border-bronze bg-marble p-3 space-y-2 shadow-md">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-heading font-semibold uppercase tracking-wider text-foreground">
          Editing: {system.system_name}
        </h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <Input value={sysName} onChange={(e) => setSysName(e.target.value)} placeholder="System name" className="h-8 text-xs" />

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
          className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
        >
          <option value="">— None —</option>
          {factions.map((f) => {
            const code = f.code_name || f.name;
            return <option key={f.id} value={code}>{code}</option>;
          })}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        <IntField label="Importance" value={sysRank} onChange={setSysRank} />
        <div>
          <label className="text-[10px] text-muted-foreground">System ID</label>
          <div className="flex h-7 w-full items-center rounded-md border border-input bg-muted px-2 text-xs text-muted-foreground">
            {system.system_id}
          </div>
        </div>
        <IntField label="Cur Population" value={curPop} onChange={setCurPop} />
        <IntField label="Survey" value={survey} onChange={setSurvey} />
        <FloatField label="Resources" value={resources} onChange={setResources} />
        <IntField label="Initial Condition" value={initialCondition} onChange={setInitialCondition} />
        <div>
          <label className="text-[10px] text-muted-foreground">Condition (calc)</label>
          <div className="flex h-7 w-full items-center rounded-md border border-input bg-muted px-2 text-xs text-muted-foreground">
            {calculatedCondition}
          </div>
        </div>
        <IntField label="Morale" value={morale} onChange={setMorale} />
        <IntField label="Max Ground Def" value={maxGD} onChange={setMaxGD} />
        <IntField label="Cur Ground Def" value={curGD} onChange={setCurGD} />
        <IntField label="Upkeep" value={upkeep} onChange={setUpkeep} />
      </div>

      <div className="text-[10px] text-muted-foreground">
        Location: ({hex.x}, {hex.y}) — read-only
      </div>

      <Button size="sm" variant="outline" className="text-xs w-full" onClick={handleSave}>
        Save Changes
      </Button>

      {facilityTypes.length > 0 && (
        <div className="border-t border-border pt-2">
          <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Facilities</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
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

export default PlanetEditorCard;
