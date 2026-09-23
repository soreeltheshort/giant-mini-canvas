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

type InfluenceChoice = "none" | "yea" | "nay" | "strong-yea" | "strong-nay";

interface Commitment {
  choice: InfluenceChoice;
}

const CHOICE_SEQUENCE: InfluenceChoice[] = ["none", "yea", "nay", "strong-yea", "strong-nay"];

const CHOICE_LABELS: Record<InfluenceChoice, string> = {
  none: "Do not influence",
  yea: "Yea",
  nay: "Nay",
  "strong-yea": "Strong Yea",
  "strong-nay": "Strong Nay",
};

function stanceForChoice(choice: InfluenceChoice): PlayerStance {
  if (choice === "yea" || choice === "strong-yea") return "yea";
  if (choice === "nay" || choice === "strong-nay") return "nay";
  return "none";
}

function isStrongChoice(choice: InfluenceChoice) {
  return choice === "strong-yea" || choice === "strong-nay";
}

function choiceTone(choice: InfluenceChoice) {
  if (choice === "yea") return "border-vote-yea bg-vote-yea/20 text-vote-yea-strong hover:bg-vote-yea/35 hover:text-vote-yea-strong";
  if (choice === "strong-yea") return "border-vote-yea-strong bg-vote-yea-strong text-primary-foreground shadow-md shadow-vote-yea/25 hover:bg-vote-yea-strong hover:text-primary-foreground";
  if (choice === "nay") return "border-vote-nay bg-vote-nay/20 text-vote-nay-strong hover:bg-vote-nay/35 hover:text-vote-nay-strong";
  if (choice === "strong-nay") return "border-vote-nay-strong bg-vote-nay-strong text-primary-foreground shadow-md shadow-vote-nay/25 hover:bg-vote-nay-strong hover:text-primary-foreground";
  return "border-bronze/40 bg-ivory text-muted-foreground hover:border-bronze hover:bg-marble-dark/50 hover:text-muted-foreground";
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

  const get = (id: string): Commitment => commitments[id] ?? { choice: "none" };
  const cycleChoice = (id: string) => {
    setCommitments((prev) => {
      const current = prev[id]?.choice ?? "none";
      const currentIndex = CHOICE_SEQUENCE.indexOf(current);
      const choice = CHOICE_SEQUENCE[(currentIndex + 1) % CHOICE_SEQUENCE.length];
      return { ...prev, [id]: { choice } };
    });
  };

  const rows = useMemo(() => blocs.map((bloc, index) => {
    const stanceData = dummyStanceFor(index);
    const c = get(bloc.id);
    const stance = stanceForChoice(c.choice);
    const strong = isStrongChoice(c.choice);
    const effective = strong ? multiplier : 1;
    const alreadyAligned = stance !== "none" && stanceData.lean === stance;
    const swung = stance !== "none" && (alreadyAligned || effective >= stanceData.barrier);
    const projected: PlayerStance | "abstain" = swung
      ? stance
      : stanceData.lean === "undecided" ? "abstain" : stanceData.lean;
    return { bloc, ...stanceData, c, stance, strong, projected };
  }), [blocs, commitments, multiplier]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.influenced += r.stance === "none" ? 0 : 1;
      acc.admin += r.strong ? 1 : 0;
      const votes = r.bloc.senate_votes ?? 0;
      if (r.projected === "yea") acc.yea += votes;
      else if (r.projected === "nay") acc.nay += votes;
      else acc.abstain += votes;
      return acc;
    },
    { influenced: 0, admin: 0, yea: 0, nay: 0, abstain: 0 },
  );

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
          <Tally label="Yea" value={totals.yea} tone="text-vote-yea-strong" />
          <Tally label="Nay" value={totals.nay} tone="text-vote-nay-strong" />
          <Tally label="Abstain" value={totals.abstain} tone="text-muted-foreground" />
        </div>
      </div>

      {/* Available resources */}
      <div className="flex flex-wrap items-center gap-4 border border-bronze/40 bg-marble-dark/40 px-4 py-2 rounded-sm">
        <Pool label="Accumulated Influence" value={String(DUMMY_INFLUENCE_POOL)} />
        <Pool label="Admin Points" value={`${adminLeft} / ${DUMMY_ADMIN_POINTS}`} />
        <Pool label="Strong Vote Multiplier" value={`${multiplier}x`} />
      </div>

      {/* Bloc vote controls */}
      <div className="grid grid-cols-3 gap-x-2 gap-y-4 md:grid-cols-5">
        {rows.map((r) => (
          <div
            key={r.bloc.id}
            className="min-w-0 text-center"
          >
            <p className="mb-0.5 font-heading text-base font-bold leading-none text-crimson">{r.bloc.senate_votes ?? 0}</p>
            <p className="mb-1.5 font-heading text-[8px] font-semibold uppercase tracking-widest text-muted-foreground">Votes</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onSelectBloc(r.bloc.id);
                cycleChoice(r.bloc.id);
              }}
              className={`h-20 w-full whitespace-normal rounded-sm border-2 px-1 py-1 font-heading font-bold uppercase transition-colors ${choiceTone(r.c.choice)} ${selectedBlocId === r.bloc.id ? "ring-1 ring-bronze ring-offset-2 ring-offset-ivory-dark" : ""}`}
              aria-label={`${r.bloc.name}: ${CHOICE_LABELS[r.c.choice]}. Click for next choice.`}
            >
              <span className="flex h-full w-full flex-col items-center justify-between">
                <span className="block text-[9px] leading-tight">{CHOICE_LABELS[r.c.choice]}</span>
                {r.bloc.icon_url ? (
                  <img src={r.bloc.icon_url} alt="" className="h-10 w-10 object-contain" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center border border-current/40 font-heading text-sm">{r.bloc.name.charAt(0)}</span>
                )}
                <span className="block min-h-2 font-body text-[8px] font-bold normal-case">{r.strong ? "1 Admin Point" : ""}</span>
              </span>
            </Button>
            <p className="mt-1.5 font-body text-[10px] font-bold text-senate-dark">
              {leanLabel(r.lean)}
            </p>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-bronze/40 bg-marble-dark/40 px-4 py-2 rounded-sm">
        <Pool label="Blocs Influenced" value={String(totals.influenced)} />
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
