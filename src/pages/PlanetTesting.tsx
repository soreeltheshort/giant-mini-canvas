import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { useFacilityTypes, DbFacilityType } from "@/hooks/useFacilityTypes";
import { useFactions } from "@/hooks/useFactions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SystemData,
  SystemType,
  FacilityInProduction,
  HexClassification,
  ALL_CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
} from "@/lib/mapTypes";
import { importFromSqlite } from "@/lib/mapDatabase";
import { processNextTurn, TurnConstants, DEFAULT_TURN_CONSTANTS, ShipTypeForUpkeep } from "@/lib/turnEngine";

const DEFAULT_PLANET: SystemData = {
  system_id: 0,
  map_id: 1,
  hex_id: 0,
  system_name: "New Planet",
  classification: "CORE",
  importance_rank: 0,
  owner: "",
  system_type: "system",
  max_population: 100,
  current_population: 0,
  survey: 0,
  tribute: 0,
  upkeep: 0,
  resources: 0,
  facilities: [],
  facilities_in_production: [],
  condition: 40,
  morale: 100,
  max_ground_defenses: 0,
  current_ground_defenses: 0,
  initial_condition: 40,
  planet_index: 1,
  stationed_fighters: [],
  stationed_gunships: [],
};

const INITIAL_FIELDS: { key: keyof SystemData; label: string }[] = [
  { key: "initial_condition", label: "Initial Condition" },
  { key: "max_population", label: "Max Population" },
  { key: "max_ground_defenses", label: "Max Ground Defenses" },
  { key: "importance_rank", label: "Importance Rank" },
  { key: "planet_index", label: "Planet Index" },
];

const CURRENT_FIELDS: { key: keyof SystemData; label: string }[] = [
  { key: "current_population", label: "Current Population" },
  { key: "current_ground_defenses", label: "Current Ground Defenses" },
  { key: "survey", label: "Survey" },
  { key: "tribute", label: "Tribute" },
  { key: "upkeep", label: "Upkeep" },
  { key: "resources", label: "Resources" },
  { key: "morale", label: "Morale" },
];

const PlanetTesting = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { facilityTypes } = useFacilityTypes();
  const { factions } = useFactions();

  const [planet, setPlanet] = useState<SystemData>({ ...DEFAULT_PLANET });
  const [turn, setTurn] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [turnConstants, setTurnConstants] = useState<TurnConstants>(DEFAULT_TURN_CONSTANTS);
  const [lastTurnResult, setLastTurnResult] = useState<ReturnType<typeof processNextTurn> | null>(null);

  // Load turn constants from DB
  useEffect(() => {
    const loadConstants = async () => {
      const { data } = await supabase.from("combat_constants").select("key, value");
      if (data) {
        const map: Record<string, number> = {};
        for (const row of data) map[row.key] = Number(row.value);
        setTurnConstants({
          pop_and_resource_tribute: map.pop_and_resource_tribute ?? DEFAULT_TURN_CONSTANTS.pop_and_resource_tribute,
          pop_or_resources_tribute: map.pop_or_resources_tribute ?? DEFAULT_TURN_CONSTANTS.pop_or_resources_tribute,
          ground_force_replacement_cost: map.ground_force_replacement_cost ?? DEFAULT_TURN_CONSTANTS.ground_force_replacement_cost,
        });
      }
    };
    loadConstants();
  }, []);

  // Load strikecraft ship types (FH, FL, GS)
  const [strikecraftTypes, setStrikecraftTypes] = useState<ShipTypeForUpkeep[]>([]);
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("ship_types")
        .select("id, name, class, maintenance")
        .in("class", ["FH", "FL", "GS"])
        .order("class")
        .order("name");
      if (data) setStrikecraftTypes(data);
    };
    load();
  }, []);

  const fighterTypes = useMemo(() => strikecraftTypes.filter((s) => s.class === "FH" || s.class === "FL"), [strikecraftTypes]);
  const gunshipTypes = useMemo(() => strikecraftTypes.filter((s) => s.class === "GS"), [strikecraftTypes]);

  const [availablePlanets, setAvailablePlanets] = useState<SystemData[]>([]);
  const [loadingPlanets, setLoadingPlanets] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, user, navigate]);

  // Calculate condition = initial_condition + sum of facility condition_bonus
  const calculatedCondition = useMemo(() => {
    let bonus = 0;
    for (const f of planet.facilities || []) {
      const ft = facilityTypes.find(
        (t) => String(t.id) === String(f.facility_type_id) || Number(t.id) === f.facility_type_id
      );
      if (ft && ft.condition_bonus) {
        bonus += ft.condition_bonus * f.quantity;
      }
    }
    return planet.initial_condition + bonus;
  }, [planet.initial_condition, planet.facilities, facilityTypes]);

  // Keep planet.condition in sync with the calculated value
  useEffect(() => {
    if (planet.condition !== calculatedCondition) {
      setPlanet((p) => ({ ...p, condition: calculatedCondition }));
    }
  }, [calculatedCondition]);

  const loadPlanetsFromMap = useCallback(async () => {
    if (!user) return;
    setLoadingPlanets(true);
    try {
      const { data: maps, error } = await supabase
        .from("saved_maps")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      if (!maps || maps.length === 0) {
        toast({ title: "No saved maps found", variant: "destructive" });
        setLoadingPlanets(false);
        return;
      }
      const map = maps[0];
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("map-files")
        .download(map.file_path);
      if (dlErr) throw dlErr;
      const file = new File([fileData], "map.sqlite");
      const state = await importFromSqlite(file);
      const planets = Array.from(state.systems.values());
      planets.sort((a, b) => a.system_name.localeCompare(b.system_name));
      setAvailablePlanets(planets);
      setShowLoadDialog(true);
    } catch (err: any) {
      toast({ title: "Failed to load map", description: err.message, variant: "destructive" });
    }
    setLoadingPlanets(false);
  }, [user, toast]);

  const selectPlanet = (sys: SystemData) => {
    setPlanet({ ...sys });
    setShowLoadDialog(false);
    setDirty(false);
    setTurn(0);
    setTotalIncome(0);
    setLastTurnResult(null);
  };

  const createNewPlanet = () => {
    setPlanet({ ...DEFAULT_PLANET });
    setDirty(false);
    setTurn(0);
    setTotalIncome(0);
    setLastTurnResult(null);
  };

  const updateField = <K extends keyof SystemData>(key: K, value: SystemData[K]) => {
    setPlanet((p) => ({ ...p, [key]: value }));
    setDirty(true);
  };

  const updateFacilityQty = (facilityTypeId: string, qty: number) => {
    setPlanet((p) => {
      const facs = [...(p.facilities || [])];
      const idx = facs.findIndex((f) => f.facility_type_id === facilityTypeId);
      if (qty <= 0) {
        if (idx >= 0) facs.splice(idx, 1);
      } else {
        if (idx >= 0) facs[idx] = { ...facs[idx], quantity: qty };
        else facs.push({ facility_type_id: facilityTypeId, quantity: qty });
      }
      return { ...p, facilities: facs };
    });
    setDirty(true);
  };

  const addToProduction = (facilityTypeId: number) => {
    const ft = facilityTypes.find((t) => Number(t.id) === facilityTypeId || t.id === String(facilityTypeId));
    const turnsNeeded = ft?.turns_to_build || 1;
    const cost = ft?.cost || 0;
    setPlanet((p) => ({
      ...p,
      facilities_in_production: [
        ...(p.facilities_in_production || []),
        { facility_type_id: facilityTypeId, turns_remaining: turnsNeeded },
      ],
    }));
    // Step 0: Deduct construction cost from income
    setTotalIncome((prev) => prev - cost);
    setDirty(true);
  };

  const removeProduction = (index: number) => {
    setPlanet((p) => ({
      ...p,
      facilities_in_production: (p.facilities_in_production || []).filter((_, i) => i !== index),
    }));
    setDirty(true);
  };

  const updateStrikecraft = (
    field: "stationed_fighters" | "stationed_gunships",
    shipTypeId: string,
    qty: number
  ) => {
    setPlanet((p) => {
      const list = [...(p[field] || [])];
      const idx = list.findIndex((s) => s.ship_type_id === shipTypeId);
      if (qty <= 0) {
        if (idx >= 0) list.splice(idx, 1);
      } else {
        if (idx >= 0) list[idx] = { ...list[idx], quantity: qty };
        else list.push({ ship_type_id: shipTypeId, quantity: qty });
      }
      return { ...p, [field]: list };
    });
    setDirty(true);
  };

  const handleSave = () => {
    const saved = JSON.parse(localStorage.getItem("planet_testing_saves") || "[]");
    const existing = saved.findIndex((s: any) => s.system_name === planet.system_name);
    if (existing >= 0) saved[existing] = { ...planet, turn };
    else saved.push({ ...planet, turn });
    localStorage.setItem("planet_testing_saves", JSON.stringify(saved));
    setDirty(false);
    toast({ title: "Planet saved" });
  };

  const handleNextTurn = () => {
    const result = processNextTurn(planet, facilityTypes, turnConstants, totalIncome, strikecraftTypes);
    setPlanet(result.planet);
    setTotalIncome(result.income);
    setLastTurnResult(result);
    setTurn((t) => t + 1);
    setDirty(true);

    if (result.completedFacilities.length > 0) {
      toast({ title: `Completed: ${result.completedFacilities.join(", ")}` });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-20 text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="flex-1 container py-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-bold text-foreground">Planet Testing</h1>
            <span className="text-sm font-medium text-muted-foreground bg-accent px-2 py-0.5 rounded">
              Turn {turn}
            </span>
            <span className="text-sm font-medium text-muted-foreground bg-accent px-2 py-0.5 rounded">
              Income: {totalIncome}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={createNewPlanet}>
              + New Planet
            </Button>
            <Button variant="outline" size="sm" onClick={loadPlanetsFromMap} disabled={loadingPlanets}>
              {loadingPlanets ? "Loading..." : "Load from Map"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleSave} disabled={!dirty}>
              💾 Save
            </Button>
            <Button size="sm" onClick={handleNextTurn} className="bg-gold text-secondary-foreground hover:bg-gold/90">
              Next Turn →
            </Button>
          </div>
        </div>

        {/* Load from map dialog */}
        {showLoadDialog && (
          <div className="mb-6 border border-border rounded p-4 bg-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Select a Planet from Map</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowLoadDialog(false)}>✕</Button>
            </div>
            {availablePlanets.length === 0 ? (
              <p className="text-xs text-muted-foreground">No planets found in the map.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                {availablePlanets.map((sys) => (
                  <button
                    key={sys.hex_id}
                    onClick={() => selectPlanet(sys)}
                    className="text-left border border-border rounded px-3 py-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="text-xs font-medium text-foreground truncate">{sys.system_name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {CLASSIFICATION_LABELS[sys.classification as HexClassification] || sys.classification}
                      {sys.owner && ` · ${sys.owner}`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Planet editor */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Identity + Simulated Events */}
          <div className="space-y-4">
            <div className="border border-border rounded p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identity</h3>
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <Input
                  value={planet.system_name}
                  onChange={(e) => updateField("system_name", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Classification</label>
                <select
                  value={planet.classification}
                  onChange={(e) => updateField("classification", e.target.value)}
                  className="w-full h-8 text-sm rounded border border-input bg-background px-2"
                >
                  {ALL_CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>{CLASSIFICATION_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <select
                  value={planet.system_type}
                  onChange={(e) => updateField("system_type", e.target.value as SystemType)}
                  className="w-full h-8 text-sm rounded border border-input bg-background px-2"
                >
                  <option value="system">System</option>
                  <option value="station">Station</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Owner</label>
                <select
                  value={planet.owner}
                  onChange={(e) => updateField("owner", e.target.value)}
                  className="w-full h-8 text-sm rounded border border-input bg-background px-2"
                >
                  <option value="">Unowned</option>
                  {factions.map((f) => (
                    <option key={f.id} value={f.name}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Simulated Events */}
            <div className="border border-border rounded p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Simulated Events</h3>
              <Button variant="outline" size="sm" className="w-full">
                ⚔️ Ground Battle
              </Button>
            </div>
          </div>

          {/* Middle: Stats */}
          <div className="space-y-4">
            {/* Current / Calculated Stats */}
            <div className="border border-border rounded p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Current Stats</h3>
              
              {/* Condition (calculated) */}
              <div className="mb-3 p-2 rounded bg-accent/30 border border-border">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-muted-foreground">Condition (calculated)</label>
                  <span className="text-xs font-semibold text-foreground">{calculatedCondition}</span>
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  Base {planet.initial_condition} + facility bonuses {calculatedCondition - planet.initial_condition}
                </div>
              </div>

              {/* Population side by side */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Current Population</label>
                  <Input
                    type="number"
                    value={planet.current_population}
                    onChange={(e) => updateField("current_population", Number(e.target.value))}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Max Population</label>
                  <Input
                    type="number"
                    value={planet.max_population}
                    onChange={(e) => updateField("max_population", Number(e.target.value))}
                    className="h-7 text-xs"
                  />
                </div>
              </div>

              {/* Ground defenses side by side */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Current Ground Def.</label>
                  <Input
                    type="number"
                    value={planet.current_ground_defenses}
                    onChange={(e) => updateField("current_ground_defenses", Number(e.target.value))}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Max Ground Def.</label>
                  <Input
                    type="number"
                    value={planet.max_ground_defenses}
                    onChange={(e) => updateField("max_ground_defenses", Number(e.target.value))}
                    className="h-7 text-xs"
                  />
                </div>
              </div>

              {/* Remaining current fields */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {CURRENT_FIELDS.filter(f => 
                  f.key !== "current_population" && f.key !== "current_ground_defenses"
                ).map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[10px] text-muted-foreground">{label}</label>
                    <Input
                      type="number"
                      value={planet[key] as number}
                      onChange={(e) => updateField(key, Number(e.target.value))}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Initial / Base Stats */}
            <div className="border border-border rounded p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Initial Stats</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {INITIAL_FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[10px] text-muted-foreground">{label}</label>
                    <Input
                      type="number"
                      value={planet[key] as number}
                      onChange={(e) => updateField(key, Number(e.target.value))}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Facilities */}
          <div className="space-y-4">
            <div className="border border-border rounded p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Built Facilities
              </h3>
              {facilityTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No facility types configured.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {facilityTypes.map((ft) => {
                    const current = planet.facilities?.find(
                      (f) => String(f.facility_type_id) === ft.id || f.facility_type_id === Number(ft.id)
                    );
                    const qty = current?.quantity || 0;
                    return (
                      <div key={ft.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground truncate flex-1">
                          {ft.icon} {ft.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0 text-xs"
                            onClick={() => updateFacilityQty(Number(ft.id) || (ft.id as any), Math.max(0, qty - 1))}
                          >
                            −
                          </Button>
                          <span className="text-xs w-6 text-center font-medium">{qty}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0 text-xs"
                            onClick={() => updateFacilityQty(Number(ft.id) || (ft.id as any), qty + 1)}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* In Production */}
            <div className="border border-border rounded p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                In Production
              </h3>
              {(planet.facilities_in_production || []).length === 0 ? (
                <p className="text-xs text-muted-foreground mb-2">Nothing under construction.</p>
              ) : (
                <div className="space-y-1.5 mb-2">
                  {(planet.facilities_in_production || []).map((fip, idx) => {
                    const ft = facilityTypes.find(
                      (t) => String(t.id) === String(fip.facility_type_id) || Number(t.id) === fip.facility_type_id
                    );
                    return (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground truncate flex-1">
                          {ft?.icon || "🏗️"} {ft?.name || `#${fip.facility_type_id}`}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">
                            {fip.turns_remaining} turn{fip.turns_remaining !== 1 ? "s" : ""} left
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-xs text-destructive hover:text-destructive"
                            onClick={() => removeProduction(idx)}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Add to production */}
              <div className="border-t border-border pt-2">
                <label className="text-[10px] text-muted-foreground mb-1 block">Start Construction</label>
                <select
                  className="w-full h-7 text-xs rounded border border-input bg-background px-2"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addToProduction(Number(e.target.value));
                  }}
                >
                  <option value="">Select facility...</option>
                  {facilityTypes.map((ft) => (
                    <option key={ft.id} value={ft.id}>
                      {ft.icon} {ft.name} ({ft.turns_to_build} turn{ft.turns_to_build !== 1 ? "s" : ""})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stationed Fighters */}
            <div className="border border-border rounded p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Stationed Fighters
              </h3>
              {fighterTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No fighter types in database.</p>
              ) : (
                <div className="space-y-1.5">
                  {fighterTypes.map((st) => {
                    const current = (planet.stationed_fighters || []).find((s) => s.ship_type_id === st.id);
                    const qty = current?.quantity || 0;
                    return (
                      <div key={st.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground truncate flex-1">
                          {st.name} <span className="text-muted-foreground">({st.class})</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground w-12 text-right">{st.maintenance}/ea</span>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                            onClick={() => updateStrikecraft("stationed_fighters", st.id, Math.max(0, qty - 1))}>−</Button>
                          <span className="text-xs w-6 text-center font-medium">{qty}</span>
                          <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                            onClick={() => updateStrikecraft("stationed_fighters", st.id, qty + 1)}>+</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Stationed Gunships */}
            <div className="border border-border rounded p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Stationed Gunships
              </h3>
              {gunshipTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No gunship types in database.</p>
              ) : (
                <div className="space-y-1.5">
                  {gunshipTypes.map((st) => {
                    const current = (planet.stationed_gunships || []).find((s) => s.ship_type_id === st.id);
                    const qty = current?.quantity || 0;
                    return (
                      <div key={st.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground truncate flex-1">
                          {st.name} <span className="text-muted-foreground">({st.class})</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground w-12 text-right">{st.maintenance}/ea</span>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                            onClick={() => updateStrikecraft("stationed_gunships", st.id, Math.max(0, qty - 1))}>−</Button>
                          <span className="text-xs w-6 text-center font-medium">{qty}</span>
                          <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs"
                            onClick={() => updateStrikecraft("stationed_gunships", st.id, qty + 1)}>+</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanetTesting;
