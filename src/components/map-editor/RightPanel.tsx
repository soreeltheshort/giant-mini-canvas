import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HexData,
  SystemData,
  HexClassification,
  ALL_CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_COLORS,
} from "@/lib/mapTypes";

interface Props {
  hex: HexData | null;
  system: SystemData | undefined;
  onClassificationChange: (hexId: number, c: HexClassification) => void;
  onAddSystem: (hexId: number, name: string, rank: number) => void;
  onUpdateSystem: (hexId: number, name: string, rank: number) => void;
  onRemoveSystem: (hexId: number) => void;
  onSearchCoords: (x: number, y: number) => void;
}

const RightPanel: React.FC<Props> = ({
  hex,
  system,
  onClassificationChange,
  onAddSystem,
  onUpdateSystem,
  onRemoveSystem,
  onSearchCoords,
}) => {
  const [sysName, setSysName] = useState("");
  const [sysRank, setSysRank] = useState(1);
  const [searchX, setSearchX] = useState("");
  const [searchY, setSearchY] = useState("");

  useEffect(() => {
    if (system) {
      setSysName(system.system_name);
      setSysRank(system.importance_rank);
    } else {
      setSysName("");
      setSysRank(1);
    }
  }, [system, hex?.hex_id]);

  return (
    <div className="flex h-full w-64 flex-col gap-4 overflow-y-auto border-l border-border bg-background p-4">
      {/* Search */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Search Coordinates
        </h3>
        <div className="flex gap-1">
          <Input
            placeholder="X"
            value={searchX}
            onChange={(e) => setSearchX(e.target.value)}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Y"
            value={searchY}
            onChange={(e) => setSearchY(e.target.value)}
            className="h-8 text-xs"
          />
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
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Hex Inspector
            </h3>
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
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: CLASSIFICATION_COLORS[hex.classification] }}
                  />
                  {CLASSIFICATION_LABELS[hex.classification]}
                </span>
              </div>
            </div>
          </div>

          {/* Change Classification */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Set Classification
            </h3>
            <div className="flex flex-col gap-1">
              {ALL_CLASSIFICATIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => onClassificationChange(hex.hex_id, c)}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${
                    hex.classification === c
                      ? "bg-accent text-accent-foreground font-medium"
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

          {/* Solar System */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Solar System
            </h3>
            {hex.classification === "MARCHES" ? (
              <p className="text-xs text-destructive">Systems not allowed in Marches</p>
            ) : hex.has_system && system ? (
              <div className="space-y-2">
                <Input
                  value={sysName}
                  onChange={(e) => setSysName(e.target.value)}
                  placeholder="System name"
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  value={sysRank}
                  onChange={(e) => setSysRank(parseInt(e.target.value) || 1)}
                  placeholder="Importance rank"
                  className="h-8 text-xs"
                />
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => onUpdateSystem(hex.hex_id, sysName, sysRank)}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs text-destructive"
                    onClick={() => onRemoveSystem(hex.hex_id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  value={sysName}
                  onChange={(e) => setSysName(e.target.value)}
                  placeholder="System name"
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  value={sysRank}
                  onChange={(e) => setSysRank(parseInt(e.target.value) || 1)}
                  placeholder="Importance rank"
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => onAddSystem(hex.hex_id, sysName || "New System", sysRank)}
                >
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

export default RightPanel;
