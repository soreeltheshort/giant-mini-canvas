import { ReactNode } from "react";

interface StatusBadgeProps {
  variant: "success" | "warning" | "danger" | "info" | "neutral";
  children: ReactNode;
}

const VARIANTS: Record<StatusBadgeProps["variant"], string> = {
  success: "bg-emerald-100 text-emerald-800 border-emerald-300",
  warning: "bg-amber-100 text-amber-800 border-amber-300",
  danger: "border-red-300 text-accent bg-transparent",
  info: "bg-sky-100 text-sky-800 border-sky-300",
  neutral: "bg-stone-100 text-stone-600 border-stone-300",
};

export function StatusBadge({ variant, children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border rounded-sm ${VARIANTS[variant]}`}
    >
      {children}
    </span>
  );
}
