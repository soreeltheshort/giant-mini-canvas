import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SenateBloc } from "@/lib/senateBlocs";
import { affinityLabel } from "@/lib/senateAffinities";
import {
  listVoteTypes,
  renderVoteTemplate,
  submitProposal,
  validateVoteParams,
  type SenateVoteType,
} from "@/lib/senateVoteTypes";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProposeVotePanelProps {
  gameId?: string | null;
  blocs: SenateBloc[];
  onSelectBloc: (id: string) => void;
}

interface FactionOption { id: string; name: string }

/** Propose a senate vote. Title and description are generated from the vote type. */
export default function ProposeVotePanel({ gameId, blocs, onSelectBloc }: ProposeVotePanelProps) {
  const [types, setTypes] = useState<SenateVoteType[]>([]);
  const [typeKey, setTypeKey] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [sponsorId, setSponsorId] = useState("");
  const [playerFactions, setPlayerFactions] = useState<FactionOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listVoteTypes()
      .then((t) => { setTypes(t); if (t[0]) setTypeKey(t[0].key); })
      .catch(() => toast.error("Could not load vote types"));
  }, []);

  // Player (non-AI) factions in this game — the only choices the UI offers.
  useEffect(() => {
    if (!gameId) return;
    (async () => {
      const { data: gf } = await (supabase as any)
        .from("game_factions").select("faction_id, is_ai").eq("game_id", gameId).eq("is_ai", false);
      const ids = [...new Set((gf ?? []).map((r: any) => r.faction_id).filter(Boolean))] as string[];
      if (!ids.length) { setPlayerFactions([]); return; }
      const { data: f } = await (supabase as any).from("factions").select("id, name").in("id", ids);
      setPlayerFactions(((f ?? []) as FactionOption[]).sort((a, b) => a.name.localeCompare(b.name)));
    })();
  }, [gameId]);

  const type = types.find((t) => t.key === typeKey);
  const sponsor = blocs.find((b) => b.id === sponsorId);

  const displayValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) out[k] = playerFactions.find((f) => f.id === v)?.name ?? "";
    return out;
  }, [params, playerFactions]);

  const title = type ? renderVoteTemplate(type.title_template, type.fields, displayValues) : "";
  const description = type ? renderVoteTemplate(type.description_template, type.fields, displayValues) : "";
  const paramError = type ? validateVoteParams(type, params) : "Choose a vote type.";
  const canSubmit = !!gameId && !paramError && !!sponsorId && !submitting;

  const changeType = (k: string) => { setTypeKey(k); setParams({}); };

  const submit = async () => {
    if (!type || !gameId) return;
    setSubmitting(true);
    try {
      await submitProposal({ gameId, voteType: type.key, params, title, description, sponsorBlocId: sponsorId });
      toast.success(`"${title}" submitted`, { description: `Sponsored by ${sponsor?.name}` });
      setParams({});
    } catch (e: any) {
      toast.error("Could not submit motion", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-bronze/40 bg-ivory rounded-sm">
        <div className="px-4 py-3 border-b border-bronze/30 bg-marble-dark/50">
          <p className="font-heading text-[9px] font-semibold uppercase tracking-widest text-crimson">New Motion</p>
          <h2 className="font-heading text-base font-bold uppercase text-senate-dark">Propose a Vote</h2>
          <p className="mt-1 font-body text-xs font-semibold text-senate-dark/80">
            Choose the kind of motion and its particulars. The clerks draft the title and text; a sponsoring bloc carries it to the floor.
          </p>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Vote Type">
            <Select value={typeKey} onValueChange={changeType}>
              <SelectTrigger><SelectValue placeholder="Choose a vote type" /></SelectTrigger>
              <SelectContent className="z-50 bg-background">
                {types.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Sponsoring Bloc">
            <Select value={sponsorId} onValueChange={(v) => { setSponsorId(v); onSelectBloc(v); }}>
              <SelectTrigger><SelectValue placeholder="Choose a sponsor" /></SelectTrigger>
              <SelectContent className="z-50 max-h-72 bg-background">
                {blocs.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {type?.fields.map((f) => {
            const excluded = f.distinct_from ? params[f.distinct_from] : undefined;
            return (
              <Field key={f.key} label={f.label}>
                <Select value={params[f.key] ?? ""} onValueChange={(v) => setParams((p) => ({ ...p, [f.key]: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose a player faction" /></SelectTrigger>
                  <SelectContent className="z-50 max-h-72 bg-background">
                    {playerFactions.length === 0 && (
                      <div className="px-2 py-1.5 font-body text-xs font-semibold text-muted-foreground">No player factions in this game</div>
                    )}
                    {playerFactions.map((pf) => (
                      <SelectItem key={pf.id} value={pf.id} disabled={pf.id === excluded}>{pf.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            );
          })}

          <div className="md:col-span-2">
            <p className="text-[9px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">Sponsor Affinities</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sponsor ? (
                (sponsor.affinities ?? []).length ? (
                  (sponsor.affinities ?? []).map((a) => (
                    <span key={a} className="border border-bronze/60 bg-ivory-dark px-2 py-1 font-heading text-[10px] font-bold uppercase text-senate-dark">
                      {affinityLabel(a)}
                    </span>
                  ))
                ) : <span className="font-body text-xs font-semibold text-muted-foreground">No declared affinities</span>
              ) : <span className="font-body text-xs font-semibold text-muted-foreground">Choose a sponsor first</span>}
            </div>
          </div>
        </div>

        {/* Generated, read-only motion text */}
        <div className="mx-4 mb-4 border border-bronze/40 bg-marble-dark/40 rounded-sm" aria-live="polite">
          <p className="px-3 pt-2 text-[9px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">
            Motion as Drafted
          </p>
          <h3 className="px-3 pt-1 font-heading text-sm font-bold uppercase text-senate-dark">{title || "—"}</h3>
          <p className="px-3 pb-3 pt-1 font-body text-sm font-semibold text-senate-dark">{description}</p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-bronze/30 px-4 py-3">
          <p className="text-[11px] font-body font-semibold text-muted-foreground">
            {paramError ?? (!sponsorId ? "Choose a sponsoring bloc." : "Ready to submit.")}
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
