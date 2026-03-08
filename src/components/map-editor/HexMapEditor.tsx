import React, { useState, useCallback, useMemo, useEffect } from "react";
import HexMapCanvas from "./HexMapCanvas";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import FacilityConfigPanel from "./FacilityConfigPanel";
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
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const HexMapEditor: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [mapState, setMapState] = useState<MapState>(() => generateBlankMap());
  const [saving, setSaving] = useState(false);
  const [loadingMap, setLoadingMap] = useState(true);
  const [leftTab, setLeftTab] = useState<"editor" | "config" | "planets">("editor");
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
        if (classification === "MARCHES" && hex.has_system) {
          updated.has_system = false;
        }
        newHexes.set(hexKey(hex.x, hex.y), updated);

        const newSystems = new Map(prev.systems);
        if (classification === "MARCHES" && hex.has_system) {
          newSystems.delete(hex.hex_id);
        }

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
          if (editorState.paintClassification === "MARCHES" && h.has_system) {
            updated.has_system = false;
            newSystems.delete(h.hex_id);
          }
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
        if (!hex || hex.classification === "MARCHES") return prev;

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
          facilities: [],
        });

        return { ...prev, hexes: newHexes, systems: newSystems };
      });
    },
    []
  );

  const handleUpdateSystem = useCallback(
    (hexId: number, updates: Partial<Pick<SystemData, "system_name" | "importance_rank" | "owner" | "facilities">>) => {
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

  // Facility type management
  const handleAddFacilityType = useCallback((name: string, description: string, icon: string) => {
    setMapState((prev) => ({
      ...prev,
      facilityTypes: [
        ...prev.facilityTypes,
        { facility_type_id: Date.now(), name, description, icon },
      ],
    }));
  }, []);

  const handleUpdateFacilityType = useCallback((ft: FacilityType) => {
    setMapState((prev) => ({
      ...prev,
      facilityTypes: prev.facilityTypes.map((f) =>
        f.facility_type_id === ft.facility_type_id ? ft : f
      ),
    }));
  }, []);

  const handleRemoveFacilityType = useCallback((id: number) => {
    setMapState((prev) => {
      // Also remove from all systems
      const newSystems = new Map(prev.systems);
      for (const [key, sys] of newSystems) {
        const filtered = (sys.facilities || []).filter((f) => f.facility_type_id !== id);
        if (filtered.length !== (sys.facilities || []).length) {
          newSystems.set(key, { ...sys, facilities: filtered });
        }
      }
      return {
        ...prev,
        facilityTypes: prev.facilityTypes.filter((f) => f.facility_type_id !== id),
        systems: newSystems,
      };
    });
  }, []);

  const stats = useMemo(() => getProvinceStats(mapState), [mapState]);

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full">
      <div className="flex h-full w-64 flex-col border-r border-border bg-background">
        {/* Tab buttons */}
        <div className="flex border-b border-border">
          {(["editor", "config", "planets"] as const).map((tab) => (
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

        {leftTab === "config" ? (
          <div className="flex-1 overflow-y-auto p-4">
            <FacilityConfigPanel
              facilityTypes={mapState.facilityTypes}
              onAdd={handleAddFacilityType}
              onUpdate={handleUpdateFacilityType}
              onRemove={handleRemoveFacilityType}
            />
          </div>
        ) : leftTab === "planets" ? (
          <PlanetsPanel
            systems={mapState.systems}
            hexes={mapState.hexes}
            facilityTypes={mapState.facilityTypes}
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
            onToolChange={(t) => setEditorState((s) => ({ ...s, tool: t }))}
            onBrushSizeChange={(sz) => setEditorState((s) => ({ ...s, brushSize: sz }))}
            onPaintClassChange={(c) => setEditorState((s) => ({ ...s, paintClassification: c }))}
            onToggleBorders={() => setEditorState((s) => ({ ...s, showBorders: !s.showBorders }))}
            onToggleSystems={() => setEditorState((s) => ({ ...s, showSystems: !s.showSystems }))}
            onToggleCoordinates={() => setEditorState((s) => ({ ...s, showCoordinates: !s.showCoordinates }))}
            onHighlightChange={(c) => setEditorState((s) => ({ ...s, highlightClassification: c }))}
            provinceStats={stats}
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
        facilityTypes={mapState.facilityTypes}
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
