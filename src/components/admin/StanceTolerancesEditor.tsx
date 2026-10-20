import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_STANCE_TOLERANCES,
  VOTE_STANCES,
  getStanceTolerances,
  setStanceTolerances,
  type StanceTolerances,
  type VoteStance,
} from "@/lib/senateVoteTypes";

/** Which tolerance cutoff each stance reads, in display order (neutral has none). */
const CUTOFF_OF: Partial<Record<VoteStance, keyof StanceTolerances>> = {
  "strong-yea": "strong_positive",
  yea: "lean_positive",
  nay: "lean_negative",
  "strong-nay": "strong_negative",
};

const RULE_OF: Partial<Record<VoteStance, string>> = {
  "strong-yea": "Score at or above",
  yea: "Score at or above",
  nay: "Score at or below",
  "strong-nay": "Score at or below",
};

/**
 * Global stance tolerances — one set of cutoffs shared by every vote type. Stance names and
 * descriptions are editable; the names are shown wherever a stance appears in the game.
 */
export default function StanceTolerancesEditor() {
  const [tol, setTol] = useState<StanceTolerances>(DEFAULT_STANCE_TOLERANCES);

  useEffect(() => { getStanceTolerances().then(setTol).catch(() => undefined); }, []);

  const patch = (p: Partial<StanceTolerances>) => setTol((t) => ({ ...t, ...p }));

  const save = async (candidate?: StanceTolerances) => {
    const t = candidate ?? tol;
    if (!(t.strong_positive >= t.lean_positive && t.lean_positive >= t.lean_negative && t.lean_negative >= t.strong_negative)) {
      toast.error("Cutoffs must run: strongly yea ≥ yea ≥ nay ≥ strongly nay.");
      return;
    }
    try {
      await setStanceTolerances(t);
      toast.success("Stance tolerances saved");
    } catch (e: any) { toast.error(e.message ?? String(e)); }
  };

  const setCutoff = (key: keyof StanceTolerances, value: number) => {
    const next = { ...tol, [key]: value } as StanceTolerances;
    setTol(next);
    save(next);
  };

  return (
    <div className="mb-8 border border-bronze/40 rounded-sm bg-card px-4 py-3">
      <h2 className="font-heading text-xl text-gold">Stance Tolerances</h2>
      <p className="font-body font-medium text-xs text-muted-foreground mb-3">
        Global for every vote. Before any player influence, a bloc's pre-influence score is compared against these
        cutoffs to place it in one of the five stances below. Rename a stance or describe it — its name is shown
        wherever that stance appears in the game.
      </p>
      <div className="border border-bronze/30 rounded-sm overflow-hidden max-w-3xl">
        <div className="grid grid-cols-[10rem_7rem_7rem_1fr] gap-2 px-3 py-1.5 border-b border-bronze/30 bg-muted/40">
          <span className="font-heading text-[10px] uppercase tracking-widest text-bronze">Stance</span>
          <span className="font-heading text-[10px] uppercase tracking-widest text-bronze text-right">Cutoff</span>
          <span className="font-heading text-[10px] uppercase tracking-widest text-bronze">Rule</span>
          <span className="font-heading text-[10px] uppercase tracking-widest text-bronze">Description</span>
        </div>
        {VOTE_STANCES.map((stance) => {
          const cutoffKey = CUTOFF_OF[stance];
          return (
            <div key={stance} className="grid grid-cols-[10rem_7rem_7rem_1fr] gap-2 px-3 py-1.5 items-center border-b border-bronze/20 last:border-0">
              <Input
                className="h-8 font-body text-xs font-semibold"
                value={tol.labels[stance]}
                placeholder="Stance name"
                onChange={(e) => patch({ labels: { ...tol.labels, [stance]: e.target.value } })}
                onBlur={() => save()}
              />
              {cutoffKey ? (
                <Input
                  type="number"
                  step="0.5"
                  className="h-8 text-right"
                  value={tol[cutoffKey] as number}
                  onChange={(e) => patch({ [cutoffKey]: Number(e.target.value) } as Partial<StanceTolerances>)}
                  onBlur={() => save()}
                />
              ) : (
                <span className="font-body text-xs text-muted-foreground text-right">—</span>
              )}
              <span className="font-body text-xs text-muted-foreground">
                {RULE_OF[stance] ?? "Score between the yea and nay cutoffs"}
              </span>
              <Input
                className="h-8 font-body text-xs"
                value={tol.descriptions[stance]}
                placeholder="What this stance means…"
                onChange={(e) => patch({ descriptions: { ...tol.descriptions, [stance]: e.target.value } })}
                onBlur={() => save()}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3 border border-bronze/30 rounded-sm px-3 py-2 space-y-1 max-w-3xl">
        <p className="font-body text-xs font-semibold">What Goes Into the Score</p>
        <p className="font-body text-xs text-muted-foreground">
          Each vote type defines its own affinity weights (under Vote Types below). The pre-influence score is the sum of
          those weights for every affinity the bloc holds, plus a +5 bonus for the sponsoring bloc. These cutoffs are then
          applied to that score — the same way, for every vote type.
        </p>
        <p className="font-body text-xs text-muted-foreground">
          Influence range: with these cutoffs, a bloc sits between {tol.strong_negative} and {tol.strong_positive} before
          influence; the most influence that can matter is {Math.max(0, tol.strong_positive - tol.lean_negative).toFixed(1)} to
          move a lower stance up to {tol.labels["strong-yea"]}, and {Math.max(0, tol.lean_positive - tol.strong_negative).toFixed(1)} to
          move it down to {tol.labels["strong-nay"]}.
        </p>
      </div>
    </div>
  );
}
