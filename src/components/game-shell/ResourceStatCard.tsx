import { ReactNode } from "react";

interface ResourceStatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
}

export function ResourceStatCard({ icon, label, value, change, trend = "neutral" }: ResourceStatCardProps) {
  const trendColor = trend === "up" ? "text-emerald-700" : trend === "down" ? "text-red-700" : "text-muted-foreground";
  return (
    <div className="bg-ivory border border-border rounded-sm p-3 bronze-corners bronze-glow-hover">
      <div className="flex items-start justify-between">
        <div className="w-7 h-7 flex items-center justify-center border border-bronze/30 rounded-sm bg-ivory-dark text-bronze">
          {icon}
        </div>
        {change && (
          <span className={`text-[10px] font-semibold ${trendColor}`}>{change}</span>
        )}
      </div>
      <p className="text-lg font-heading font-bold text-foreground mt-2 leading-none">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}
