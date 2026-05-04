import { ReactNode } from "react";
import ImperialOverlay, { type ImperialOverlayProps } from "./ImperialOverlay";
import { ImperialCard } from "./ImperialCard";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";

/* ═══════════════════════════════════════════════════
   1. NEWS STORY OVERLAY
   ═══════════════════════════════════════════════════ */

export function NewsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ImperialOverlay
      open={open}
      onClose={onClose}
      title="Provincial Dispatch"
      subtitle="Turn 4 · Military Intelligence"
      size="standard"
      twoColumn
      leftContent={
        <div className="space-y-4">
          <h3 className="font-heading text-lg font-bold text-foreground">Border Skirmish at Novus Gate</h3>
          <div className="laurel-divider">❦</div>
          <div className="space-y-3 text-sm text-foreground leading-relaxed">
            <p>
              At 03:47 standard time, elements of the Aurelian frontier patrol detected multiple unidentified
              contacts approaching the Novus Gate relay station. The contacts were subsequently identified as
              raider-class vessels operating without transponder signals.
            </p>
            <p>
              The patrol commander, Praefectus Corvinus, ordered defensive formation and engaged the raiders
              at medium range. The exchange lasted approximately twelve minutes before the raiders broke
              contact and withdrew toward the outer rim.
            </p>
            <p>
              Casualties are reported as minimal — one Scutum-class frigate sustained moderate hull damage
              and has been recalled to Nova Castrum for repairs. Provincial command has raised the sector
              alert status from <strong>Vigilia</strong> to <strong>Custodia</strong>.
            </p>
          </div>
        </div>
      }
      rightContent={
        <div className="space-y-3">
          <ImperialCard title="Intelligence Assessment">
            <div className="space-y-2">
              <Row label="Threat Level"><StatusBadge variant="warning">Moderate</StatusBadge></Row>
              <Row label="Raider Vessels" value="4–6 confirmed" />
              <Row label="Friendly Losses" value="1 frigate (repairable)" />
              <Row label="Sector Status"><StatusBadge variant="danger">Custodia</StatusBadge></Row>
            </div>
          </ImperialCard>

          <ImperialCard title="Affected Systems">
            <div className="space-y-1.5">
              {["Novus Gate", "Sector Aurelian-7", "Relay Station Gamma"].map((s) => (
                <div key={s} className="text-xs py-1 border-b border-border last:border-0 text-foreground">{s}</div>
              ))}
            </div>
          </ImperialCard>

          <ImperialCard title="Recommended Actions">
            <ul className="space-y-1.5 text-xs text-foreground">
              <li className="flex items-start gap-1.5">
                <span className="text-bronze mt-0.5">▸</span>
                Reinforce Novus Gate garrison
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-bronze mt-0.5">▸</span>
                Deploy scout squadron to rim sector
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-bronze mt-0.5">▸</span>
                Issue diplomatic inquiry to Aurelian command
              </li>
            </ul>
          </ImperialCard>
        </div>
      }
      actions={[
        { label: "Dismiss", variant: "cancel", onClick: onClose },
        { label: "Mark Read", variant: "secondary", onClick: onClose },
      ]}
    />
  );
}

/* ═══════════════════════════════════════════════════
   2. DIPLOMACY NEGOTIATION OVERLAY
   ═══════════════════════════════════════════════════ */

export function DiplomacyOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ImperialOverlay
      open={open}
      onClose={onClose}
      title="Diplomatic Negotiation"
      subtitle="Cassian Trade Compact · Bilateral Treaty"
      size="expanded"
      twoColumn
      leftContent={
        <div className="space-y-4">
          <ImperialCard title="Treaty Terms">
            <div className="space-y-3 text-sm text-foreground leading-relaxed">
              <p>
                The Province of Cassian proposes a bilateral trade compact with the following terms,
                effective for a duration of six turns from ratification:
              </p>
              <div className="space-y-2 border-l-2 border-bronze/30 pl-3">
                <TermItem n="I" text="Preferential tariff rate of 8% on refined cinders (reduced from 15%)" />
                <TermItem n="II" text="Mutual most-favored-province status for military-grade alloy shipments" />
                <TermItem n="III" text="Joint patrol authority in the shared border sector Cassian-Valerian-3" />
                <TermItem n="IV" text="Non-aggression clause for the treaty duration with 2-turn withdrawal notice" />
              </div>
            </div>
          </ImperialCard>

          <ImperialCard title="Historical Relations">
            <div className="space-y-2">
              <Row label="Previous Treaties" value="2 (both completed)" />
              <Row label="Trade Volume (6T)" value="₡14,200" />
              <Row label="Border Incidents" value="0" />
              <Row label="Senate Alignment" value="Cooperative" />
            </div>
          </ImperialCard>
        </div>
      }
      rightContent={
        <div className="space-y-3">
          <ImperialCard title="Cassian Province">
            <div className="space-y-2">
              <Row label="Governor" value="Princeps Cassia Tertia" />
              <Row label="Disposition"><StatusBadge variant="success">Friendly</StatusBadge></Row>
              <Row label="Military Posture"><StatusBadge variant="info">Defensive</StatusBadge></Row>
              <Row label="Economic Strength" value="Strong" />
            </div>
          </ImperialCard>

          <ImperialCard title="Impact Projection">
            <div className="space-y-2.5">
              <ProgressBar label="Trade Revenue" value={82} max={100} color="bronze" />
              <ProgressBar label="Political Capital" value={15} max={100} color="bronze" />
              <ProgressBar label="Security Risk" value={8} max={100} color="crimson" />
            </div>
          </ImperialCard>

          <ImperialCard title="Counter-Proposal Options">
            <div className="space-y-1.5">
              {["Accept as written", "Request extended duration (8 turns)", "Add research exchange clause", "Reject and counter"].map((opt, i) => (
                <label key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-sm hover:bg-ivory-dark cursor-pointer transition-colors">
                  <input type="radio" name="counter" className="accent-crimson" defaultChecked={i === 0} />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </ImperialCard>
        </div>
      }
      actions={[
        { label: "Decline", variant: "cancel", onClick: onClose },
        { label: "Counter-Propose", variant: "secondary", onClick: onClose },
        { label: "Ratify Treaty", variant: "primary", onClick: onClose },
      ]}
    />
  );
}

/* ═══════════════════════════════════════════════════
   3. MILITARY ORDER OVERLAY
   ═══════════════════════════════════════════════════ */

export function MilitaryOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ImperialOverlay
      open={open}
      onClose={onClose}
      title="Fleet Movement Order"
      subtitle="1st Legion · Legatus Varro Commanding"
      size="standard"
      twoColumn
      leftContent={
        <div className="space-y-3">
          <ImperialCard title="Fleet Status">
            <div className="space-y-2">
              <Row label="Fleet" value="1st Legion" />
              <Row label="Commander" value="Legatus Varro" />
              <Row label="Current Position" value="Aurelia Prime" />
              <Row label="Status"><StatusBadge variant="info">Stationed</StatusBadge></Row>
              <ProgressBar label="Strength" value={12} max={16} color="bronze" />
              <ProgressBar label="Morale" value={88} max={100} color="bronze" />
              <ProgressBar label="Supply" value={72} max={100} color="bronze" />
            </div>
          </ImperialCard>

          <ImperialCard title="Composition">
            <div className="space-y-1.5">
              {[
                { name: "Trireme-class Cruiser", count: 4 },
                { name: "Corvus-class Destroyer", count: 6 },
                { name: "Aquila-class Fighter Wing", count: 2 },
              ].map((s) => (
                <div key={s.name} className="flex justify-between text-xs py-1 border-b border-border last:border-0">
                  <span>{s.name}</span>
                  <span className="font-semibold text-bronze">×{s.count}</span>
                </div>
              ))}
            </div>
          </ImperialCard>
        </div>
      }
      rightContent={
        <div className="space-y-3">
          <ImperialCard title="Movement Order">
            <div className="space-y-2">
              <Row label="Origin" value="Aurelia Prime" />
              <Row label="Destination" value="Novus Gate" />
              <Row label="Transit Time" value="2 turns" />
              <Row label="Fuel Cost" value="340 cinders" />
            </div>
          </ImperialCard>

          <ImperialCard title="Standing Orders">
            <div className="space-y-1.5">
              {["Patrol & Defend", "Aggressive Patrol", "Intercept & Engage", "Hold Position"].map((order, i) => (
                <label key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-sm hover:bg-ivory-dark cursor-pointer transition-colors">
                  <input type="radio" name="standing" className="accent-crimson" defaultChecked={i === 0} />
                  <span>{order}</span>
                </label>
              ))}
            </div>
          </ImperialCard>

          <ImperialCard title="Projected Arrival">
            <div className="space-y-2">
              <Row label="ETA" value="Turn 6" />
              <Row label="Threat Assessment"><StatusBadge variant="warning">Moderate</StatusBadge></Row>
              <Row label="Supply on Arrival" value="58%" />
            </div>
          </ImperialCard>
        </div>
      }
      actions={[
        { label: "Cancel", variant: "cancel", onClick: onClose },
        { label: "Issue Order", variant: "primary", onClick: onClose },
      ]}
    />
  );
}

/* ═══════════════════════════════════════════════════
   4. PRODUCTION QUEUE OVERLAY
   ═══════════════════════════════════════════════════ */

export function ProductionOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queue = [
    { item: "Corvus-class Destroyer", turns: 3, cost: "₡2,400", progress: 35 },
    { item: "Shield Generator Mk.II", turns: 1, cost: "₡800", progress: 80 },
    { item: "Orbital Sensor Array", turns: 4, cost: "₡1,600", progress: 0 },
  ];

  return (
    <ImperialOverlay
      open={open}
      onClose={onClose}
      title="Production Management"
      subtitle="Imperial Forge · Aurelia Prime Orbit"
      size="standard"
      twoColumn
      leftContent={
        <div className="space-y-3">
          <ImperialCard title="Facility Status">
            <div className="space-y-2">
              <Row label="Facility" value="Imperial Forge" />
              <Row label="Type" value="Orbital Forge-Complex" />
              <Row label="Status"><StatusBadge variant="success">Operational</StatusBadge></Row>
              <ProgressBar label="Output" value={42} max={60} color="bronze" />
              <ProgressBar label="Efficiency" value={78} max={100} color="bronze" />
            </div>
          </ImperialCard>

          <ImperialCard title="Available for Construction">
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {[
                { name: "Trireme-class Cruiser", cost: "₡4,800", time: "5T" },
                { name: "Corvus-class Destroyer", cost: "₡2,400", time: "3T" },
                { name: "Scutum-class Frigate", cost: "₡1,200", time: "2T" },
                { name: "Orbital Dock Expansion", cost: "₡3,200", time: "4T" },
                { name: "Cinder Refinery Upgrade", cost: "₡1,800", time: "3T" },
              ].map((b) => (
                <div key={b.name} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                  <span>{b.name}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{b.cost}</span>
                    <span>{b.time}</span>
                    <button className="text-crimson hover:text-crimson-light font-semibold">+</button>
                  </div>
                </div>
              ))}
            </div>
          </ImperialCard>
        </div>
      }
      rightContent={
        <div className="space-y-3">
          <ImperialCard title="Build Queue">
            <div className="space-y-3">
              {queue.map((q, i) => (
                <div key={i} className="space-y-1.5 pb-2.5 border-b border-border last:border-0 last:pb-0">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold">{q.item}</span>
                    <span className="text-muted-foreground">{q.cost}</span>
                  </div>
                  <ProgressBar label={`${q.turns}T remaining`} value={q.progress} max={100} color="bronze" />
                </div>
              ))}
            </div>
          </ImperialCard>

          <ImperialCard title="Queue Summary">
            <div className="space-y-2">
              <Row label="Total Items" value="3" />
              <Row label="Total Cost" value="₡4,800" />
              <Row label="Completion" value="Turn 11" />
              <Row label="Queue Capacity" value="3 / 5" />
            </div>
          </ImperialCard>
        </div>
      }
      actions={[
        { label: "Cancel", variant: "cancel", onClick: onClose },
        { label: "Clear Queue", variant: "secondary", onClick: onClose },
        { label: "Confirm Queue", variant: "primary", onClick: onClose },
      ]}
    />
  );
}

/* ═══════════════════════════════════════════════════
   5. MAJOR EVENT OVERLAY
   ═══════════════════════════════════════════════════ */

export function MajorEventOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ImperialOverlay
      open={open}
      onClose={onClose}
      title="⚠ Alien Contact — Rim Sector"
      subtitle="Priority Alpha · Senate Emergency Protocol"
      size="cinematic"
      variant="critical"
      twoColumn
      leftContent={
        <div className="space-y-4">
          <div className="border-2 border-crimson/20 rounded-sm p-4 bg-crimson/[0.03]">
            <p className="text-[10px] uppercase tracking-[0.2em] text-crimson font-heading font-semibold mb-2">
              ⬥ Priority Alpha Transmission ⬥
            </p>
            <h3 className="font-heading text-xl font-bold text-foreground mb-3">
              Unidentified Xenological Contact
            </h3>
            <div className="laurel-divider text-crimson/40">⚠</div>
          </div>

          <div className="space-y-3 text-sm text-foreground leading-relaxed">
            <p>
              Deep-range sensor arrays in Rim Sector 7-Omega have confirmed contact with non-human
              intelligence. The signal source has been triangulated to a position beyond the established
              frontier, approximately 14 light-hours from the nearest Republican outpost.
            </p>
            <p>
              Initial analysis by the Collegium Scientiae indicates the transmissions are structured,
              repetitive, and do not match any known natural phenomenon. The pattern suggests deliberate
              communication attempts directed toward Republican space.
            </p>
            <p>
              The Senate has invoked Emergency Protocol Septimus, granting provincial governors
              expanded authority to respond to the contact. All provinces are required to submit
              a response posture within the current turn cycle.
            </p>
          </div>

          <ImperialCard title="Signal Analysis">
            <div className="space-y-2">
              <Row label="Signal Origin" value="Rim Sector 7-Omega" />
              <Row label="Signal Type" value="Structured / Non-natural" />
              <Row label="Distance" value="14 light-hours" />
              <Row label="First Detection" value="Turn 2" />
              <Row label="Confirmation" value="Turn 4 (current)" />
              <Row label="Classification"><StatusBadge variant="danger">Priority Alpha</StatusBadge></Row>
            </div>
          </ImperialCard>
        </div>
      }
      rightContent={
        <div className="space-y-3">
          <div className="border-2 border-crimson/20 rounded-sm p-4 bg-crimson/[0.03]">
            <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-crimson mb-3">
              Provincial Response Required
            </h3>
            <p className="text-xs text-foreground leading-relaxed mb-3">
              Select your province's official response posture. This decision will affect
              inter-provincial relations, military readiness, and Senate standing.
            </p>
            <div className="space-y-2">
              {[
                { label: "Defensive Mobilization", desc: "Reinforce frontier positions, recall patrols, raise alert to maximum" },
                { label: "Diplomatic Initiative", desc: "Dispatch contact delegation with military escort, attempt communication" },
                { label: "Aggressive Interdiction", desc: "Deploy strike force to signal origin, establish exclusion zone" },
                { label: "Observation & Analysis", desc: "Deploy sensor platforms, gather intelligence, maintain current posture" },
              ].map((opt, i) => (
                <label key={i} className="flex items-start gap-2 text-xs p-2.5 rounded-sm border border-border hover:border-crimson/30 hover:bg-crimson/[0.02] cursor-pointer transition-colors">
                  <input type="radio" name="response" className="accent-crimson mt-0.5" defaultChecked={i === 3} />
                  <div>
                    <span className="font-semibold block">{opt.label}</span>
                    <span className="text-muted-foreground text-[10px] leading-relaxed">{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <ImperialCard title="Projected Consequences">
            <div className="space-y-2.5">
              <ProgressBar label="Military Readiness Impact" value={65} max={100} color="crimson" />
              <ProgressBar label="Senate Approval" value={45} max={100} color="bronze" />
              <ProgressBar label="Provincial Stability" value={38} max={100} color="crimson" />
              <ProgressBar label="Intelligence Gain" value={82} max={100} color="bronze" />
            </div>
          </ImperialCard>
        </div>
      }
      actions={[
        { label: "Defer (Lose Influence)", variant: "cancel", onClick: onClose },
        { label: "Submit Response", variant: "destructive", onClick: onClose },
      ]}
    />
  );
}

/* ── Helpers ── */
function Row({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children || <span className="font-semibold text-accent">{value}</span>}
    </div>
  );
}

function TermItem({ n, text }: { n: string; text: string }) {
  return (
    <p className="text-xs">
      <span className="font-heading font-bold text-bronze mr-1.5">{n}.</span>
      {text}
    </p>
  );
}
