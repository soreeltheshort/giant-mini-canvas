import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FIELD_KINDS, deleteVoteType, listVoteTypes, renderVoteTemplate, saveVoteType,
  type SenateVoteType, type VoteTypeField,
} from "@/lib/senateVoteTypes";

const NONE = "__none__";

/** Admin editor for senate vote types: label, generated title/description templates, and custom fields. */
export default function VoteTypesEditor() {
  const [types, setTypes] = useState<SenateVoteType[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState<SenateVoteType | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = async (keep?: string) => {
    try {
      const t = await listVoteTypes();
      setTypes(t);
      const pick = t.find((x) => x.key === (keep ?? selectedKey)) ?? t[0];
      if (pick) { setSelectedKey(pick.key); setDraft(structuredClone(pick)); setIsNew(false); }
      else { setDraft(null); }
    } catch (e: any) { toast.error(e.message ?? String(e)); }
  };
  useEffect(() => { load(); }, []);

  const select = (k: string) => {
    const t = types.find((x) => x.key === k);
    if (t) { setSelectedKey(k); setDraft(structuredClone(t)); setIsNew(false); }
  };

  const addType = () => {
    setIsNew(true);
    setSelectedKey("");
    setDraft({ key: "", label: "", title_template: "", description_template: "", fields: [], sort_order: types.length + 1 });
  };

  const patch = (p: Partial<SenateVoteType>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchField = (i: number, p: Partial<VoteTypeField>) =>
    setDraft((d) => d ? { ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) } : d);

  const save = async () => {
    if (!draft) return;
    const key = draft.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!key || !draft.label.trim()) return toast.error("Key and name are required.");
    const keys = draft.fields.map((f) => f.key);
    if (keys.some((k) => !k) || new Set(keys).size !== keys.length) return toast.error("Field keys must be filled in and unique.");
    try {
      await saveVoteType({ ...draft, key });
      toast.success(`Saved "${draft.label}"`);
      await load(key);
    } catch (e: any) { toast.error(e.message ?? String(e)); }
  };

  const remove = async () => {
    if (!draft || isNew) return;
    try { await deleteVoteType(draft.key); toast.success("Vote type deleted"); setSelectedKey(""); await load(""); }
    catch (e: any) { toast.error("Can't delete — motions of this type may already exist.", { description: e.message }); }
  };

  const sample: Record<string, string> = {};
  draft?.fields.forEach((f, i) => { sample[f.key] = `Faction ${String.fromCharCode(65 + i)}`; });

  return (
    <div className="mb-8 border border-bronze/40 rounded-sm bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-heading text-xl text-gold">Vote Types</h2>
        <Button size="sm" variant="outline" onClick={addType}><Plus className="h-4 w-4 mr-1" /> New Vote Type</Button>
      </div>
      <p className="font-body font-medium text-xs text-muted-foreground mb-3">
        Each type defines the fields a proposer fills in. Title and description are generated — reference fields with
        <code className="mx-1">$Field_Key</code>(e.g. <code>$Combatant_1</code>).
      </p>

      {types.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {types.map((t) => (
            <Button key={t.key} size="sm" variant={t.key === selectedKey && !isNew ? "default" : "outline"} onClick={() => select(t.key)}>
              {t.label}
            </Button>
          ))}
        </div>
      )}

      {draft && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Labeled label="Name">
              <Input value={draft.label} onChange={(e) => patch({ label: e.target.value })} placeholder="Sanction War" />
            </Labeled>
            <Labeled label="Key (fixed once saved)">
              <Input value={draft.key} disabled={!isNew} onChange={(e) => patch({ key: e.target.value })} placeholder="sanction_war" />
            </Labeled>
            <Labeled label="Sort Order">
              <Input type="number" value={draft.sort_order} onChange={(e) => patch({ sort_order: Number(e.target.value) })} />
            </Labeled>
          </div>

          <Labeled label="Title Template">
            <Input value={draft.title_template} onChange={(e) => patch({ title_template: e.target.value })} />
          </Labeled>
          <Labeled label="Description Template">
            <Textarea rows={3} value={draft.description_template} onChange={(e) => patch({ description_template: e.target.value })} />
          </Labeled>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-body text-xs text-muted-foreground">Custom Fields ({draft.fields.length})</p>
              <Button size="sm" variant="outline"
                onClick={() => patch({ fields: [...draft.fields, { key: "", label: "", kind: "faction" }] })}>
                <Plus className="h-4 w-4 mr-1" /> Add Field
              </Button>
            </div>
            <div className="space-y-2">
              {draft.fields.map((f, i) => (
                <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_1.4fr_1fr_auto] items-end">
                  <Labeled label="Key">
                    <Input value={f.key} onChange={(e) => patchField(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_") })} placeholder="combatant_1" />
                  </Labeled>
                  <Labeled label="Label">
                    <Input value={f.label} onChange={(e) => patchField(i, { label: e.target.value })} placeholder="Combatant 1" />
                  </Labeled>
                  <Labeled label="Kind">
                    <Select value={f.kind} onValueChange={(v) => patchField(i, { kind: v as VoteTypeField["kind"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="z-50 bg-background">
                        {FIELD_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Labeled>
                  <Labeled label="Must differ from">
                    <Select value={f.distinct_from || NONE} onValueChange={(v) => patchField(i, { distinct_from: v === NONE ? undefined : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="z-50 bg-background">
                        <SelectItem value={NONE}>—</SelectItem>
                        {draft.fields.filter((o, j) => j !== i && o.key).map((o) => (
                          <SelectItem key={o.key} value={o.key}>{o.label || o.key}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Labeled>
                  <Button size="icon" variant="ghost" aria-label="Remove field"
                    onClick={() => patch({ fields: draft.fields.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-bronze/30 rounded-sm px-3 py-2">
            <p className="font-body text-xs text-muted-foreground">Preview</p>
            <p className="font-heading text-sm font-bold">{renderVoteTemplate(draft.title_template, draft.fields, sample) || "—"}</p>
            <p className="font-body text-sm font-medium">{renderVoteTemplate(draft.description_template, draft.fields, sample)}</p>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" disabled={isNew} onClick={remove}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
            <Button onClick={save}><Save className="h-4 w-4 mr-1" /> Save Vote Type</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-body text-xs text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
