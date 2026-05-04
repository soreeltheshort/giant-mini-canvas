import { ReactNode } from "react";

interface StatusBadgeProps {
  variant: "success" | "warning" | "danger" | "info" | "neutral";
  children: ReactNode;
}

const VARIANTS: Record<StatusBadgeProps["variant"], string> = {
  success: "text-muted-foreground",
  warning: "text-muted-foreground",
  danger: "text-accent",
  info: "text-muted-foreground",
  neutral: "text-muted-foreground",
};

export function StatusBadge({ variant, children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-semibold uppercase tracking-wider rounded-sm text-sm px-0 py-0 border-0 border-transparent bg-transparent ${VARIANTS[variant]}`}
    >
      {children}
    </span>
  );
}
