import React, { useState, useCallback } from "react";
import HexMapCanvas from "./HexMapCanvas";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import {
  MapState,
  EditorState,
  EditorTool,
  BrushSize,
  HexClassification,
  HexData,
  hexKey,
} from "@/lib/mapTypes";
import {
  loadMapFromFile,
  updateHexClassification,
  updateHexSystem,
  addSystem,
  updateSystem,
  removeSystem,
  exportDatabase,
  getProvinceStats,
  readMapStateFromDb,
} from "@/lib/mapDatabase";
import { floodFill } from "@/lib/hexUtils";
import { useToast } from "@/hooks/use-toast";

const HexMapEditor: React.FC = () => {
  const { toast } = useToast();
  const [db, setDb] = useState<any>(null);
  const [mapState, setMapState] = useState<MapState>({
    mapData: null,
    hexes: new Map(),
    systems: new Map(),
    regions: [],
  });
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

  const handleImport = useCallback(async (file: File) => {
    console.log("[MapEditor] Import started, file:", file.name, file.size, "bytes");
    try {
      const result = await loadMapFromFile(file);
      console.log("[MapEditor] Load complete. mapData:", result.state.mapData, "hexes:", result.state.hexes.size, "systems:", result.state.systems.size);
      setDb(result.db);
      setMapState(result.state);
      toast({ title: "Map loaded", description: `${result.state.hexes.size} hexes loaded` });
    } catch (err: any) {
      console.error("[MapEditor] Import error:", err);
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const handleExport = useCallback(() => {
    if (!db) return;
    const data = exportDatabase(db);
    const blob = new Blob([data.buffer as ArrayBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "map_export.sqlite";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported" });
  }, [db, toast]);

  const refreshState = useCallback(() => {
    if (!db) return;
    setMapState(readMapState(db));
  }, [db]);

  const applyClassificationToHex = useCallback(
    (hex: HexData, classification: HexClassification) => {
      if (!db) return;
      updateHexClassification(db, hex.hex_id, classification, hex.region_id);
      if (classification === "MARCHES" && hex.has_system) {
        removeSystem(db, hex.hex_id);
      }
      // Update local state efficiently
      setMapState((prev) => {
        const newHexes = new Map(prev.hexes);
        const updated = { ...hex, classification };
        if (classification === "MARCHES") {
          updated.has_system = false;
        }
        newHexes.set(hexKey(hex.x, hex.y), updated);

        const newSystems = new Map(prev.systems);
        if (classification === "MARCHES") {
          newSystems.delete(hex.hex_id);
        }

        return { ...prev, hexes: newHexes, systems: newSystems };
      });
    },
    [db]
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
      affected.forEach((h) => applyClassificationToHex(h, editorState.paintClassification));
    },
    [applyClassificationToHex, editorState.paintClassification, mapState.hexes]
  );

  const handleClassificationChange = useCallback(
    (hexId: number, c: HexClassification) => {
      if (!db || !selectedHex) return;
      applyClassificationToHex(selectedHex, c);
    },
    [db, selectedHex, applyClassificationToHex]
  );

  const handleAddSystem = useCallback(
    (hexId: number, name: string, rank: number) => {
      if (!db || !mapState.mapData) return;
      addSystem(db, mapState.mapData.map_id, hexId, name, "", rank);
      refreshState();
    },
    [db, mapState.mapData, refreshState]
  );

  const handleUpdateSystem = useCallback(
    (hexId: number, name: string, rank: number) => {
      if (!db) return;
      updateSystem(db, hexId, name, rank);
      refreshState();
    },
    [db, refreshState]
  );

  const handleRemoveSystem = useCallback(
    (hexId: number) => {
      if (!db) return;
      removeSystem(db, hexId);
      refreshState();
    },
    [db, refreshState]
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

  const stats = getProvinceStats(mapState);

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full">
      <LeftPanel
        hasMap={!!mapState.mapData}
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
      <div className="flex-1">
        {mapState.mapData ? (
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
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">No Map Loaded</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Import a SQLite database to begin editing
              </p>
            </div>
          </div>
        )}
      </div>
      <RightPanel
        hex={selectedHex}
        system={selectedSystem}
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
