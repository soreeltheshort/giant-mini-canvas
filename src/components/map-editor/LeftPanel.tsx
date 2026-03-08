import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  EditorState,
  EditorTool,
  BrushSize,
  HexClassification,
  ALL_CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_COLORS,
} from "@/lib/mapTypes";

interface Props {
  hasMap: boolean;
  editorState: EditorState;
  onImport: (file: File) => void;
  onExport: () => void;
  onToolChange: (tool: EditorTool) => void;
  onBrushSizeChange: (size: BrushSize) => void;
  onPaintClassChange: (c: HexClassification) => void;
  onToggleBorders: () => void;
  onToggleSystems: () => void;
  onToggleCoordinates: () => void;
  onHighlightChange: (c: HexClassification | "ALL" | null) => void;
  provinceStats: Record<string, { hexCount: number; systemCount: number }>;
}

const LeftPanel: React.FC<Props> = ({
  hasMap,
  editorState,
  onImport,
  onExport,
  onToolChange,
  onBrushSizeChange,
  onPaintClassChange,
  onToggleBorders,
  onToggleSystems,
  onToggleCoordinates,
  onHighlightChange,
  provinceStats,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full w-64 flex-col gap-4 overflow-y-auto border-r border-border bg-background p-4">
      {/* Import / Export */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Database</h3>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
          }}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            Import
          </Button>
          <Button size="sm" variant="outline" onClick={onExport}>
            Export
          </Button>
        </div>
      </div>

      {/* Tools */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tools</h3>
        <div className="grid grid-cols-2 gap-1">
          {(["select", "paint", "fill", "brush"] as EditorTool[]).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={editorState.tool === t ? "default" : "outline"}
              onClick={() => onToolChange(t)}
              className="text-xs capitalize"
            >
              {t}
            </Button>
          ))}
        </div>
        {editorState.tool === "brush" && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground mb-1">Brush Size</p>
            <div className="flex gap-1">
              {([1, 7, 19] as BrushSize[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={editorState.brushSize === s ? "default" : "outline"}
                  onClick={() => onBrushSizeChange(s)}
                  className="text-xs"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Paint Classification */}
      {(editorState.tool === "paint" || editorState.tool === "fill" || editorState.tool === "brush") && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Paint Classification
          </h3>
          <div className="flex flex-col gap-1">
            {ALL_CLASSIFICATIONS.map((c) => (
              <button
                key={c}
                onClick={() => onPaintClassChange(c)}
                className={`flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${
                  editorState.paintClassification === c
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: CLASSIFICATION_COLORS[c] }}
                />
                {CLASSIFICATION_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Layers */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layers</h3>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input type="checkbox" checked={editorState.showBorders} onChange={onToggleBorders} />
            Province Borders
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input type="checkbox" checked={editorState.showSystems} onChange={onToggleSystems} />
            Solar Systems
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input type="checkbox" checked={editorState.showCoordinates} onChange={onToggleCoordinates} />
            Coordinates
          </label>
        </div>
      </div>

      {/* Highlights */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Highlight</h3>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onHighlightChange(null)}
            className={`text-left text-xs px-2 py-1 rounded ${!editorState.highlightClassification ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
          >
            None
          </button>
          <button
            onClick={() => onHighlightChange("ALL")}
            className={`text-left text-xs px-2 py-1 rounded ${editorState.highlightClassification === "ALL" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
          >
            All Provinces
          </button>
          {ALL_CLASSIFICATIONS.map((c) => (
            <button
              key={c}
              onClick={() => onHighlightChange(c)}
              className={`flex items-center gap-2 text-left text-xs px-2 py-1 rounded ${editorState.highlightClassification === c ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
            >
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: CLASSIFICATION_COLORS[c] }} />
              {CLASSIFICATION_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {/* Province Stats */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statistics</h3>
        <div className="space-y-1">
          {ALL_CLASSIFICATIONS.map((c) => {
            const s = provinceStats[c];
            if (!s) return null;
            return (
              <div key={c} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: CLASSIFICATION_COLORS[c] }} />
                  {CLASSIFICATION_LABELS[c]}
                </span>
                <span className="text-muted-foreground">{s.hexCount}h / {s.systemCount}s</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LeftPanel;
