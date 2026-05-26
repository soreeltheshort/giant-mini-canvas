import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNamingConventions, NamingConvention, NamingConventionKind } from "@/hooks/useNamingConventions";

function parseNames(raw: string): string[] {
  return raw
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ConventionRow({
  c,
  isAdmin,
  onUpdate,
  onRemove,
}: {
  c: NamingConvention;
  isAdmin: boolean;
  onUpdate: (id: string, updates: Partial<Pick<NamingConvention, "name" | "kind" | "names">>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [kind, setKind] = useState<NamingConventionKind>(c.kind);
  const [namesText, setNamesText] = useState(c.names.join("\n"));

  if (!editing) {
    return (
      <div className="flex items-start gap-3 rounded border border-border px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {c.name}{" "}
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">({c.kind})</span>
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {c.names.length} name{c.names.length === 1 ? "" : "s"}
            {c.names.length > 0 && <> · {c.names.slice(0, 5).join(", ")}{c.names.length > 5 ? "…" : ""}</>}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onRemove(c.id)}>Delete</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded border border-primary/50 px-3 py-2 space-y-2">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 flex-1" placeholder="Convention name" />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as NamingConventionKind)}
          className="h-8 rounded border border-border bg-background px-2 text-sm"
        >
          <option value="planet">planet</option>
          <option value="fleet">fleet</option>
          <option value="ship">ship</option>
        </select>
      </div>
      <Textarea
        value={namesText}
        onChange={(e) => setNamesText(e.target.value)}
        rows={6}
        placeholder="One name per line (or comma-separated)"
        className="text-xs font-mono"
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={async () => {
            await onUpdate(c.id, { name: name.trim(), kind, names: parseNames(namesText) });
            setEditing(false);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export default function NamingConventionsSection({ isAdmin }: { isAdmin: boolean }) {
  const { conventions, loading, add, update, remove } = useNamingConventions();
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<NamingConventionKind>("planet");
  const [newNames, setNewNames] = useState("");

  const planetConvs = conventions.filter((c) => c.kind === "planet");
  const fleetConvs = conventions.filter((c) => c.kind === "fleet");
  const shipConvs = conventions.filter((c) => c.kind === "ship");

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Naming Conventions</h2>
      <p className="text-xs text-muted-foreground">
        Reusable lists of names for planets, fleets and ships. Planet lists are assigned at the map level; fleet and ship lists are assigned per faction.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground py-2">Loading…</p>
      ) : conventions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No naming conventions defined yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Planet lists</p>
            {planetConvs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">None</p>
            ) : (
              planetConvs.map((c) => (
                <ConventionRow key={c.id} c={c} isAdmin={isAdmin} onUpdate={update} onRemove={remove} />
              ))
            )}
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fleet lists</p>
            {fleetConvs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">None</p>
            ) : (
              fleetConvs.map((c) => (
                <ConventionRow key={c.id} c={c} isAdmin={isAdmin} onUpdate={update} onRemove={remove} />
              ))
            )}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="border border-border rounded-md p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Add New Naming Convention</p>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-9 flex-1"
              placeholder='e.g. "Latin Numerals"'
            />
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as NamingConventionKind)}
              className="h-9 rounded border border-border bg-background px-2 text-sm"
            >
              <option value="planet">planet</option>
              <option value="fleet">fleet</option>
            </select>
          </div>
          <Textarea
            value={newNames}
            onChange={(e) => setNewNames(e.target.value)}
            rows={5}
            placeholder="One name per line (or comma-separated)"
            className="text-xs font-mono"
          />
          <Button
            size="sm"
            disabled={!newName.trim()}
            onClick={async () => {
              await add(newName.trim(), newKind, parseNames(newNames));
              setNewName("");
              setNewNames("");
            }}
          >
            Add Convention
          </Button>
        </div>
      )}
    </div>
  );
}
