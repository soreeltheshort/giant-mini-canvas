interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  color?: "bronze" | "crimson" | "success";
}

const BAR_COLORS = {
  bronze: "bg-bronze",
  crimson: "bg-crimson",
  success: "bg-emerald-600",
};

export function ProgressBar({ label, value, max, color = "bronze" }: ProgressBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="font-semibold text-accent">{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-sm overflow-hidden">
        <div
          className={`h-full ${BAR_COLORS[color]} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
