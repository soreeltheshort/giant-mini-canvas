import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FOLLOWTHROUGH_CATALOG } from "@/lib/ai/followthroughCatalog";

interface Row {
  id: string;
  persona_id: string;
  step_order: number;
  activity_code: string;
  enabled: boolean;
  params_json: Record<string, unknown>;
}

/**
 * Per-persona ordered queue of fall-back ("follow-through") activities.
 * Walked in order when the main goal slate leaves production unspent.
 */
export default function FollowthroughEditor({
  personaId,
  isAdmin,
}: {
  personaId: string;
  isAdmin: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const { data, error } = await supabase
      .from("ai_persona_followthrough" as any)
      .select("*")
      .eq("persona_id", personaId)
      .order("step_order");
    if (error) { toast.error(error.message); return; }
    setRows((data as any) ?? []);
  };

  useEffect(() => { reload(); }, [personaId]);

  const update = async (id: string, fields: Partial<Row>) => {
    const { error } = await supabase.from("ai_persona_followthrough" as any).update(fields as any).eq("id", id);
    if (error) toast.error(error.message);
  };

  const swap = async (a: Row, b: Row) => {
    if (!isAdmin) return;
    setBusy(true);
    // Two-step to avoid unique constraint conflict
    await supabase.from("ai_persona_followthrough" as any).update({ step_order: -1 }).eq("id", a.id);
    await supabase.from("ai_persona_followthrough" as any).update({ step_order: a.step_order }).eq("id", b.id);
    await supabase.from("ai_persona_followthrough" as any).update({ step_order: b.step_order }).eq("id", a.id);
    setBusy(false);
    reload();
  };

  const remove = async (id: string) => {
    if (!isAdmin) return;
    const { error } = await supabase.from("ai_persona_followthrough" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    reload();
  };

  const add = async () => {
    if (!isAdmin) return;
    const nextOrder = (rows.at(-1)?.step_order ?? 0) + 1;
    const { error } = await supabase.from("ai_persona_followthrough" as any).insert({
      persona_id: personaId,
      step_order: nextOrder,
      activity_code: FOLLOWTHROUGH_CATALOG[0].code,
      enabled: true,
      params_json: {},
    } as any);
    if (error) { toast.error(error.message); return; }
    reload();
  };

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Follow-through Queue</Label>
      <p className="text-[10px] text-muted-foreground">
        Walked top-to-bottom when goals leave production unspent. Disabled rows are skipped.
      </p>
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">No follow-through steps defined.</p>
      )}
      {rows.map((r, idx) => (
        <FollowthroughRow
          key={r.id}
          row={r}
          isAdmin={isAdmin}
          canUp={idx > 0}
          canDown={idx < rows.length - 1}
          onUpdate={update}
          onRemove={remove}
          onMoveUp={() => swap(r, rows[idx - 1])}
          onMoveDown={() => swap(r, rows[idx + 1])}
          busy={busy}
        />
      ))}
      {isAdmin && (
        <Button size="sm" variant="outline" onClick={add} disabled={busy}>+ Add Step</Button>
      )}
    </div>
  );
}

function FollowthroughRow({
  row, isAdmin, canUp, canDown, onUpdate, onRemove, onMoveUp, onMoveDown, busy,
}: {
  row: Row;
  isAdmin: boolean;
  canUp: boolean;
  canDown: boolean;
  onUpdate: (id: string, f: Partial<Row>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  busy: boolean;
}) {
  const [paramsText, setParamsText] = useState(JSON.stringify(row.params_json ?? {}));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setParamsText(JSON.stringify(row.params_json ?? {}));
    setErr(null);
  }, [row.id]);

  const commitParams = async () => {
    try {
      const parsed = paramsText.trim() === "" ? {} : JSON.parse(paramsText);
      setErr(null);
      await onUpdate(row.id, { params_json: parsed });
    } catch {
      setErr("Invalid JSON");
    }
  };

  return (
    <div className="flex items-center gap-2 rounded border border-border px-2 py-1.5">
      <span className="w-6 text-center font-mono text-xs text-muted-foreground">{row.step_order}</span>
      <div className="flex flex-col gap-0.5">
        <Button size="sm" variant="ghost" className="h-5 px-1 text-xs" disabled={!isAdmin || !canUp || busy} onClick={onMoveUp}>↑</Button>
        <Button size="sm" variant="ghost" className="h-5 px-1 text-xs" disabled={!isAdmin || !canDown || busy} onClick={onMoveDown}>↓</Button>
      </div>
      <Checkbox
        checked={row.enabled}
        disabled={!isAdmin}
        onCheckedChange={(v) => onUpdate(row.id, { enabled: Boolean(v) })}
      />
      <select
        value={row.activity_code}
        disabled={!isAdmin}
        onChange={(e) => onUpdate(row.id, { activity_code: e.target.value })}
        className="h-8 rounded border border-border bg-background px-2 text-xs font-mono flex-1 min-w-0"
      >
        {FOLLOWTHROUGH_CATALOG.map((a) => (
          <option key={a.code} value={a.code}>{a.code}</option>
        ))}
      </select>
      <Input
        value={paramsText}
        disabled={!isAdmin}
        onChange={(e) => setParamsText(e.target.value)}
        onBlur={commitParams}
        placeholder="{}"
        className={`h-8 text-xs font-mono w-40 ${err ? "border-destructive" : ""}`}
      />
      {isAdmin && (
        <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => onRemove(row.id)}>×</Button>
      )}
    </div>
  );
}
