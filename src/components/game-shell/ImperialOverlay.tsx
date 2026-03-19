import { ReactNode, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/* ── Size & Variant Definitions ── */

export type OverlaySize = "compact" | "standard" | "expanded" | "cinematic";
export type OverlayVariant = "default" | "critical";

const SIZE_CLASSES: Record<OverlaySize, string> = {
  compact: "max-h-[35vh]",
  standard: "max-h-[55vh]",
  expanded: "max-h-[80vh]",
  cinematic: "max-h-[92vh]",
};

/* ── Props ── */

export interface OverlayAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "cancel" | "destructive";
}

export interface ImperialOverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: OverlaySize;
  variant?: OverlayVariant;
  actions?: OverlayAction[];
  twoColumn?: boolean;
  leftContent?: ReactNode;
  rightContent?: ReactNode;
  children?: ReactNode;
}

/* ── Component ── */

export default function ImperialOverlay({
  open,
  onClose,
  title,
  subtitle,
  size = "standard",
  variant = "default",
  actions,
  twoColumn = false,
  leftContent,
  rightContent,
  children,
}: ImperialOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Mount → animate in
  useEffect(() => {
    if (open) {
      setMounted(true);
      // RAF to ensure DOM paint before animating
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!mounted) return null;

  const isCritical = variant === "critical";
  const accentBorder = isCritical ? "border-crimson" : "border-bronze/60";
  const accentTopRail = isCritical
    ? "bg-gradient-to-r from-crimson/90 via-crimson to-crimson/90"
    : "bg-gradient-to-r from-bronze/80 via-bronze to-bronze/80";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className={`
          absolute inset-0 transition-all duration-300 ease-out
          ${visible ? "bg-senate-dark/60 backdrop-blur-[3px]" : "bg-transparent backdrop-blur-0"}
        `}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`
          relative z-10 w-full ${SIZE_CLASSES[size]}
          flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
          ${visible ? "translate-y-0" : "translate-y-full"}
        `}
      >
        {/* Bronze/Crimson top rail */}
        <div className={`h-1 ${accentTopRail} rounded-t-lg shrink-0`} />

        {/* Main panel body */}
        <div className={`
          flex-1 flex flex-col overflow-hidden
          bg-marble border-x-2 border-b-2 ${accentBorder}
          rounded-t-lg
        `}>
          {/* ── Header Bar ── */}
          <div className={`
            flex items-center justify-between px-5 py-3 shrink-0
            border-b ${isCritical ? "border-crimson/30 bg-crimson/[0.04]" : "border-border"}
          `}>
            <div className="space-y-0.5">
              <h2 className={`
                font-heading text-base font-bold uppercase tracking-wider
                ${isCritical ? "text-crimson" : "text-foreground"}
              `}>
                {title}
              </h2>
              {subtitle && (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className={`
                w-8 h-8 flex items-center justify-center rounded-sm
                border transition-colors
                ${isCritical
                  ? "border-crimson/30 text-crimson/60 hover:text-crimson hover:border-crimson/60"
                  : "border-bronze/30 text-muted-foreground hover:text-foreground hover:border-bronze/60"
                }
              `}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Content Area ── */}
          <div className="flex-1 overflow-y-auto">
            {twoColumn ? (
              <div className="flex h-full">
                <div className="flex-1 p-5 border-r border-border overflow-y-auto">
                  {leftContent}
                </div>
                <div className="flex-1 p-5 overflow-y-auto">
                  {rightContent}
                </div>
              </div>
            ) : (
              <div className="p-5">
                {children}
              </div>
            )}
          </div>

          {/* ── Action Bar ── */}
          {actions && actions.length > 0 && (
            <div className={`
              flex items-center justify-end gap-2 px-5 py-3 shrink-0
              border-t ${isCritical ? "border-crimson/30 bg-crimson/[0.03]" : "border-border bg-ivory-dark/50"}
            `}>
              {actions.map((action, i) => (
                <OverlayButton key={i} action={action} isCritical={isCritical} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Action Button ── */

function OverlayButton({ action, isCritical }: { action: OverlayAction; isCritical: boolean }) {
  const base = "px-4 py-2 text-xs font-heading font-semibold uppercase tracking-wider rounded-sm border transition-all duration-150";

  const styles: Record<string, string> = {
    primary: isCritical
      ? `${base} bg-crimson border-crimson text-primary-foreground hover:bg-crimson-light`
      : `${base} bg-crimson border-crimson text-primary-foreground hover:bg-crimson-light`,
    secondary: `${base} bg-ivory border-bronze/40 text-foreground hover:border-bronze hover:bg-ivory-dark bronze-glow-hover`,
    cancel: `${base} bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-bronze/40`,
    destructive: `${base} bg-red-700 border-red-700 text-white hover:bg-red-600`,
  };

  return (
    <button
      onClick={action.onClick}
      className={styles[action.variant || "primary"]}
    >
      {action.label}
    </button>
  );
}
