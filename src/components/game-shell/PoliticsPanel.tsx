import { useMemo, useState } from "react";
import { useFactions } from "@/hooks/useFactions";
import { factionDisplayFromCode } from "@/lib/factionUtils";
import portrait1 from "@/assets/faction-portrait-1.jpg";
import portrait2 from "@/assets/faction-portrait-2.jpg";
import portrait3 from "@/assets/faction-portrait-3.jpg";

const PORTRAITS = [portrait1, portrait2, portrait3];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

interface PoliticsCardData {
  id: string;
  name: string;
  color: string;
  portrait: string;
  isPlayer: boolean;
  // Dummy dossier attributes — placeholders until real diplomacy data lands.
  dossier: {
    leader: string;
    government: string;
    treasury: string;
    military: string;
    relations: string;
    influence: number;
    stability: number;
  };
}

const DUMMY_LEADERS = [
  "Legatus Varro", "Praefecta Cassia", "Consul Aurelius", "Tribune Marcella",
  "Prefect Dravian", "Senator Octavia", "Archon Synod", "Governor Helva", "Voice of the Colonies",
];
const DUMMY_GOVERNMENTS = ["Provincial Senate", "Military Junta", "Trade Oligarchy", "Theocratic Synod", "Colonial Assembly"];
const DUMMY_RELATIONS = ["Cordial", "Wary", "Hostile", "Formal Alliance", "Cold Peace", "Tributary"];

function buildDummyDossier(index: number, isPlayer: boolean): PoliticsCardData["dossier"] {
  return {
    leader: DUMMY_LEADERS[index % DUMMY_LEADERS.length],
    government: DUMMY_GOVERNMENTS[index % DUMMY_GOVERNMENTS.length],
    treasury: `${(12000 + index * 4300).toLocaleString()} ₡`,
    military: ["Negligible", "Modest", "Formidable", "Overwhelming"][index % 4],
    relations: isPlayer ? "Your Faction" : DUMMY_RELATIONS[index % DUMMY_RELATIONS.length],
    influence: 20 + ((index * 17) % 75),
    stability: 30 + ((index * 23) % 65),
  };
}

interface PoliticsPanelProps {
  /** The player's own owner classification (used to mark their card). */
  playerOwnerClassification?: string | null;
}

export default function PoliticsPanel({ playerOwnerClassification }: PoliticsPanelProps) {
  const { factions } = useFactions();

  const cards: PoliticsCardData[] = useMemo(() => {
    const out: PoliticsCardData[] = [];
    const playerKey = (playerOwnerClassification || "").toLowerCase();
    for (let i = 0; i < 9; i++) {
      const f = factions[i];
      if (f) {
        const name = factionDisplayFromCode(f.code_name) || f.name;
        const isPlayer =
          !!playerKey &&
          (f.name.toLowerCase() === playerKey || (f.code_name || "").toLowerCase() === playerKey);
        out.push({
          id: f.id,
          name,
          color: f.color || "#8a6d3b",
          portrait: PORTRAITS[i % PORTRAITS.length],
          isPlayer,
          dossier: buildDummyDossier(i, isPlayer),
        });
      } else {
        out.push({
          id: `dummy-${i}`,
          name: `Faction ${ROMAN[i]}`,
          color: "#8a6d3b",
          portrait: PORTRAITS[i % PORTRAITS.length],
          isPlayer: false,
          dossier: buildDummyDossier(i, false),
        });
      }
    }
    return out;
  }, [factions, playerOwnerClassification]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = cards.find((c) => c.id === selectedId) ?? cards.find((c) => c.isPlayer) ?? cards[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-ivory-dark">
      {/* Card row */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-bronze/30 bg-marble-dark/40">
        <div className="flex flex-wrap justify-center gap-3">
          {cards.map((c) => {
            const active = selected?.id === c.id;
            return (
              <button
                key={c.id}
                onMouseEnter={() => setSelectedId(c.id)}
                onFocus={() => setSelectedId(c.id)}
                className={`
                  w-24 aspect-[5/7] rounded-sm overflow-hidden relative
                  border-2 transition-all duration-150 text-left
                  ${active
                    ? "border-crimson shadow-md shadow-crimson/20 -translate-y-1"
                    : "border-bronze/50 hover:border-bronze hover:-translate-y-0.5 shadow-sm"
                  }
                `}
                style={{ background: "hsl(var(--ivory))" }}
                title={c.name}
              >
                <img
                  src={c.portrait}
                  alt={c.name}
                  loading="lazy"
                  width={640}
                  height={896}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Faction color band */}
                <div className="absolute top-0 inset-x-0 h-1" style={{ background: c.color }} />
                {/* Name plate */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4">
                  <p className="font-heading text-[9px] font-bold uppercase tracking-wider text-amber-50 leading-tight truncate">
                    {c.name}
                  </p>
                </div>
                {c.isPlayer && (
                  <div className="absolute top-1.5 right-1.5 bg-crimson text-primary-foreground text-[7px] font-heading font-bold uppercase tracking-wider px-1 py-px rounded-sm">
                    You
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Details window */}
      <div className="flex-1 overflow-y-auto p-4">
        {selected && (
          <div className="max-w-2xl mx-auto border-2 border-bronze/40 rounded-sm bg-ivory shadow-sm">
            <div className="flex items-center justify-between px-4 py-2 border-b border-bronze/30 bg-marble-dark/50">
              <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-foreground">
                {selected.name}
              </h2>
              <span className="w-4 h-4 rounded-sm border border-bronze/60" style={{ background: selected.color }} />
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm">
              <DossierRow label="Leader" value={selected.dossier.leader} />
              <DossierRow label="Government" value={selected.dossier.government} />
              <DossierRow label="Treasury" value={selected.dossier.treasury} />
              <DossierRow label="Military Strength" value={selected.dossier.military} />
              <DossierRow label="Relations" value={selected.dossier.relations} highlight={selected.isPlayer} />
              <DossierMeter label="Influence" value={selected.dossier.influence} />
              <DossierMeter label="Stability" value={selected.dossier.stability} />
            </div>
            <p className="px-4 pb-3 text-[10px] text-muted-foreground italic">
              Dossier values are placeholder intelligence estimates.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DossierRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`font-body font-medium ${highlight ? "text-crimson" : "text-foreground"}`}>{value}</p>
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
        <span className="text-xs font-body font-medium text-foreground w-8 text-right">{value}</span>
      </div>
    </div>
  );
}
