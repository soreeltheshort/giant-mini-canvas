import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Faction {
  id: string;
  name: string;
  code_name: string;
  color: string;
}

interface OverrideRow {
  id: string;
  viewer_faction_id: string;
  target_faction_id: string;
  forced_class: "friend" | "enemy";
  notes: string;
}

/**
 * Admin-managed hard-coded relationships between factions.
 * Rows are directional: viewer → target. Add the reciprocal row to lock both sides.
 * Anything not listed here starts as `competitor` and is then re-evaluated dynamically (later phase).
 */
export default function RelationshipOverridesPanel({
  factions,
  isAdmin,
}: {
  factions: Faction[];
  isAdmin: boolean;
}) {
  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewerId, setViewerId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [forcedClass, setForcedClass] = useState<"friend" | "enemy">("friend");
  const [notes, setNotes] = useState("");

  const reload = async () => {
    const { data, error } = await supabase
      .from("faction_relationship_overrides" as any)
      .select("id, viewer_faction_id, target_faction_id, forced_class, notes")
      .order("created_at");
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data as any) ?? []);
  };

  useEffect(() => { reload(); }, []);

  const factionLabel = (id: string) => {
    const f = factions.find((x) => x.id === id);
    return f ? `${f.code_name} (${f.name})` : id.slice(0, 8);
  };

  const add = async () => {
    if (!viewerId || !targetId) { toast.error("Pick both factions"); return; }
    if (viewerId === targetId) { toast.error("Viewer and target must differ"); return; }
    setBusy(true);
    const { error } = await supabase
      .from("faction_relationship_overrides" as any)
      .insert({
        viewer_faction_id: viewerId,
        target_faction_id: targetId,
        forced_class: forcedClass,
        notes,
      } as any);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setViewerId(""); setTargetId(""); setForcedClass("friend"); setNotes("");
    toast.success("Override added");
    reload();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("faction_relationship_overrides" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    reload();
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No hard-coded relationships. All faction pairs default to <span className="font-mono">competitor</span>.
        </p>
      ) : (
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs">
              <span className="font-mono flex-1 min-w-0 truncate">
                {factionLabel(r.viewer_faction_id)} <span className="text-muted-foreground">views</span>{" "}
                {factionLabel(r.target_faction_id)} <span className="text-muted-foreground">as</span>{" "}
                <span className={r.forced_class === "enemy" ? "text-destructive font-semibold" : "text-accent font-semibold"}>
                  {r.forced_class}
                </span>
              </span>
              {r.notes && <span className="text-muted-foreground italic truncate max-w-[40%]">{r.notes}</span>}
              {isAdmin && (
                <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => remove(r.id)}>×</Button>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="border border-border rounded-md p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Add Override (one direction)</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Viewer</Label>
              <select value={viewerId} onChange={(e) => setViewerId(e.target.value)} className="h-9 w-full rounded border border-border bg-background px-2 text-sm">
                <option value="">—</option>
                {factions.map((f) => (<option key={f.id} value={f.id}>{f.code_name}</option>))}
              </select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Target</Label>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="h-9 w-full rounded border border-border bg-background px-2 text-sm">
                <option value="">—</option>
                {factions.filter((f) => f.id !== viewerId).map((f) => (<option key={f.id} value={f.id}>{f.code_name}</option>))}
              </select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Class</Label>
              <select value={forcedClass} onChange={(e) => setForcedClass(e.target.value as any)} className="h-9 w-full rounded border border-border bg-background px-2 text-sm">
                <option value="friend">friend</option>
                <option value="enemy">enemy</option>
              </select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9" placeholder="optional" />
            </div>
          </div>
          <Button size="sm" disabled={busy || !viewerId || !targetId} onClick={add}>Add Override</Button>
          <p className="text-[10px] text-muted-foreground">
            Directional: stores only how the viewer sees the target. To lock both sides, add a second row with the factions swapped.
          </p>
        </div>
      )}
    </div>
  );
}
