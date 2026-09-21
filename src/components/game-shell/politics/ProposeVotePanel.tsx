import { useState } from "react";
import { toast } from "sonner";
import type { SenateBloc } from "@/lib/senateBlocs";
import { VOTE_CATEGORIES } from "@/lib/votingDummy";
import { affinityLabel } from "@/lib/senateAffinities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProposeVotePanelProps {
  blocs: SenateBloc[];
  onSelectBloc: (id: string) => void;
}

/** Form for proposing a new senate vote. Placeholder — nothing is saved yet. */
export default function ProposeVotePanel({ blocs, onSelectBloc }: ProposeVotePanelProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(VOTE_CATEGORIES[0]);
  const [sponsorId, setSponsorId] = useState<string>("");
  const [description, setDescription] = useState("");

  const sponsor = blocs.find((b) => b.id === sponsorId);
  const canSubmit = title.trim().length > 0 && Boolean(sponsorId);

  const submit = () => {
    toast.success(`"${title.trim()}" drafted for ${sponsor?.name}`, {
      description: "Proposals are not yet sent to the Senate.",
    });
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-bronze/40 bg-ivory rounded-sm">
        <div className="px-4 py-3 border-b border-bronze/30 bg-marble-dark/50">
          <p className="font-heading text-[9px] font-semibold uppercase tracking-widest text-crimson">New Motion</p>
          <h2 className="font-heading text-base font-bold uppercase text-senate-dark">Propose a Vote</h2>
          <p className="mt-1 font-body text-xs font-semibold text-senate-dark/80">
            Every motion needs a senate bloc to sponsor it. The sponsor carries the motion to the floor, so its
            affinities shape how the chamber receives it.
          </p>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lex de …" />
          </Field>

          <Field label="Category">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-50 bg-background">
                {VOTE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Sponsoring Bloc">
            <Select
              value={sponsorId}
              onValueChange={(v) => { setSponsorId(v); onSelectBloc(v); }}
            >
              <SelectTrigger><SelectValue placeholder="Choose a sponsor" /></SelectTrigger>
              <SelectContent className="z-50 max-h-72 bg-background">
                {blocs.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <div>
            <p className="text-[9px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">
              Sponsor Affinities
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sponsor ? (
                (sponsor.affinities ?? []).length ? (
                  (sponsor.affinities ?? []).map((a) => (
                    <span key={a} className="border border-bronze/60 bg-ivory-dark px-2 py-1 font-heading text-[10px] font-bold uppercase text-senate-dark">
                      {affinityLabel(a)}
                    </span>
                  ))
                ) : (
                  <span className="font-body text-xs font-semibold text-muted-foreground">No declared affinities</span>
                )
              ) : (
                <span className="font-body text-xs font-semibold text-muted-foreground">Choose a sponsor first</span>
              )}
            </div>
          </div>

          <div className="md:col-span-2">
            <Field label="Description">
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What the motion does, and who pays for it."
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-bronze/30 px-4 py-3">
          <p className="text-[10px] font-body italic text-muted-foreground">
            Placeholder form — proposals are not yet submitted.
          </p>
          <Button type="button" disabled={!canSubmit} onClick={submit}>Submit Motion</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[9px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
