import { X, Landmark, Swords, Hammer, Scroll } from "lucide-react";
import type { GameMode, MapSelection, NewsStory } from "./gameShellTypes";
import { REGION_DETAILS, ARMY_DETAILS, PRODUCTION_DETAILS } from "./gameShellTypes";
import { ImperialCard } from "./ImperialCard";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";

interface ContextPanelProps {
  mode: GameMode;
  selection: MapSelection;
  news: NewsStory[];
  onClose: () => void;
  onClearSelection: () => void;
}

export default function ContextPanel({ mode, selection, news, onClose, onClearSelection }: ContextPanelProps) {
  return (
    <aside className="w-72 bg-marble border-l-2 border-bronze/40 flex flex-col relative z-20 shrink-0 animate-fade-in">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border bronze-border-b shrink-0">
        <h2 className="font-heading text-[10px] font-semibold uppercase tracking-[0.15em] text-bronze-dark flex items-center gap-1.5">
          <ModeIcon mode={mode} selection={selection} />
          {getPanelTitle(mode, selection)}
        </h2>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {selection.type === "news" ? (
          <NewsDetail story={news.find((n) => n.id === selection.id)} />
        ) : selection.type === "region" ? (
          <RegionDetail id={selection.id} />
        ) : selection.type === "army" ? (
          <ArmyDetail id={selection.id} />
        ) : selection.type === "production-center" ? (
          <ProductionDetail id={selection.id} />
        ) : selection.type === "faction" ? (
          <FactionDetail id={selection.id} />
        ) : (
          <EmptyState mode={mode} />
        )}
      </div>

      {/* Back link when viewing detail */}
      {selection.type !== "none" && (
        <div className="p-2 border-t border-border shrink-0">
          <button
            onClick={onClearSelection}
            className="w-full text-center text-[10px] font-heading uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            ← Back to overview
          </button>
        </div>
      )}
    </aside>
  );
}

function ModeIcon({ mode, selection }: { mode: GameMode; selection: MapSelection }) {
  if (selection.type === "news") return <Scroll className="w-3.5 h-3.5" />;
  const icons = { diplomacy: Landmark, military: Swords, production: Hammer };
  const Icon = icons[mode];
  return <Icon className="w-3.5 h-3.5" />;
}

function getPanelTitle(mode: GameMode, selection: MapSelection): string {
  if (selection.type === "news") return "Dispatch";
  if (selection.type === "region") return "System Detail";
  if (selection.type === "army") return "Fleet Detail";
  if (selection.type === "production-center") return "Production";
  if (selection.type === "faction") return "Faction Intel";
  const titles = { diplomacy: "Diplomatic Overview", military: "Strategic Overview", production: "Production Overview" };
  return titles[mode];
}

/* ── Empty States ── */
function EmptyState({ mode }: { mode: GameMode }) {
  const content = {
    diplomacy: {
      icon: Landmark,
      title: "Diplomatic Overview",
      lines: [
        "Select a faction capital on the map to view relations.",
        "Active treaties and pending proposals will appear here.",
      ],
      stats: [
        { label: "Active Treaties", value: "3" },
        { label: "Pending Proposals", value: "1" },
        { label: "Senate Standing", value: "Favorable" },
      ],
    },
    military: {
      icon: Swords,
      title: "Strategic Overview",
      lines: [
        "Select a fleet or garrison on the map to view details.",
        "Fleet movement orders can be issued from this panel.",
      ],
      stats: [
        { label: "Total Fleets", value: "2" },
        { label: "Total Ships", value: "16" },
        { label: "Active Engagements", value: "0" },
      ],
    },
    production: {
      icon: Hammer,
      title: "Production Overview",
      lines: [
        "Select a forge or shipyard on the map to manage output.",
        "Construction queues and efficiency reports appear here.",
      ],
      stats: [
        { label: "Active Facilities", value: "4" },
        { label: "Queue Items", value: "3" },
        { label: "Avg Efficiency", value: "72%" },
      ],
    },
  };

  const c = content[mode];

  return (
    <>
      <div className="text-center py-4 space-y-2">
        <c.icon className="w-8 h-8 text-bronze/40 mx-auto" />
        <h3 className="font-heading text-sm font-semibold text-foreground">{c.title}</h3>
        {c.lines.map((l, i) => (
          <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">{l}</p>
        ))}
      </div>
      <ImperialCard title="Summary">
        <div className="space-y-2">
          {c.stats.map((s) => (
            <div key={s.label} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-semibold">{s.value}</span>
            </div>
          ))}
        </div>
      </ImperialCard>
    </>
  );
}

/* ── Detail Views ── */
function RegionDetail({ id }: { id: string }) {
  const d = REGION_DETAILS[id];
  if (!d) return <p className="text-xs text-muted-foreground">Unknown system.</p>;

  return (
    <>
      <ImperialCard title={d.name} subtitle={d.classification}>
        <div className="space-y-2">
          <Row label="Population" value={d.population} />
          <Row label="Condition">
            <StatusBadge variant={d.condition === "Stable" || d.condition === "Prosperous" ? "success" : d.condition === "Contested" ? "danger" : "info"}>
              {d.condition}
            </StatusBadge>
          </Row>
          <Row label="Garrison" value={d.garrison} />
        </div>
      </ImperialCard>

      <ImperialCard title="Resources">
        <div className="space-y-2.5">
          {d.resources.map((r) => (
            <ProgressBar key={r.label} label={r.label} value={r.value} max={r.max} color={r.value >= 70 ? "bronze" : r.value >= 40 ? "bronze" : "crimson"} />
          ))}
        </div>
      </ImperialCard>

      <ImperialCard title="Facilities">
        <div className="space-y-1.5">
          {d.facilities.map((f) => (
            <div key={f} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
              <span>{f}</span>
              <StatusBadge variant="success">Active</StatusBadge>
            </div>
          ))}
        </div>
      </ImperialCard>
    </>
  );
}

function ArmyDetail({ id }: { id: string }) {
  const d = ARMY_DETAILS[id];
  if (!d) return <p className="text-xs text-muted-foreground">Unknown fleet.</p>;

  return (
    <>
      <ImperialCard title={d.name} subtitle={`Commander: ${d.commander}`}>
        <div className="space-y-2">
          <Row label="Status">
            <StatusBadge variant={d.status === "Alert" ? "warning" : "info"}>{d.status}</StatusBadge>
          </Row>
          <ProgressBar label="Strength" value={d.strength} max={d.maxStrength} color="bronze" />
          <ProgressBar label="Morale" value={d.morale} max={100} color={d.morale >= 70 ? "bronze" : "crimson"} />
        </div>
      </ImperialCard>

      <ImperialCard title="Fleet Composition">
        <div className="space-y-1.5">
          {d.ships.map((s) => (
            <div key={s.name} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
              <span>{s.name}</span>
              <span className="font-semibold text-bronze">×{s.count}</span>
            </div>
          ))}
        </div>
      </ImperialCard>
    </>
  );
}

function ProductionDetail({ id }: { id: string }) {
  const d = PRODUCTION_DETAILS[id];
  if (!d) return <p className="text-xs text-muted-foreground">Unknown facility.</p>;

  return (
    <>
      <ImperialCard title={d.name} subtitle={d.type}>
        <div className="space-y-2">
          <ProgressBar label="Output" value={d.output} max={d.capacity} color="bronze" />
          <ProgressBar label="Efficiency" value={d.efficiency} max={100} color={d.efficiency >= 70 ? "bronze" : "crimson"} />
        </div>
      </ImperialCard>

      <ImperialCard title="Build Queue">
        <div className="space-y-1.5">
          {d.queue.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">Queue empty.</p>
          ) : (
            d.queue.map((q, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                <span>{q.item}</span>
                <span className="text-muted-foreground">{q.turns}T</span>
              </div>
            ))
          )}
        </div>
      </ImperialCard>
    </>
  );
}

function FactionDetail({ id }: { id: string }) {
  return (
    <>
      <ImperialCard title="Faction Intelligence">
        <div className="space-y-2">
          <Row label="Faction" value={id} />
          <Row label="Relations">
            <StatusBadge variant="warning">Neutral</StatusBadge>
          </Row>
          <Row label="Military Posture">
            <StatusBadge variant="info">Defensive</StatusBadge>
          </Row>
          <Row label="Trade Status" value="Open" />
        </div>
      </ImperialCard>
    </>
  );
}

function NewsDetail({ story }: { story?: NewsStory }) {
  if (!story) return <p className="text-xs text-muted-foreground">Dispatch not found.</p>;

  return (
    <ImperialCard title={story.headline} subtitle={`Turn ${story.turn} · ${story.category}`}>
      <p className="text-xs text-foreground leading-relaxed">{story.summary}</p>
    </ImperialCard>
  );
}

/* ── Helpers ── */
function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children || <span className="font-semibold text-foreground">{value}</span>}
    </div>
  );
}
