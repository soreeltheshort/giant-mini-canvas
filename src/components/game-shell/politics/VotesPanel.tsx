import { useEffect, useMemo, useState } from "react";
import type { SenateBloc } from "@/lib/senateBlocs";
import {
  DUMMY_ADMIN_POINTS,
  DUMMY_INFLUENCE_POOL,
  DUMMY_OPEN_VOTE,
  dummyStanceFor,
  leanLabel,
  type PlayerStance,
} from "@/lib/votingDummy";
import { DEFAULT_INFLUENCE_MULTIPLIER, getInfluenceMultiplier } from "@/lib/votingConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap } from "lucide-react";

interface Commitment {
  stance: PlayerStance;
  influence: number;
  adminPoint: boolean;
}

interface VotesPanelProps {
  blocs: SenateBloc[];
  onSelectBloc: (id: string) => void;
  selectedBlocId?: string | null;
}

/** Player-facing surface for swaying senate blocs on the open vote. Dummy data. */
export default function VotesPanel({ blocs, onSelectBloc, selectedBlocId }: VotesPanelProps) {
  const [multiplier, setMultiplier] = useState(DEFAULT_INFLUENCE_MULTIPLIER);
  const [commitments, setCommitments] = useState<Record<string, Commitment>>({});

  useEffect(() => { getInfluenceMultiplier().then(setMultiplier).catch(() => undefined); }, []);

  const get = (id: string): Commitment => commitments[id] ?? { stance: "none", influence: 0, adminPoint: false };
  const patch = (id: string, updates: Partial<Commitment>) =>
    setCommitments((prev) => ({ ...prev, [id]: { ...get(id), ...updates } }));

  const rows = useMemo(() => blocs.map((bloc, index) => {
    const stanceData = dummyStanceFor(index);
    const c = get(bloc.id);
    const effective = Math.round(c.influence * (c.adminPoint ? multiplier : 1) * 10) / 10;
    const alreadyAligned = c.stance !== "none" && stanceData.lean === c.stance;
    const swung = c.stance !== "none" && (alreadyAligned || effective >= stanceData.barrier);
    const projected: PlayerStance | "abstain" = swung
      ? c.stance
      : stanceData.lean === "undecided" ? "abstain" : stanceData.lean;
    return { bloc, ...stanceData, c, effective, alreadyAligned, swung, projected };
  }), [blocs, commitments, multiplier]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.influence += r.c.influence;
      acc.admin += r.c.adminPoint ? 1 : 0;
      const votes = r.bloc.senate_votes ?? 0;
      if (r.projected === "yea") acc.yea += votes;
      else if (r.projected === "nay") acc.nay += votes;
      else acc.abstain += votes;
      return acc;
    },
    { influence: 0, admin: 0, yea: 0, nay: 0, abstain: 0 },
  );

  const influenceLeft = DUMMY_INFLUENCE_POOL - totals.influence;
  const adminLeft = DUMMY_ADMIN_POINTS - totals.admin;

  return (
    <div className="space-y-4">
      {/* Open vote header */}
      <div className="border-2 border-bronze/40 bg-ivory rounded-sm">
        <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-bronze/30 bg-marble-dark/50">
          <div>
            <p className="font-heading text-[9px] font-semibold uppercase tracking-widest text-crimson">
              Open Vote — {DUMMY_OPEN_VOTE.category}
            </p>
            <h2 className="font-heading text-base font-bold uppercase text-senate-dark">{DUMMY_OPEN_VOTE.title}</h2>
            <p className="font-body text-xs font-semibold text-senate-dark/80">
              Sponsored by {DUMMY_OPEN_VOTE.sponsorBlocName}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-heading text-2xl font-bold leading-none text-crimson">{DUMMY_OPEN_VOTE.turnsRemaining}</p>
            <p className="text-[9px] font-heading font-semibold uppercase tracking-widest text-senate-dark">Turns Left</p>
          </div>
        </div>
        <p className="px-4 py-3 font-body text-sm font-semibold text-senate-dark">{DUMMY_OPEN_VOTE.description}</p>
        <div className="grid grid-cols-3 border-t border-bronze/30 text-center">
          <Tally label="Yea" value={totals.yea} tone="text-crimson" />
          <Tally label="Nay" value={totals.nay} tone="text-senate-dark" />
          <Tally label="Abstain" value={totals.abstain} tone="text-muted-foreground" />
        </div>
      </div>

      {/* Pools */}
      <div className="flex flex-wrap items-center gap-4 border border-bronze/40 bg-marble-dark/40 px-4 py-2 rounded-sm">
        <Pool label="Influence Available" value={`${influenceLeft} / ${DUMMY_INFLUENCE_POOL}`} />
        <Pool label="Admin Points" value={`${adminLeft} / ${DUMMY_ADMIN_POINTS}`} />
        <Pool label="Admin Point Boost" value={`${multiplier}x`} />
      </div>

      {/* Bloc rows */}
      <div className="border-y border-bronze/30 divide-y divide-bronze/20">
        {rows.map((r) => (
          <div
            key={r.bloc.id}
            className={`px-3 py-3 ${selectedBlocId === r.bloc.id ? "bg-crimson/5" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => onSelectBloc(r.bloc.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block font-heading text-xs font-bold uppercase text-senate-dark">{r.bloc.name}</span>
                <span className="block font-body text-xs font-semibold text-muted-foreground">
                  {r.bloc.senate_votes ?? 0} votes · {leanLabel(r.lean)} · barrier {r.barrier}
                </span>
              </button>

              <div className="flex items-center gap-1">
                {(["yea", "nay", "none"] as PlayerStance[]).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={r.c.stance === s ? "default" : "outline"}
                    className="h-7 px-2 font-heading text-[10px] font-bold uppercase"
                    onClick={() => patch(r.bloc.id, { stance: s })}
                  >
                    {s === "none" ? "Leave" : s}
                  </Button>
                ))}
              </div>

              <Input
                type="number"
                min={0}
                value={r.c.influence || ""}
                placeholder="0"
                onChange={(e) => patch(r.bloc.id, { influence: Math.max(0, Number(e.target.value) || 0) })}
                className="h-7 w-20 text-xs"
                aria-label={`Influence committed to ${r.bloc.name}`}
                disabled={r.c.stance === "none"}
              />

              <Button
                type="button"
                size="sm"
                variant={r.c.adminPoint ? "default" : "outline"}
                className="h-7 px-2 font-heading text-[10px] font-bold uppercase"
                disabled={r.c.stance === "none"}
                onClick={() => patch(r.bloc.id, { adminPoint: !r.c.adminPoint })}
              >
                <Zap className="mr-1 h-3 w-3" aria-hidden="true" />
                1 AP
              </Button>

              <span className="w-40 shrink-0 text-right font-body text-xs font-bold">
                {r.c.stance === "none" ? (
                  <span className="text-muted-foreground">No pressure applied</span>
                ) : r.alreadyAligned ? (
                  <span className="text-crimson">Already with you</span>
                ) : (
                  <span className={r.swung ? "text-crimson" : "text-muted-foreground"}>
                    {r.c.influence}{r.c.adminPoint ? ` → ${r.effective}` : ""} vs {r.barrier} — {r.swung ? "Swung" : "Not enough"}
                  </span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-bronze/40 bg-marble-dark/40 px-4 py-2 rounded-sm">
        <Pool label="Influence Committed" value={String(totals.influence)} />
        <Pool label="Admin Points Spent" value={String(totals.admin)} />
        <Pool
          label="Projected Result"
          value={totals.yea > totals.nay ? `Passes ${totals.yea}–${totals.nay}` : totals.nay > totals.yea ? `Fails ${totals.nay}–${totals.yea}` : `Tied ${totals.yea}–${totals.nay}`}
        />
      </div>
      <p className="text-[10px] font-body italic text-muted-foreground">
        Placeholder vote — choices are not yet saved or resolved.
      </p>
    </div>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="py-2">
      <p className={`font-heading text-xl font-bold leading-none ${tone}`}>{value}</p>
      <p className="text-[9px] font-heading font-semibold uppercase tracking-widest text-senate-dark">{label}</p>
    </div>
  );
}

function Pool({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-body text-sm font-bold text-senate-dark">{value}</p>
    </div>
  );
}
