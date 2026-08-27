/**
 * TurnBriefingOverlay — start-of-turn summary of everything that changed
 * during the previously processed turn. Auto-opens once per turn and can be
 * re-opened from the game header.
 */
import ImperialOverlay from "./ImperialOverlay";
import type { TurnBriefing, BriefingItem } from "@/lib/briefing/buildTurnBriefing";

interface Props {
  open: boolean;
  briefing: TurnBriefing | null;
  /** Called by the Acknowledge action (records the turn as seen). */
  onAcknowledge: () => void;
  /** Called when re-opened read-only and simply dismissed. */
  onClose: () => void;
  /** True when the player already acknowledged this turn's briefing. */
  reviewOnly?: boolean;
}

const toneClass = (tone?: BriefingItem["tone"]) =>
  tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-crimson" : "text-foreground";

export default function TurnBriefingOverlay({ open, briefing, onAcknowledge, onClose, reviewOnly = false }: Props) {
  if (!briefing) return null;

  const opening = briefing.reportedTurn <= 0;

  return (
    <ImperialOverlay
      open={open}
      onClose={reviewOnly ? onClose : onAcknowledge}
      title={`Turn ${briefing.turn} Briefing`}
      subtitle={`${briefing.factionName}${opening ? " — opening orders" : ` — report on turn ${briefing.reportedTurn}`}`}
      size="expanded"
      actions={[{ label: reviewOnly ? "Close" : "Acknowledge", onClick: reviewOnly ? onClose : onAcknowledge, variant: "primary" }]}
    >
      <div className="space-y-5">
        <p className="font-body font-medium text-sm text-muted-foreground border-l-2 border-bronze/60 pl-3">
          {opening
            ? "The Senate awaits your first dispatch. No prior turn has been processed."
            : briefing.lede}
        </p>

        {!opening && briefing.sections.map(section => (
          <section key={section.key}>
            <h3 className="font-heading text-xs font-bold uppercase tracking-[0.18em] text-crimson border-b border-bronze/40 pb-1 mb-2">
              {section.title}
            </h3>
            {section.unavailable ? (
              <p className="text-xs font-body font-medium text-muted-foreground italic">{section.unavailable}</p>
            ) : (
              <ul className="space-y-1.5">
                {section.items.map(item => (
                  <li key={item.id} className="text-sm font-body font-medium leading-snug">
                    <span className={toneClass(item.tone)}>{item.text}</span>
                    {item.detail && item.detail !== item.text && (
                      <span className="block text-xs text-muted-foreground">{item.detail}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {!opening && briefing.isEmpty && (
          <p className="text-sm font-body font-medium text-muted-foreground italic">
            No engagements, territorial changes, or completed works to report.
          </p>
        )}
      </div>
    </ImperialOverlay>
  );
}
