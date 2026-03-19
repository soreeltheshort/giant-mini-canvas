import { X } from "lucide-react";
import { ImperialCard } from "./ImperialCard";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";

interface RightPanelProps {
  open: boolean;
  onClose: () => void;
  title?: string;
}

export default function RightPanel({ open, onClose, title = "System Details" }: RightPanelProps) {
  if (!open) return null;

  return (
    <div className="w-80 bg-marble border-l-2 border-bronze/40 flex flex-col animate-fade-in relative z-20">
      {/* Panel header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border bronze-border-b">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-bronze-dark">
          {title}
        </h2>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* System info card */}
        <ImperialCard title="Aurelia Prime" subtitle="Core System">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Classification</span>
              <StatusBadge variant="success">Core World</StatusBadge>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Population</span>
              <span className="font-semibold">4.2B</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Condition</span>
              <span className="font-semibold">Stable</span>
            </div>
          </div>
        </ImperialCard>

        {/* Resources card */}
        <ImperialCard title="Resources">
          <div className="space-y-2.5">
            <ProgressBar label="Industry" value={78} max={100} color="bronze" />
            <ProgressBar label="Agriculture" value={45} max={100} color="success" />
            <ProgressBar label="Research" value={92} max={100} color="crimson" />
          </div>
        </ImperialCard>

        {/* Facilities card */}
        <ImperialCard title="Facilities">
          <div className="space-y-1.5">
            {["Orbital Dock", "Senate Hall", "Shield Array"].map((name) => (
              <div key={name} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                <span>{name}</span>
                <StatusBadge variant="info">Active</StatusBadge>
              </div>
            ))}
          </div>
        </ImperialCard>

        {/* Fleet presence */}
        <ImperialCard title="Fleet Presence">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span>1st Legion</span>
              <span className="text-bronze font-semibold">12 Ships</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Garrison</span>
              <span className="text-bronze font-semibold">4 Ships</span>
            </div>
          </div>
        </ImperialCard>
      </div>
    </div>
  );
}
