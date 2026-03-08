import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FacilityType } from "@/lib/mapTypes";

interface Props {
  facilityTypes: FacilityType[];
  onAdd: (name: string, description: string, icon: string) => void;
  onUpdate: (ft: FacilityType) => void;
  onRemove: (id: number) => void;
}

const FacilityConfigPanel: React.FC<Props> = ({ facilityTypes, onAdd, onUpdate, onRemove }) => {
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newIcon, setNewIcon] = useState("🏭");

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Facility Types
      </h3>

      {facilityTypes.length === 0 && (
        <p className="text-xs text-muted-foreground">No facility types defined yet.</p>
      )}

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {facilityTypes.map((ft) => (
          <div key={ft.facility_type_id} className="flex items-center gap-1 rounded border border-border p-1.5">
            <span className="text-sm">{ft.icon}</span>
            <div className="flex-1 min-w-0">
              <Input
                value={ft.name}
                onChange={(e) => onUpdate({ ...ft, name: e.target.value })}
                className="h-6 text-xs border-0 p-0 focus-visible:ring-0"
              />
              <Input
                value={ft.description}
                onChange={(e) => onUpdate({ ...ft, description: e.target.value })}
                className="h-5 text-[10px] text-muted-foreground border-0 p-0 focus-visible:ring-0"
                placeholder="Description"
              />
            </div>
            <Input
              value={ft.icon}
              onChange={(e) => onUpdate({ ...ft, icon: e.target.value })}
              className="h-6 w-10 text-center text-xs p-0"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-destructive text-xs"
              onClick={() => onRemove(ft.facility_type_id)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>

      {/* Add new */}
      <div className="space-y-1 border-t border-border pt-2">
        <div className="flex gap-1">
          <Input
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            className="h-7 w-10 text-center text-xs p-0"
            placeholder="🏭"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-7 text-xs flex-1"
            placeholder="Facility name"
          />
        </div>
        <Input
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          className="h-7 text-xs"
          placeholder="Description (optional)"
        />
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs h-7"
          disabled={!newName.trim()}
          onClick={() => {
            onAdd(newName.trim(), newDesc.trim(), newIcon || "🏭");
            setNewName("");
            setNewDesc("");
            setNewIcon("🏭");
          }}
        >
          Add Facility Type
        </Button>
      </div>
    </div>
  );
};

export default FacilityConfigPanel;
