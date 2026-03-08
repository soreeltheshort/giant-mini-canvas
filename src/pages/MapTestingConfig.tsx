import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFacilityTypes } from "@/hooks/useFacilityTypes";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  ALL_CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_COLORS,
  HexClassification,
} from "@/lib/mapTypes";

const MapTestingConfig = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { facilityTypes, loading: ftLoading, addFacilityType, updateFacilityType, removeFacilityType } = useFacilityTypes();

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newIcon, setNewIcon] = useState("🏭");

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  if (loading || ftLoading) {
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
      <div className="container max-w-2xl py-8">
        <h1 className="text-xl font-semibold text-foreground mb-6">Map Testing Configuration</h1>

        {/* Facility Types */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Facility Types
          </h2>
          <p className="text-xs text-muted-foreground">
            Define the types of facilities that can be placed on planets. These are shared across all maps.
          </p>

          {facilityTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No facility types defined yet.</p>
          ) : (
            <div className="space-y-2">
              {facilityTypes.map((ft) => (
                <FacilityTypeRow
                  key={ft.id}
                  ft={ft}
                  isAdmin={isAdmin}
                  onUpdate={updateFacilityType}
                  onRemove={removeFacilityType}
                />
              ))}
            </div>
          )}

          {isAdmin && (
            <div className="border border-border rounded-md p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Add New Facility Type</p>
              <div className="flex gap-2">
                <Input
                  value={newIcon}
                  onChange={(e) => setNewIcon(e.target.value)}
                  className="h-9 w-14 text-center"
                  placeholder="🏭"
                />
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-9 flex-1"
                  placeholder="Facility name"
                />
              </div>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="h-9"
                placeholder="Description (optional)"
              />
              <Button
                size="sm"
                disabled={!newName.trim()}
                onClick={async () => {
                  await addFacilityType(newName.trim(), newDesc.trim(), newIcon || "🏭");
                  setNewName("");
                  setNewDesc("");
                  setNewIcon("🏭");
                }}
              >
                Add Facility Type
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function FacilityTypeRow({
  ft,
  isAdmin,
  onUpdate,
  onRemove,
}: {
  ft: { id: string; name: string; description: string; icon: string };
  isAdmin: boolean;
  onUpdate: (id: string, updates: Partial<{ name: string; description: string; icon: string }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(ft.name);
  const [desc, setDesc] = useState(ft.description);
  const [icon, setIcon] = useState(ft.icon);

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded border border-border px-3 py-2">
        <span className="text-lg">{ft.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{ft.name}</p>
          {ft.description && <p className="text-xs text-muted-foreground">{ft.description}</p>}
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onRemove(ft.id)}>
              Delete
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded border border-primary/50 px-3 py-2 space-y-2">
      <div className="flex gap-2">
        <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="h-8 w-14 text-center" />
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 flex-1" />
      </div>
      <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="h-8" placeholder="Description" />
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={async () => {
            await onUpdate(ft.id, { name, description: desc, icon });
            setEditing(false);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default MapTestingConfig;
