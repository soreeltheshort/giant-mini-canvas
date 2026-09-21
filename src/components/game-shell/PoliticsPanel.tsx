import { useMemo, useState } from "react";
import { useSenateBlocs } from "@/hooks/useSenateBlocs";
import { useFavores } from "@/hooks/useFavores";
import type { SenateBloc } from "@/lib/senateBlocs";
import type { Favor } from "@/lib/favores";
import { affinityLabel } from "@/lib/senateAffinities";
import { criterionLabel, materializeFavorDescription } from "@/lib/favorCriteria";
import { Button } from "@/components/ui/button";
import { TabControl } from "@/components/game-shell/TabControl";
import VotesPanel from "@/components/game-shell/politics/VotesPanel";
import ProposeVotePanel from "@/components/game-shell/politics/ProposeVotePanel";
import { ChevronRight, ScrollText } from "lucide-react";

const TABS = ["Favores", "Votes", "Propose"];

/**
 * Politics surface — shows the SENATE BLOCS of the game's chosen bloc set.
 * Senate blocs are entirely separate from the military `factions` used on the
 * map; nothing here reads faction data.
 */
interface PoliticsPanelProps {
  gameId?: string | null;
}

export default function PoliticsPanel({ gameId }: PoliticsPanelProps) {
  const { blocs, loading: blocsLoading } = useSenateBlocs(gameId);
  const { favors, loading: favorsLoading } = useFavores();
  const [selection, setSelection] = useState<{ type: "bloc" | "favor"; id: string } | null>(null);
  const [tab, setTab] = useState(TABS[0]);
  const selectedBloc = selection?.type === "bloc"
    ? blocs.find((bloc) => bloc.id === selection.id)
    : !selection
      ? blocs[0]
      : undefined;
  const selectedFavor = selection?.type === "favor"
    ? favors.find((favor) => favor.id === selection.id)
    : undefined;
  const playerDescriptions = useMemo(
    () => new Map(favors.map((favor) => [
      favor.id,
      materializeFavorDescription(favor.description, favor.variables),
    ])),
    [favors],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-ivory-dark">
      {/* Bloc card row */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-bronze/30 bg-marble-dark/40">
        {blocsLoading ? (
          <p className="text-center text-xs font-body font-medium text-muted-foreground py-8">
            Convening the Senate…
          </p>
        ) : blocs.length === 0 ? (
          <p className="text-center text-xs font-body font-medium text-muted-foreground py-8">
            No senate blocs configured for this game.
          </p>
        ) : (
          <div className="flex flex-wrap justify-center gap-3">
            {blocs.map((b) => {
              const active = selectedBloc?.id === b.id;
              return (
                <Button
                  key={b.id}
                  type="button"
                  variant="ghost"
                  onMouseEnter={() => setSelection({ type: "bloc", id: b.id })}
                  onFocus={() => setSelection({ type: "bloc", id: b.id })}
                  onClick={() => setSelection({ type: "bloc", id: b.id })}
                  className={`
                    w-24 h-auto p-0 aspect-[5/7] rounded-sm overflow-hidden relative shrink-0
                    border-2 transition-all duration-150 text-left
                    ${active
                      ? "border-crimson shadow-md shadow-crimson/20 -translate-y-1"
                      : "border-bronze/50 hover:border-bronze hover:-translate-y-0.5 shadow-sm"
                    }
                  `}
                  title={b.name}
                >
                  {b.image_url ? (
                    <img
                      src={b.image_url}
                      alt={b.name}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="absolute inset-0"
                      style={{ background: `linear-gradient(160deg, ${b.accent_color}33, ${b.accent_color}99)` }}
                    />
                  )}
                  <div className="absolute top-0 inset-x-0 h-1" style={{ background: b.accent_color }} />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-senate-dark/80 to-transparent px-1.5 pb-1 pt-4">
                    <p className="font-heading text-[9px] font-bold uppercase tracking-wider text-primary-foreground leading-tight whitespace-normal">
                      {b.name}
                    </p>
                  </div>
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <section className="min-h-0 overflow-y-auto p-4 lg:border-r lg:border-bronze/40">
          <div className="mb-4">
            <TabControl tabs={TABS} active={tab} onChange={setTab} />
          </div>

          {tab === "Votes" && (
            <VotesPanel
              blocs={blocs}
              selectedBlocId={selectedBloc?.id ?? null}
              onSelectBloc={(id) => setSelection({ type: "bloc", id })}
            />
          )}

          {tab === "Propose" && (
            <ProposeVotePanel
              blocs={blocs}
              onSelectBloc={(id) => setSelection({ type: "bloc", id })}
            />
          )}

          {tab === "Favores" && (<>
          <div className="flex items-end justify-between border-b border-bronze/40 pb-2 mb-3">
            <div>
              <h2 id="favores-heading" className="font-heading text-base font-bold uppercase text-senate-dark">Open Favores</h2>
            </div>
            <span className="font-heading text-xs font-bold text-muted-foreground">{favors.length}</span>
          </div>

          {favorsLoading ? (
            <p className="py-8 text-center text-xs font-body font-semibold text-muted-foreground">Reviewing petitions…</p>
          ) : favors.length === 0 ? (
            <div className="border border-bronze/40 bg-ivory p-6 text-center">
              <ScrollText className="mx-auto mb-2 h-5 w-5 text-bronze" aria-hidden="true" />
              <p className="font-heading text-xs font-bold uppercase text-senate-dark">No Favores are open</p>
            </div>
          ) : (
            <div className="divide-y divide-bronze/30 border-y border-bronze/30">
              {favors.map((favor, index) => {
                const active = selectedFavor?.id === favor.id;
                return (
                  <Button
                    key={favor.id}
                    type="button"
                    variant="ghost"
                    onClick={() => setSelection({ type: "favor", id: favor.id })}
                    className={`group w-full h-auto min-h-16 rounded-none px-3 py-3 justify-start text-left whitespace-normal ${active ? "bg-crimson/10" : "hover:bg-marble-dark/60"}`}
                  >
                    <span className="w-7 shrink-0 self-start pt-0.5 font-heading text-[10px] font-bold text-bronze-dark">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-heading text-xs font-bold uppercase text-senate-dark">{favor.name}</span>
                      <span className="mt-1 block line-clamp-2 font-body text-xs font-semibold text-muted-foreground">{playerDescriptions.get(favor.id) || "No description supplied."}</span>
                    </span>
                    <ChevronRight className={`h-4 w-4 shrink-0 text-bronze transition-transform ${active ? "translate-x-0.5" : "group-hover:translate-x-0.5"}`} aria-hidden="true" />
                  </Button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="min-h-0 overflow-y-auto bg-marble-dark/30 p-4" aria-live="polite">
          {selectedFavor ? (
            <FavorDossier favor={selectedFavor} blocs={blocs} description={playerDescriptions.get(selectedFavor.id) ?? ""} />
          ) : selectedBloc ? (
            <BlocDossier bloc={selectedBloc} />
          ) : (
            <p className="py-8 text-center text-xs font-body font-semibold text-muted-foreground">Select a bloc or Favor.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function BlocDossier({ bloc }: { bloc: SenateBloc }) {
  return (
    <div className="border-2 border-bronze/40 rounded-sm bg-ivory shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-bronze/30 bg-marble-dark/50">
        <div>
          <p className="font-heading text-[9px] font-semibold uppercase tracking-widest text-crimson">Senate Bloc</p>
          <h2 className="font-heading text-sm font-bold uppercase text-senate-dark">{bloc.name}</h2>
        </div>
        <span className="w-4 h-4 rounded-sm border border-bronze/60" style={{ background: bloc.accent_color }} />
      </div>
      <div className="px-4 py-4 border-b border-bronze/30 bg-marble-dark/25">
        <p className="font-heading text-4xl font-bold leading-none text-crimson">{bloc.senate_votes ?? 0}</p>
        <p className="mt-1 text-[9px] font-heading font-semibold uppercase tracking-widest text-senate-dark">Senate Votes</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(bloc.affinities ?? []).length === 0 ? (
            <span className="text-xs font-body font-semibold text-senate-dark/70">No declared affinities</span>
          ) : (
            (bloc.affinities ?? []).map((affinity) => (
              <span key={affinity} className="px-2 py-1 rounded-sm border border-bronze/60 bg-ivory-dark text-[10px] font-heading font-bold uppercase text-senate-dark">
                {affinityLabel(affinity)}
              </span>
            ))
          )}
        </div>
      </div>
      {bloc.description && <p className="px-4 pt-4 font-body font-semibold text-sm text-senate-dark">{bloc.description}</p>}
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 p-4 text-sm">
        <DossierRow label="Leader" value="—" />
        <DossierRow label="Standing" value="—" />
        <DossierMeter label="Influence" value={0} />
        <DossierMeter label="Stability" value={0} />
      </div>
      <p className="px-4 pb-3 text-[10px] text-muted-foreground italic">Bloc standings are not yet simulated.</p>
    </div>
  );
}

function FavorDossier({ favor, blocs, description }: { favor: Favor; blocs: SenateBloc[]; description: string }) {
  const targetBlocNames = favor.target_bloc_ids
    .map((id) => blocs.find((bloc) => bloc.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const targets = [...targetBlocNames, ...favor.target_affinities.map(affinityLabel)];

  return (
    <div className="border-2 border-crimson/50 rounded-sm bg-ivory shadow-sm">
      <div className="px-4 py-3 border-b border-bronze/30 bg-marble-dark/50">
        <p className="font-heading text-[9px] font-semibold uppercase tracking-widest text-crimson">Favor</p>
        <h2 className="mt-1 font-heading text-base font-bold uppercase text-senate-dark">{favor.name}</h2>
      </div>
      <div className="px-4 py-3 border-b border-bronze/30">
        <p className="font-body text-sm font-semibold leading-relaxed text-senate-dark">{description || "No description supplied."}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-4">
        <DossierDatum label="Criterion" value={criterionLabel(favor.criterion_type)} />
        <DossierDatum label="Bloc Reward" value={String(favor.bloc_reward ?? 0)} />
        <DossierDatum label="Affinity Reward" value={String(favor.affinity_reward ?? 0)} />
      </dl>
      <div className="border-t border-bronze/30 px-4 py-3">
        <p className="text-[9px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">Reward Applies To</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {targets.length ? targets.map((target) => (
            <span key={target} className="border border-bronze/60 bg-ivory-dark px-2 py-1 font-heading text-[10px] font-bold uppercase text-senate-dark">{target}</span>
          )) : <span className="font-body text-xs font-semibold text-muted-foreground">No affiliations assigned</span>}
        </div>
      </div>
    </div>
  );
}

function DossierDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-body text-sm font-bold text-senate-dark">{value}</dd>
    </div>
  );
}

function DossierRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-body font-semibold text-senate-dark">{value}</p>
    </div>
  );
}

function DossierMeter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[9px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-sm bg-ivory-dark border border-bronze/30 overflow-hidden">
          <div className="h-full bg-bronze/70" style={{ width: `${value}%` }} />
        </div>
        <span className="text-xs font-body font-semibold text-senate-dark w-8 text-right">{value}</span>
      </div>
    </div>
  );
}
