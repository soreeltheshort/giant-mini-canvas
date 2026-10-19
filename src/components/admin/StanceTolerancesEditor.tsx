import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_STANCE_TOLERANCES,
  VOTE_STANCE_LABELS,
  getStanceTolerances,
  setStanceTolerances,
  type StanceTolerances,
  type VoteStance,
} from "@/lib/senateVoteTypes";

const ROWS: { key: keyof StanceTolerances; stance: VoteStance; hint: string }[] = [
  { key: "strong_positive", stance: "strong-yea", hint: "Score at or above" },
  { key: "lean_positive", stance: "yea", hint: "Score at or above" },
  { key: "lean_negative", stance: "nay", hint: "Score at or below" },
  { key: "strong_negative", stance: "strong-nay", hint: "Score at or below" },
];

/**
 * Global stance tolerances — one set of cutoffs shared by every vote type. A bloc's
 * pre-influence score is compared against these to label its stance before influence.
 */
export default function StanceTolerancesEditor() {
  const [tol, setTol] = useState<StanceTolerances>(DEFAULT_STANCE_TOLERANCES);

  useEffect(() => { getStanceTolerances().then(setTol).catch(() => undefined); }, []);

  const patch = (p: Partial<StanceTolerances>) => setTol((t) => ({ ...t, ...p }));

  const save = async () => {
    if (!(tol.strong_positive >= tol.lean_positive && tol.lean_positive >= tol.lean_negative && tol.lean_negative >= tol.strong_negative)) {
      toast.error("Cutoffs must run: strongly yea ≥ yea ≥ nay ≥ strongly nay.");
      return;
    }
    try {
      await setStanceTolerances(tol);
      toast.success("Stance tolerances saved");
    } catch (e: any) { toast.error(e.message ?? String(e)); }
  };

  return (
    <div className="mb-8 border border-bronze/40 rounded-sm bg-card px-4 py-3">
      <h2 className="font-heading text-xl text-gold">Stance Tolerances</h2>
      <p className="font-body font-medium text-xs text-muted-foreground mb-3">
        Global for every vote. Before any player influence, a bloc's pre-influence score is compared against these
        cutoffs to label the bloc as neutral, leaning yea/nay, or strongly yea/nay.
      </p>
      <div className="border border-bronze/30 rounded-sm overflow-hidden max-w-2xl">
        <div className="grid grid-cols-[10rem_1fr_8rem] gap-2 px-3 py-1.5 border-b border-bronze/30 bg-muted/40">
          <span className="font-heading text-[10px] uppercase tracking-widest text-bronze">Stance</span>
          <span className="font-heading text-[10px] uppercase tracking-widest text-bronze">Rule</span>
          <span className="font-heading text-[10px] uppercase tracking-widest text-bronze text-right">Cutoff</span>
        </div>
        {ROWS.map((row) => (
          <div key={row.key} className="grid grid-cols-[10rem_1fr_8rem] gap-2 px-3 py-1.5 items-center border-b border-bronze/20 last:border-0">
            <span className="font-body text-xs font-semibold">{VOTE_STANCE_LABELS[row.stance]}</span>
            <span className="font-body text-xs text-muted-foreground">{row.hint}</span>
            <Input
              type="number"
              step="0.5"
              className="h-8 w-24 ml-auto text-right"
              value={tol[row.key]}
              onChange={(e) => patch({ [row.key]: Number(e.target.value) } as Partial<StanceTolerances>)}
              onBlur={save}
            />
          </div>
        ))}
        <div className="grid grid-cols-[10rem_1fr_8rem] gap-2 px-3 py-1.5 items-center bg-muted/40">
          <span className="font-body text-xs font-semibold">{VOTE_STANCE_LABELS.neutral}</span>
          <span className="font-body text-xs text-muted-foreground">Score between the yea and nay cutoffs</span>
          <span className="font-body text-xs text-muted-foreground text-right">—</span>
        </div>
      </div>

      <div className="mt-3 border border-bronze/30 rounded-sm px-3 py-2 space-y-1 max-w-2xl">
        <p className="font-body text-xs font-semibold">What Goes Into the Score</p>
        <p className="font-body text-xs text-muted-foreground">
          Each vote type defines its own affinity weights (under Vote Types below). The pre-influence score is the sum of
          those weights for every affinity the bloc holds, plus a +5 bonus for the sponsoring bloc. These cutoffs are then
          applied to that score — the same way, for every vote type.
        </p>
        <p className="font-body text-xs text-muted-foreground">
          Influence range: with these cutoffs, a bloc sits between {tol.strong_negative} and {tol.strong_positive} before
          influence; the most influence that can matter is {Math.max(0, tol.strong_positive - tol.lean_negative).toFixed(1)} to
          swing a leaning-nay bloc to strongly yea, and {Math.max(0, tol.lean_positive - tol.strong_negative).toFixed(1)} to swing a
          leaning-yea bloc to strongly nay.
        </p>
      </div>
    </div>
  );
}
