import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { MapFleet, HexData, hexKey } from "@/lib/mapTypes";
import { CLASSIFICATION_LABELS, ALL_CLASSIFICATIONS } from "@/lib/mapTypes";
import { Plus, Trash2, MapPin, Anchor } from "lucide-react";

interface SavedFleet {
  id: string;
  name: string;
  owner_user_id: string;
  points_budget: number;
  readiness: number;
  standing_order: string;
}

interface Props {
  fleets: MapFleet[];
  selectedHexKey: string | null;
  hexes: Map<string, HexData>;
  onAddFleet: (fleet: MapFleet) => void;
  onRemoveFleet: (fleetId: string) => void;
  onUpdateFleet: (fleetId: string, updates: Partial<MapFleet>) => void;
  onSelectHex: (hexKey: string) => void;
}

const OWNER_OPTIONS = ALL_CLASSIFICATIONS.filter(c => c.startsWith("PROVINCE_") || c === "CORE");

const FleetsPanel: React.FC<Props> = ({
  fleets,
  selectedHexKey,
  hexes,
  onAddFleet,
  onRemoveFleet,
  onUpdateFleet,
  onSelectHex,
}) => {
  const [savedFleets, setSavedFleets] = useState<SavedFleet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSourceFleet, setSelectedSourceFleet] = useState("");
  const [fleetName, setFleetName] = useState("");
  const [ownerClassification, setOwnerClassification] = useState("PROVINCE_1");

  // Load saved fleets from combat testing
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("fleets")
        .select("id, name, owner_user_id, points_budget, readiness, standing_order")
        .order("name", { ascending: true });
      setSavedFleets(data || []);
      setLoading(false);
    })();
  }, []);

  const selectedHex = selectedHexKey ? hexes.get(selectedHexKey) : null;

  const handlePlaceFleet = () => {
    if (!selectedHex || !selectedSourceFleet) return;
    const sourceFleet = savedFleets.find(f => f.id === selectedSourceFleet);
    if (!sourceFleet) return;

    const newFleet: MapFleet = {
      fleet_id: `mf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fleet_name: fleetName || sourceFleet.name,
      owner_classification: ownerClassification,
      hex_x: selectedHex.x,
      hex_y: selectedHex.y,
      source_fleet_id: selectedSourceFleet,
    };

    onAddFleet(newFleet);
    setFleetName("");
    setSelectedSourceFleet("");
  };

  // Group fleets by owner
  const fleetsByOwner = useMemo(() => {
    const map = new Map<string, MapFleet[]>();
    for (const f of fleets) {
      const key = f.owner_classification || "unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }, [fleets]);

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-4">
        {/* Place Fleet Section */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Place Fleet
          </h3>

          {/* Fleet source dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase">Source Fleet</label>
            <select
              value={selectedSourceFleet}
              onChange={e => setSelectedSourceFleet(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
            >
              <option value="">Select a fleet...</option>
              {loading ? (
                <option disabled>Loading...</option>
              ) : (
                savedFleets.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.points_budget}pts)
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Fleet name override */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase">Fleet Name</label>
            <Input
              value={fleetName}
              onChange={e => setFleetName(e.target.value)}
              placeholder={savedFleets.find(f => f.id === selectedSourceFleet)?.name || "Fleet name"}
              className="h-7 text-xs"
            />
          </div>

          {/* Owner */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase">Owner</label>
            <select
              value={ownerClassification}
              onChange={e => setOwnerClassification(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
            >
              {OWNER_OPTIONS.map(c => (
                <option key={c} value={c}>
                  {CLASSIFICATION_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          {/* Placement hex */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase">
              Hex Position
            </label>
            <div className="text-xs text-foreground bg-muted/50 px-2 py-1.5 rounded border border-border">
              {selectedHex ? (
                <span>({selectedHex.x}, {selectedHex.y}) — {CLASSIFICATION_LABELS[selectedHex.classification] || selectedHex.classification}</span>
              ) : (
                <span className="text-muted-foreground italic">Select a hex on the map</span>
              )}
            </div>
          </div>

          <Button
            size="sm"
            className="w-full text-xs"
            disabled={!selectedHex || !selectedSourceFleet}
            onClick={handlePlaceFleet}
          >
            <Plus className="w-3 h-3 mr-1" />
            Place Fleet
          </Button>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Placed Fleets List */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Placed Fleets ({fleets.length})
          </h3>

          {fleets.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">No fleets placed on map</p>
          ) : (
            <div className="space-y-1.5">
              {Array.from(fleetsByOwner.entries()).map(([owner, ownerFleets]) => (
                <div key={owner} className="space-y-1">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {CLASSIFICATION_LABELS[owner as keyof typeof CLASSIFICATION_LABELS] || owner}
                  </div>
                  {ownerFleets.map(f => (
                    <div
                      key={f.fleet_id}
                      className="flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-1.5 text-xs group"
                    >
                      <Anchor className="w-3 h-3 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{f.fleet_name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          ({f.hex_x}, {f.hex_y})
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const key = hexKey(f.hex_x, f.hex_y);
                          onSelectHex(key);
                        }}
                        className="p-0.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Go to hex"
                      >
                        <MapPin className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onRemoveFleet(f.fleet_id)}
                        className="p-0.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove fleet"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
};

export default FleetsPanel;
