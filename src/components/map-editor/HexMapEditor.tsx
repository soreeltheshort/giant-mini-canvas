import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import HexMapCanvas from "./HexMapCanvas";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import PlanetsPanel from "./PlanetsPanel";
import {
  MapState,
  EditorState,
  EditorTool,
  BrushSize,
  HexClassification,
  HexData,
  SystemData,
  FacilityType,
  hexKey,
} from "@/lib/mapTypes";
import {
  generateBlankMap,
  exportToSqlite,
  importFromSqlite,
  getProvinceStats,
} from "@/lib/mapDatabase";
import { floodFill } from "@/lib/hexUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFacilityTypes } from "@/hooks/useFacilityTypes";
import { useFactions } from "@/hooks/useFactions";
import { randomizeSystems, loadRandomizeParams } from "@/lib/randomizeSystems";

const HexMapEditor: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { facilityTypes: dbFacilityTypes } = useFacilityTypes();
  const { factions } = useFactions();
  const [mapState, setMapState] = useState<MapState>(() => generateBlankMap());
  const [saving, setSaving] = useState(false);
  const [loadingMap, setLoadingMap] = useState(true);
  const [leftTab, setLeftTab] = useState<"editor" | "planets">("editor");
  const [editorState, setEditorState] = useState<EditorState>({
    tool: "select",
    brushSize: 1,
    paintClassification: "CORE",
    selectedHexKey: null,
    hoveredHexKey: null,
    showBorders: true,
    showSystems: true,
    showCoordinates: false,
    highlightClassification: null,
  });

  // Convert DB facility types to the format used by components
  const facilityTypesForUI: FacilityType[] = useMemo(() =>
    dbFacilityTypes.map((ft) => ({
      facility_type_id: parseInt(ft.id.replace(/-/g, "").slice(0, 8), 16) || Date.now(),
      name: ft.name,
      description: ft.description,
      icon: ft.icon,
      db_id: ft.id,
    })),
    [dbFacilityTypes]
  );

  // Auto-load most recent saved map on mount
  useEffect(() => {
    if (!user) { setLoadingMap(false); return; }
    (async () => {
      try {
        const { data: savedMaps, error } = await supabase
          .from("saved_maps")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        if (!savedMaps || savedMaps.length === 0) { setLoadingMap(false); return; }

        const latest = savedMaps[0];
        const { data: fileData, error: dlError } = await supabase.storage
          .from("map-files")
          .download(latest.file_path);
        if (dlError) throw dlError;
        if (fileData) {
          const file = new File([fileData], "map.sqlite");
          const state = await importFromSqlite(file);
          setMapState(state);
          toast({ title: "Map loaded", description: `Loaded "${latest.name}"` });
        }
      } catch (err: any) {
        console.error("[Auto-load map]", err);
      } finally {
        setLoadingMap(false);
      }
    })();
  }, [user]);

  const handleSave = useCallback(async () => {
    if (!user) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      toast({ title: "Saving..." });
      const blob = await exportToSqlite(mapState);
      const fileName = `${user.id}/${Date.now()}.sqlite`;

      const { error: uploadError } = await supabase.storage
        .from("map-files")
        .upload(fileName, blob, { contentType: "application/x-sqlite3", upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("saved_maps")
        .insert({ user_id: user.id, name: "Third Republic Map", file_path: fileName });
      if (insertError) throw insertError;

      toast({ title: "Map saved successfully" });
    } catch (err: any) {
      console.error("[Save]", err);
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [mapState, user, toast]);

  const selectedHex = editorState.selectedHexKey
    ? mapState.hexes.get(editorState.selectedHexKey) || null
    : null;
  const selectedSystem = selectedHex
    ? mapState.systems.get(selectedHex.hex_id)
    : undefined;

  const handleExport = useCallback(async () => {
    try {
      toast({ title: "Exporting...", description: "Building SQLite database" });
      const blob = await exportToSqlite(mapState);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "third_republic_hex_map.sqlite";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported successfully" });
    } catch (err: any) {
      console.error("[Export]", err);
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  }, [mapState, toast]);

  const handleImport = useCallback(async (file: File) => {
    try {
      toast({ title: "Importing...", description: "Reading SQLite database" });
      const state = await importFromSqlite(file);
      setMapState(state);
      toast({ title: "Map imported", description: `${state.hexes.size} hexes loaded` });
    } catch (err: any) {
      console.error("[Import]", err);
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const applyClassificationToHex = useCallback(
    (hex: HexData, classification: HexClassification) => {
      setMapState((prev) => {
        const newHexes = new Map(prev.hexes);
        const updated = { ...hex, classification };
        newHexes.set(hexKey(hex.x, hex.y), updated);
        const newSystems = new Map(prev.systems);
        return { ...prev, hexes: newHexes, systems: newSystems };
      });
    },
    []
  );

  const handleHexClick = useCallback(
    (hex: HexData) => {
      setEditorState((s) => ({ ...s, selectedHexKey: hexKey(hex.x, hex.y) }));
    },
    []
  );

  const handlePaintHex = useCallback(
    (hex: HexData) => {
      applyClassificationToHex(hex, editorState.paintClassification);
    },
    [applyClassificationToHex, editorState.paintClassification]
  );

  const handleBrushPaint = useCallback(
    (hexes: HexData[]) => {
      hexes.forEach((h) => applyClassificationToHex(h, editorState.paintClassification));
    },
    [applyClassificationToHex, editorState.paintClassification]
  );

  const handleFloodFill = useCallback(
    (hex: HexData) => {
      const affected = floodFill(hex.x, hex.y, hex.classification, mapState.hexes);
      setMapState((prev) => {
        const newHexes = new Map(prev.hexes);
        const newSystems = new Map(prev.systems);
        for (const h of affected) {
          const updated = { ...h, classification: editorState.paintClassification };
          newHexes.set(hexKey(h.x, h.y), updated);
        }
        return { ...prev, hexes: newHexes, systems: newSystems };
      });
    },
    [editorState.paintClassification, mapState.hexes]
  );

  const handleClassificationChange = useCallback(
    (_hexId: number, c: HexClassification) => {
      if (!selectedHex) return;
      applyClassificationToHex(selectedHex, c);
    },
    [selectedHex, applyClassificationToHex]
  );

  const handleAddSystem = useCallback(
    (hexId: number, name: string, rank: number) => {
      setMapState((prev) => {
        const hex = Array.from(prev.hexes.values()).find((h) => h.hex_id === hexId);
        if (!hex) return prev;
        const newHexes = new Map(prev.hexes);
        newHexes.set(hexKey(hex.x, hex.y), { ...hex, has_system: true });
        const newSystems = new Map(prev.systems);
        newSystems.set(hexId, {
          system_id: Date.now(),
          map_id: 1,
          hex_id: hexId,
          system_name: name,
          classification: hex.classification,
          importance_rank: rank,
          owner: "",
          system_type: "system",
          max_population: 0,
          current_population: 0,
          survey: 0,
          tribute: 0,
          upkeep: 0,
          resources: 0,
          facilities: [],
          facilities_in_production: [],
          condition: 0,
          morale: 0,
          max_ground_defenses: 0,
          current_ground_defenses: 0,
          initial_condition: 40,
          planet_index: 0,
        });
        return { ...prev, hexes: newHexes, systems: newSystems };
      });
    },
    []
  );

  const handleUpdateSystem = useCallback(
    (hexId: number, updates: Partial<Omit<SystemData, "system_id" | "map_id" | "hex_id">>) => {
      setMapState((prev) => {
        const newSystems = new Map(prev.systems);
        const existing = newSystems.get(hexId);
        if (existing) {
          newSystems.set(hexId, { ...existing, ...updates });
        }
        return { ...prev, systems: newSystems };
      });
    },
    []
  );

  const handleRemoveSystem = useCallback(
    (hexId: number) => {
      setMapState((prev) => {
        const hex = Array.from(prev.hexes.values()).find((h) => h.hex_id === hexId);
        if (!hex) return prev;
        const newHexes = new Map(prev.hexes);
        newHexes.set(hexKey(hex.x, hex.y), { ...hex, has_system: false });
        const newSystems = new Map(prev.systems);
        newSystems.delete(hexId);
        return { ...prev, hexes: newHexes, systems: newSystems };
      });
    },
    []
  );

  const handleSearchCoords = useCallback(
    (x: number, y: number) => {
      const key = hexKey(x, y);
      if (mapState.hexes.has(key)) {
        setEditorState((s) => ({ ...s, selectedHexKey: key }));
      } else {
        toast({ title: "Not found", description: `No hex at (${x}, ${y})`, variant: "destructive" });
      }
    },
    [mapState.hexes, toast]
  );

  // Randomize state
  const [preRandomizeState, setPreRandomizeState] = useState<MapState | null>(null);
  const [randomizedCount, setRandomizedCount] = useState(0);

  const handleRandomize = useCallback(() => {
    const params = loadRandomizeParams();
    // Deep-copy current state so undo has a clean snapshot
    const snapshot: MapState = {
      ...mapState,
      hexes: new Map(Array.from(mapState.hexes.entries()).map(([k, v]) => [k, { ...v }])),
      systems: new Map(Array.from(mapState.systems.entries()).map(([k, v]) => [k, { ...v, facilities: [...(v.facilities || [])] }])),
    };
    setPreRandomizeState(snapshot);
    const newState = randomizeSystems(snapshot, params);
    const addedCount = newState.systems.size - snapshot.systems.size;
    setMapState(newState);
    setRandomizedCount(addedCount);
    toast({ title: "Randomized", description: `Added ${addedCount} systems` });
  }, [mapState, toast]);

  const handleUndoRandomize = useCallback(() => {
    if (!preRandomizeState) return;
    setMapState(preRandomizeState);
    setPreRandomizeState(null);
    setRandomizedCount(0);
    toast({ title: "Undone", description: "Randomized systems removed" });
  }, [preRandomizeState, toast]);

  const handleReRandomize = useCallback(() => {
    if (!preRandomizeState) return;
    const params = loadRandomizeParams();
    const newState = randomizeSystems(preRandomizeState, params);
    const addedCount = newState.systems.size - preRandomizeState.systems.size;
    setMapState(newState);
    setRandomizedCount(addedCount);
    toast({ title: "Re-randomized", description: `Added ${addedCount} systems` });
  }, [preRandomizeState, toast]);

  const stats = useMemo(() => getProvinceStats(mapState), [mapState]);

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full">
      <div className="flex h-full w-64 flex-col border-r border-border bg-background">
        {/* Tab buttons */}
        <div className="flex border-b border-border">
          {(["editor", "planets"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setLeftTab(tab)}
              className={`flex-1 px-2 py-2 text-xs font-medium capitalize transition-colors ${
                leftTab === tab ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {leftTab === "planets" ? (
          <PlanetsPanel
            systems={mapState.systems}
            hexes={mapState.hexes}
            facilityTypes={facilityTypesForUI}
            onSelectSystem={(hexId) => {
              const hex = Array.from(mapState.hexes.values()).find((h) => h.hex_id === hexId);
              if (hex) setEditorState((s) => ({ ...s, selectedHexKey: hexKey(hex.x, hex.y) }));
            }}
          />
        ) : (
          <LeftPanel
            hasMap={true}
            editorState={editorState}
            onImport={handleImport}
            onExport={handleExport}
            onSave={handleSave}
            saving={saving}
            loadingMap={loadingMap}
            onToolChange={(t) => setEditorState((s) => ({ ...s, tool: t }))}
            onBrushSizeChange={(sz) => setEditorState((s) => ({ ...s, brushSize: sz }))}
            onPaintClassChange={(c) => setEditorState((s) => ({ ...s, paintClassification: c }))}
            onToggleBorders={() => setEditorState((s) => ({ ...s, showBorders: !s.showBorders }))}
            onToggleSystems={() => setEditorState((s) => ({ ...s, showSystems: !s.showSystems }))}
            onToggleCoordinates={() => setEditorState((s) => ({ ...s, showCoordinates: !s.showCoordinates }))}
            onHighlightChange={(c) => setEditorState((s) => ({ ...s, highlightClassification: c }))}
            provinceStats={stats}
            onRandomize={handleRandomize}
            onUndoRandomize={handleUndoRandomize}
            onReRandomize={handleReRandomize}
            canUndoRandomize={!!preRandomizeState}
            randomizedCount={randomizedCount}
          />
        )}
      </div>
      <div className="flex-1">
        <HexMapCanvas
          hexes={mapState.hexes}
          systems={mapState.systems}
          editorState={editorState}
          onHexClick={handleHexClick}
          onHexHover={(key) => setEditorState((s) => ({ ...s, hoveredHexKey: key }))}
          onPaintHex={handlePaintHex}
          onBrushPaint={handleBrushPaint}
          onFloodFill={handleFloodFill}
        />
      </div>
      <RightPanel
        hex={selectedHex}
        system={selectedSystem}
        facilityTypes={facilityTypesForUI}
        factions={factions}
        onClassificationChange={handleClassificationChange}
        onAddSystem={handleAddSystem}
        onUpdateSystem={handleUpdateSystem}
        onRemoveSystem={handleRemoveSystem}
        onSearchCoords={handleSearchCoords}
      />
    </div>
  );
};

export default HexMapEditor;
