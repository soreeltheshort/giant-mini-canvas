import { AlertTriangle, Info, CheckCircle } from "lucide-react";
import { ReactNode } from "react";

interface AlertBadgeProps {
  type: "info" | "warning" | "success" | "critical";
  children: ReactNode;
}

const STYLES = {
  info: "bg-sky-50 border-sky-300 text-sky-800",
  warning: "bg-amber-50 border-amber-300 text-amber-800",
  success: "bg-emerald-50 border-emerald-300 text-emerald-800",
  critical: "bg-red-50 border-red-300 text-red-800",
};

const ICONS = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  critical: AlertTriangle,
};

export function AlertBadge({ type, children }: AlertBadgeProps) {
  const Icon = ICONS[type];
  return (
    <div className={`flex items-center gap-2 px-3 py-2 border rounded-sm text-xs ${STYLES[type]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
