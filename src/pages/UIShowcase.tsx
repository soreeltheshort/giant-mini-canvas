import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Flame, Coins, Star, Factory, Shield, Scale,
  Swords, Landmark, Hammer, Map, Scroll, Settings,
  MessageSquare, BarChart3, Users, ChevronDown,
  ArrowLeft,
} from "lucide-react";

import { ImperialButton } from "@/components/game-shell/ImperialButton";
import { ImperialCard } from "@/components/game-shell/ImperialCard";
import { StatusBadge } from "@/components/game-shell/StatusBadge";
import { ProgressBar } from "@/components/game-shell/ProgressBar";
import { ResourceStatCard } from "@/components/game-shell/ResourceStatCard";
import { AlertBadge } from "@/components/game-shell/AlertBadge";
import { TabControl } from "@/components/game-shell/TabControl";
import ImperialOverlay from "@/components/game-shell/ImperialOverlay";

/* ═══════════════════════════════════════════
   SECTION WRAPPER
   ═══════════════════════════════════════════ */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-sm font-bold uppercase tracking-[0.15em] text-crimson">{title}</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-bronze/30 to-transparent" />
      </div>
      {children}
    </section>
  );
}

function StateLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[9px] font-heading uppercase tracking-[0.2em] text-muted-foreground block mb-1.5">{children}</span>;
}

/* ═══════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════ */
const UIShowcase = () => {
  const [activeTab, setActiveTab] = useState("Overview");
  const [activeSegment, setActiveSegment] = useState("Military");
  const [overlayOpen, setOverlayOpen] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-ivory">
      {/* ── Page Header ── */}
      <header className="sticky top-0 z-40 h-11 flex items-center justify-between px-4 bg-marble border-b-2 border-bronze/60">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-crimson hover:text-crimson-light transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-crimson" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2C9 6 4 8 4 12s5 6 8 10c3-4 8-6 8-10S15 6 12 2z" />
          </svg>
          <span className="font-heading font-bold text-sm tracking-wide uppercase text-foreground">
            Design System — Third Republic
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground font-heading uppercase tracking-wider">
          Component Reference v1.0
        </span>
      </header>

      <div className="max-w-6xl mx-auto p-8 space-y-12">

        {/* ════════════════════════════════════════
           1. TOP HEADER VARIANTS
           ════════════════════════════════════════ */}
        <Section title="Top Header Bar">
          <div className="space-y-3">
            <StateLabel>Default</StateLabel>
            <div className="border border-border rounded-sm overflow-hidden">
              <div className="h-11 flex items-center justify-between px-4 bg-marble border-b-2 border-bronze/60">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-crimson">
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2C9 6 4 8 4 12s5 6 8 10c3-4 8-6 8-10S15 6 12 2z" /></svg>
                    <span className="font-heading font-bold text-sm tracking-wide uppercase">Third Republic</span>
                  </div>
                  <span className="text-bronze/40">|</span>
                  <span className="font-heading text-sm font-semibold text-accent">Campaign Alpha</span>
                  <span className="text-[10px] text-muted-foreground font-medium bg-ivory-dark px-2 py-0.5 rounded-sm border border-border">Turn 4</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] font-heading font-semibold text-bronze-dark uppercase tracking-wider">Valerian</p>
                    <p className="text-[9px] text-muted-foreground">Princeps Aurelius</p>
                  </div>
                  <div className="w-7 h-7 rounded-sm border border-bronze/40 bg-ivory-dark flex items-center justify-center text-bronze">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>

            <StateLabel>Alert State (Crimson accent)</StateLabel>
            <div className="border border-border rounded-sm overflow-hidden">
              <div className="h-11 flex items-center justify-between px-4 bg-marble border-b-2 border-crimson/80">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-crimson">
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2C9 6 4 8 4 12s5 6 8 10c3-4 8-6 8-10S15 6 12 2z" /></svg>
                    <span className="font-heading font-bold text-sm tracking-wide uppercase">Third Republic</span>
                  </div>
                  <span className="text-crimson/40">|</span>
                  <span className="font-heading text-sm font-semibold text-accent">Campaign Alpha</span>
                  <span className="text-[10px] text-crimson font-semibold bg-red-50 px-2 py-0.5 rounded-sm border border-crimson/30">⚠ Alert</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-heading font-semibold text-crimson uppercase tracking-wider">Priority Alpha</span>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ════════════════════════════════════════
           2. LEFT NAV ITEM STATES
           ════════════════════════════════════════ */}
        <Section title="Navigation Rail Items">
          <div className="flex gap-3 flex-wrap">
            {([
              { label: "Idle", cls: "text-muted-foreground bg-transparent border-transparent", icon: Map, badge: 0 },
              { label: "Hover", cls: "text-foreground bg-ivory-dark border-bronze/20 shadow-[0_0_8px_0_hsl(35_55%_45%/0.3)]", icon: Swords, badge: 0 },
              { label: "Active", cls: "bg-crimson text-primary-foreground border-crimson shadow-sm", icon: Landmark, badge: 0 },
              { label: "Disabled", cls: "text-muted-foreground/40 bg-transparent border-transparent opacity-50 cursor-not-allowed", icon: Hammer, badge: 0 },
              { label: "With Badge", cls: "text-muted-foreground bg-transparent border-transparent", icon: MessageSquare, badge: 3 },
            ]).map(({ label, cls, icon: Icon, badge }) => (
              <div key={label} className="text-center">
                <StateLabel>{label}</StateLabel>
                <div className={`relative w-12 h-12 flex flex-col items-center justify-center rounded-sm border transition-all ${cls}`}>
                  <Icon className="w-4 h-4" />
                  <span className="text-[7px] font-medium mt-0.5 leading-none uppercase tracking-wider">{Icon === Map ? "Map" : Icon === Swords ? "Military" : Icon === Landmark ? "Diplomacy" : Icon === Hammer ? "Production" : "Messages"}</span>
                  {badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-crimson text-primary-foreground text-[9px] font-bold flex items-center justify-center rounded-sm">{badge}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════
           3. BUTTONS
           ════════════════════════════════════════ */}
        <Section title="Buttons">
          <div className="space-y-4">
            {(["primary", "secondary", "ghost"] as const).map((variant) => (
              <div key={variant}>
                <StateLabel>{variant}</StateLabel>
                <div className="flex items-center gap-3 flex-wrap">
                  <ImperialButton variant={variant} size="sm">Small</ImperialButton>
                  <ImperialButton variant={variant} size="md">Medium</ImperialButton>
                  <ImperialButton variant={variant} size="lg">Large</ImperialButton>
                  <ImperialButton variant={variant} size="md" disabled>Disabled</ImperialButton>
                </div>
              </div>
            ))}

            <div>
              <StateLabel>Destructive / Critical</StateLabel>
              <div className="flex items-center gap-3">
                <button className="inline-flex items-center justify-center gap-2 font-heading border rounded-sm transition-all duration-150 uppercase tracking-wider h-8 px-4 text-sm bg-red-700 border-red-700 text-white hover:bg-red-600">
                  Confirm Destruction
                </button>
                <button className="inline-flex items-center justify-center gap-2 font-heading border rounded-sm transition-all duration-150 uppercase tracking-wider h-8 px-4 text-sm bg-red-700 border-red-700 text-white opacity-50 cursor-not-allowed" disabled>
                  Disabled
                </button>
              </div>
            </div>
          </div>
        </Section>

        {/* ════════════════════════════════════════
           4. STATUS BADGES
           ════════════════════════════════════════ */}
        <Section title="Status Badges">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge variant="success">Operational</StatusBadge>
            <StatusBadge variant="warning">Caution</StatusBadge>
            <StatusBadge variant="danger">Critical</StatusBadge>
            <StatusBadge variant="info">Intel</StatusBadge>
            <StatusBadge variant="neutral">Inactive</StatusBadge>
          </div>
        </Section>

        {/* ════════════════════════════════════════
           5. ALERT BADGES
           ════════════════════════════════════════ */}
        <Section title="Alert Badges">
          <div className="space-y-2 max-w-lg">
            <AlertBadge type="info">Reconnaissance squadron has departed for Rim Sector 7.</AlertBadge>
            <AlertBadge type="warning">Supply reserves below 40% — resupply recommended.</AlertBadge>
            <AlertBadge type="success">Trade compact with Cassian Province ratified successfully.</AlertBadge>
            <AlertBadge type="critical">Enemy fleet detected approaching Novus Gate relay.</AlertBadge>
          </div>
        </Section>

        {/* ════════════════════════════════════════
           6. PROGRESS BARS
           ════════════════════════════════════════ */}
        <Section title="Progress Bars">
          <div className="max-w-sm space-y-3">
            <ProgressBar label="Industry" value={78} max={100} color="bronze" />
            <ProgressBar label="Agriculture" value={45} max={100} color="success" />
            <ProgressBar label="Critical — Hull Integrity" value={18} max={100} color="crimson" />
            <ProgressBar label="Full Capacity" value={100} max={100} color="bronze" />
            <ProgressBar label="Empty" value={0} max={100} color="bronze" />
          </div>
        </Section>

        {/* ════════════════════════════════════════
           7. RESOURCE STAT CARDS
           ════════════════════════════════════════ */}
        <Section title="Resource Stat Cards">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ResourceStatCard icon={<Flame className="w-4 h-4" />} label="Cinders" value="18,740" change="+1,200" trend="up" />
            <ResourceStatCard icon={<Coins className="w-4 h-4" />} label="Treasury" value="₡42,350" change="-3,400" trend="down" />
            <ResourceStatCard icon={<Star className="w-4 h-4" />} label="Influence" value="73" />
            <ResourceStatCard icon={<Shield className="w-4 h-4" />} label="Readiness" value="82%" change="+5%" trend="up" />
          </div>
        </Section>

        {/* ════════════════════════════════════════
           8. RESOURCE CHIPS (inline)
           ════════════════════════════════════════ */}
        <Section title="Resource Chips">
          <div className="flex items-center gap-3 flex-wrap">
            {([
              { icon: "₡", label: "Credits", value: "12,450", cls: "" },
              { icon: "◆", label: "Materials", value: "3,200", cls: "" },
              { icon: "★", label: "Influence", value: "87", cls: "" },
              { icon: "⚡", label: "Cinders", value: "18,740", cls: "" },
              { icon: "⚠", label: "Low Supply", value: "12%", cls: "border-crimson/40 text-crimson" },
            ]).map(({ icon, label, value, cls }) => (
              <div key={label} className={`inline-flex items-center gap-1.5 px-2.5 py-1 bg-ivory border border-border rounded-sm bronze-glow-hover ${cls}`}>
                <span className="text-bronze text-sm">{icon}</span>
                <div>
                  <p className="text-xs font-semibold text-accent leading-none">{value}</p>
                  <p className="text-[8px] text-muted-foreground uppercase tracking-wider">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════
           9. TAB / SEGMENTED CONTROLS
           ════════════════════════════════════════ */}
        <Section title="Tab & Segmented Controls">
          <div className="space-y-4">
            <div>
              <StateLabel>Tab Control</StateLabel>
              <TabControl tabs={["Overview", "Fleets", "Systems", "Orders"]} active={activeTab} onChange={setActiveTab} />
            </div>
            <div>
              <StateLabel>Segmented Control (Mode Selector)</StateLabel>
              <div className="flex border-2 border-bronze/40 rounded-sm overflow-hidden bg-ivory w-fit">
                {["Diplomacy", "Military", "Production"].map((seg) => (
                  <button
                    key={seg}
                    onClick={() => setActiveSegment(seg)}
                    className={`
                      px-4 py-2 text-xs font-heading font-semibold uppercase tracking-wider
                      transition-all duration-150 border-r border-bronze/20 last:border-r-0
                      ${activeSegment === seg
                        ? "bg-crimson text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-ivory-dark"
                      }
                    `}
                  >
                    {seg}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ════════════════════════════════════════
           10. CONTEXT CARDS (Right Panel)
           ════════════════════════════════════════ */}
        <Section title="Context Cards">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <StateLabel>Default</StateLabel>
              <ImperialCard title="Aurelia Prime" subtitle="Core System">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Population</span>
                    <span className="font-semibold">4.2B</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Condition</span>
                    <StatusBadge variant="success">Stable</StatusBadge>
                  </div>
                  <ProgressBar label="Industry" value={78} max={100} color="bronze" />
                </div>
              </ImperialCard>
            </div>

            <div>
              <StateLabel>Warning State</StateLabel>
              <ImperialCard title="Novus Gate" subtitle="Frontier System" className="border-amber-400/60">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <StatusBadge variant="warning">Contested</StatusBadge>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Garrison</span>
                    <span className="font-semibold text-amber-700">Undermanned</span>
                  </div>
                  <ProgressBar label="Defense" value={28} max={100} color="crimson" />
                </div>
              </ImperialCard>
            </div>

            <div>
              <StateLabel>Critical / Alert</StateLabel>
              <ImperialCard title="Rim Sector 7" subtitle="Unknown Contact" className="border-crimson/60">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Threat</span>
                    <StatusBadge variant="danger">Priority Alpha</StatusBadge>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Signal</span>
                    <span className="font-semibold text-crimson">Non-human</span>
                  </div>
                  <AlertBadge type="critical">Immediate response required</AlertBadge>
                </div>
              </ImperialCard>
            </div>
          </div>
        </Section>

        {/* ════════════════════════════════════════
           11. NEWS STORY CARD
           ════════════════════════════════════════ */}
        <Section title="News Story Cards">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            {([
              { headline: "Border Skirmish at Novus Gate", category: "military", turn: 4, read: false, variant: "danger" as const },
              { headline: "Trade Compact Ratified", category: "diplomatic", turn: 4, read: false, variant: "info" as const },
              { headline: "Forge Expansion Complete", category: "economic", turn: 3, read: true, variant: "success" as const },
              { headline: "Senate Resolution 447 Passed", category: "event", turn: 3, read: true, variant: "warning" as const },
            ]).map((story) => (
              <div key={story.headline} className={`bg-ivory border rounded-sm p-3 space-y-1.5 bronze-glow-hover cursor-pointer transition-all ${story.read ? "border-border opacity-70" : "border-bronze/40"}`}>
                <div className="flex items-start justify-between">
                  <StatusBadge variant={story.variant}>{story.category}</StatusBadge>
                  <div className="flex items-center gap-1.5">
                    {!story.read && <span className="w-2 h-2 bg-crimson rounded-full" />}
                    <span className="text-[9px] text-muted-foreground">T{story.turn}</span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-accent leading-tight">{story.headline}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════
           12. MAP MARKERS
           ════════════════════════════════════════ */}
        <Section title="Map Markers">
          <div className="flex items-end gap-6 flex-wrap">
            {([
              { label: "Region (idle)", size: "w-5 h-5", shape: "rounded-full", cls: "bg-bronze/20 border-bronze/50" },
              { label: "Region (hover)", size: "w-5 h-5", shape: "rounded-full", cls: "bg-bronze/40 border-bronze shadow-sm shadow-bronze/20 scale-110" },
              { label: "Region (selected)", size: "w-5 h-5", shape: "rounded-full", cls: "bg-crimson/50 border-crimson shadow-md shadow-crimson/20 scale-125" },
              { label: "Fleet (idle)", size: "w-4 h-4", shape: "rotate-45", cls: "bg-crimson/30 border-crimson/60" },
              { label: "Fleet (selected)", size: "w-4 h-4", shape: "rotate-45", cls: "bg-crimson/50 border-crimson shadow-md shadow-crimson/20 scale-125" },
              { label: "Capital", size: "w-6 h-6", shape: "rounded-sm", cls: "bg-bronze/40 border-bronze" },
              { label: "Production", size: "w-4 h-4", shape: "rounded-sm", cls: "bg-amber-500/25 border-amber-600/50" },
            ]).map(({ label, size, shape, cls }) => (
              <div key={label} className="text-center">
                <StateLabel>{label}</StateLabel>
                <div className="flex items-center justify-center h-10">
                  <div className={`${size} ${shape} border-2 transition-all ${cls}`} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════
           13. REGION HIGHLIGHT STATES
           ════════════════════════════════════════ */}
        <Section title="Region Highlight States">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {([
              { label: "Neutral", bg: "bg-ivory-dark", border: "border-border", dot: "bg-bronze/20 border-bronze/50" },
              { label: "Friendly", bg: "bg-emerald-50/50", border: "border-emerald-300/50", dot: "bg-emerald-500/30 border-emerald-500" },
              { label: "Hostile", bg: "bg-red-50/50", border: "border-red-300/50", dot: "bg-crimson/30 border-crimson" },
              { label: "Contested", bg: "bg-amber-50/50", border: "border-amber-300/50", dot: "bg-amber-500/30 border-amber-500" },
            ]).map(({ label, bg, border, dot }) => (
              <div key={label} className="text-center">
                <StateLabel>{label}</StateLabel>
                <div className={`h-24 ${bg} border ${border} rounded-sm relative flex items-center justify-center`}>
                  <div className={`w-4 h-4 rounded-full border-2 ${dot}`} />
                  <span className="absolute bottom-2 text-[9px] font-heading uppercase tracking-wider text-muted-foreground">{label} Territory</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════
           14. OVERLAY VARIANTS (triggerable demos)
           ════════════════════════════════════════ */}
        <Section title="Overlay Variants">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {([
              { id: "compact", label: "Compact", desc: "35vh height", variant: "default" as const },
              { id: "standard", label: "Standard", desc: "55vh height", variant: "default" as const },
              { id: "expanded", label: "Expanded", desc: "80vh height", variant: "default" as const },
              { id: "cinematic", label: "Cinematic", desc: "92vh height", variant: "default" as const },
              { id: "critical", label: "Critical", desc: "Crimson accent", variant: "critical" as const },
            ]).map(({ id, label, desc, variant }) => (
              <button
                key={id}
                onClick={() => setOverlayOpen(id)}
                className={`
                  p-3 rounded-sm border text-left transition-all duration-150 bronze-glow-hover
                  ${variant === "critical"
                    ? "border-crimson/40 bg-crimson/[0.03] hover:border-crimson/60"
                    : "border-border bg-ivory hover:border-bronze/60"
                  }
                `}
              >
                <p className="text-xs font-heading font-semibold uppercase tracking-wider text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
          </div>

          {/* Overlay instances */}
          {(["compact", "standard", "expanded", "cinematic"] as const).map((size) => (
            <ImperialOverlay
              key={size}
              open={overlayOpen === size}
              onClose={() => setOverlayOpen(null)}
              title={`${size.charAt(0).toUpperCase() + size.slice(1)} Overlay`}
              subtitle={`Size variant: ${size}`}
              size={size}
              actions={[
                { label: "Cancel", variant: "cancel", onClick: () => setOverlayOpen(null) },
                { label: "Secondary", variant: "secondary", onClick: () => setOverlayOpen(null) },
                { label: "Confirm", variant: "primary", onClick: () => setOverlayOpen(null) },
              ]}
            >
              <div className="space-y-3">
                <p className="text-sm text-foreground">
                  This is the <strong>{size}</strong> overlay variant. The panel occupies{" "}
                  {size === "compact" ? "35%" : size === "standard" ? "55%" : size === "expanded" ? "80%" : "92%"} of viewport height.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <ImperialCard title="Sample Data">
                    <div className="space-y-2">
                      <ProgressBar label="Capacity" value={65} max={100} color="bronze" />
                      <ProgressBar label="Efficiency" value={82} max={100} color="bronze" />
                    </div>
                  </ImperialCard>
                  <ImperialCard title="Status">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">System</span><StatusBadge variant="success">Online</StatusBadge></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Alerts</span><StatusBadge variant="warning">1 Pending</StatusBadge></div>
                    </div>
                  </ImperialCard>
                </div>
              </div>
            </ImperialOverlay>
          ))}

          <ImperialOverlay
            open={overlayOpen === "critical"}
            onClose={() => setOverlayOpen(null)}
            title="⚠ Critical Action Required"
            subtitle="Destructive operation — cannot be undone"
            size="standard"
            variant="critical"
            actions={[
              { label: "Cancel", variant: "cancel", onClick: () => setOverlayOpen(null) },
              { label: "Confirm Destruction", variant: "destructive", onClick: () => setOverlayOpen(null) },
            ]}
          >
            <div className="space-y-4">
              <AlertBadge type="critical">This action will permanently disband the 1st Legion and scuttle all vessels.</AlertBadge>
              <div className="grid grid-cols-2 gap-3">
                <ImperialCard title="Fleet to Disband">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Fleet</span><span className="font-semibold">1st Legion</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Ships</span><span className="font-semibold text-crimson">12 (all lost)</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Salvage</span><span className="font-semibold">₡4,200</span></div>
                  </div>
                </ImperialCard>
                <ImperialCard title="Consequences">
                  <div className="space-y-2.5">
                    <ProgressBar label="Military Readiness" value={35} max={100} color="crimson" />
                    <ProgressBar label="Stability Impact" value={22} max={100} color="crimson" />
                    <ProgressBar label="Senate Standing" value={40} max={100} color="crimson" />
                  </div>
                </ImperialCard>
              </div>
            </div>
          </ImperialOverlay>
        </Section>

        {/* ════════════════════════════════════════
           COLOR PALETTE REFERENCE
           ════════════════════════════════════════ */}
        <Section title="Color Palette">
          <div className="flex gap-3 flex-wrap">
            {([
              { name: "Ivory", cls: "bg-ivory border-border" },
              { name: "Ivory Dark", cls: "bg-ivory-dark border-border" },
              { name: "Marble", cls: "bg-marble border-border" },
              { name: "Marble Dark", cls: "bg-marble-dark border-border" },
              { name: "Bronze", cls: "bg-bronze border-bronze-dark" },
              { name: "Bronze Light", cls: "bg-bronze-light border-bronze" },
              { name: "Bronze Dark", cls: "bg-bronze-dark border-bronze-dark" },
              { name: "Crimson", cls: "bg-crimson border-crimson" },
              { name: "Crimson Light", cls: "bg-crimson-light border-crimson" },
              { name: "Senate Dark", cls: "bg-senate-dark border-senate-dark" },
            ]).map(({ name, cls }) => (
              <div key={name} className="text-center">
                <div className={`w-16 h-16 rounded-sm border ${cls}`} />
                <p className="text-[9px] font-heading uppercase tracking-wider text-muted-foreground mt-1">{name}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════
           TYPOGRAPHY REFERENCE
           ════════════════════════════════════════ */}
        <Section title="Typography">
          <div className="space-y-3 max-w-lg">
            <div>
              <StateLabel>Heading — Space Grotesk</StateLabel>
              <h1 className="font-heading text-2xl font-bold text-foreground uppercase tracking-wider">Provincial Command</h1>
            </div>
            <div>
              <StateLabel>Subheading</StateLabel>
              <h3 className="font-heading text-sm font-semibold text-bronze-dark uppercase tracking-[0.15em]">MILITARY OVERVIEW</h3>
            </div>
            <div>
              <StateLabel>Body — Inter</StateLabel>
              <p className="text-sm text-foreground leading-relaxed">The Third Republic spans a vast network of star systems, bound together by ancient pacts and the iron will of its provincial governors.</p>
            </div>
            <div>
              <StateLabel>Caption / Label</StateLabel>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-heading font-semibold">Turn 4 · Valerian Provincial Command</p>
            </div>
            <div>
              <StateLabel>Laurel Divider</StateLabel>
              <div className="laurel-divider">❦</div>
            </div>
          </div>
        </Section>

        {/* Footer */}
        <div className="border-t border-border pt-6 pb-12 text-center">
          <p className="text-[10px] text-muted-foreground font-heading uppercase tracking-[0.2em]">
            Third Republic · Design System Reference · v1.0
          </p>
        </div>
      </div>
    </div>
  );
};

export default UIShowcase;
