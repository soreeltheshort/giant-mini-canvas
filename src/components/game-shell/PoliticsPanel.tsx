import { useState } from "react";
import { useSenateBlocs } from "@/hooks/useSenateBlocs";
import { affinityLabel } from "@/lib/senateAffinities";

/**
 * Politics surface — shows the SENATE BLOCS of the game's chosen bloc set.
 * Senate blocs are entirely separate from the military `factions` used on the
 * map; nothing here reads faction data.
 */
interface PoliticsPanelProps {
  gameId?: string | null;
}

export default function PoliticsPanel({ gameId }: PoliticsPanelProps) {
  const { blocs, loading } = useSenateBlocs(gameId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = blocs.find((b) => b.id === selectedId) ?? blocs[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-ivory-dark">
      {/* Bloc card row */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-bronze/30 bg-marble-dark/40">
        {loading ? (
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
              const active = selected?.id === b.id;
              return (
                <button
                  key={b.id}
                  onMouseEnter={() => setSelectedId(b.id)}
                  onFocus={() => setSelectedId(b.id)}
                  className={`
                    w-24 aspect-[5/7] rounded-sm overflow-hidden relative
                    border-2 transition-all duration-150 text-left
                    ${active
                      ? "border-crimson shadow-md shadow-crimson/20 -translate-y-1"
                      : "border-bronze/50 hover:border-bronze hover:-translate-y-0.5 shadow-sm"
                    }
                  `}
                  style={{ background: "hsl(var(--ivory))" }}
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
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4">
                    <p className="font-heading text-[9px] font-bold uppercase tracking-wider text-amber-50 leading-tight">
                      {b.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Dossier */}
      <div className="flex-1 overflow-y-auto p-4">
        {selected && (
          <div className="max-w-2xl mx-auto border-2 border-bronze/40 rounded-sm bg-ivory shadow-sm">
            <div className="flex items-center justify-between px-4 py-2 border-b border-bronze/30 bg-marble-dark/50">
              <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-foreground">
                {selected.name}
              </h2>
              <span className="w-4 h-4 rounded-sm border border-bronze/60" style={{ background: selected.accent_color }} />
            </div>
            {/* Headline: votes + affinities */}
            <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-bronze/30 bg-marble-dark/25">
              <div className="text-center">
                <p className="font-heading text-3xl font-bold leading-none text-crimson">
                  {selected.senate_votes ?? 0}
                </p>
                <p className="text-[9px] font-heading font-semibold uppercase tracking-widest text-senate-dark">
                  Senate Votes
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(selected.affinities ?? []).length === 0 ? (
                  <span className="text-xs font-body font-semibold text-senate-dark/70">No declared affinities</span>
                ) : (
                  (selected.affinities ?? []).map((a) => (
                    <span
                      key={a}
                      className="px-2.5 py-1 rounded-sm border border-bronze/60 bg-ivory-dark text-xs font-heading font-bold uppercase tracking-wider text-senate-dark"
                    >
                      {affinityLabel(a)}
                    </span>
                  ))
                )}
              </div>
            </div>

            {selected.description && (
              <p className="px-4 pt-3 font-body font-semibold text-sm text-senate-dark">{selected.description}</p>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm">
              <DossierRow label="Leader" value="—" />
              <DossierRow label="Standing" value="—" />
              <DossierMeter label="Influence" value={0} />
              <DossierMeter label="Stability" value={0} />
            </div>
            <p className="px-4 pb-3 text-[10px] text-muted-foreground italic">
              Bloc standings are not yet simulated.
            </p>
          </div>
        )}
      </div>
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
