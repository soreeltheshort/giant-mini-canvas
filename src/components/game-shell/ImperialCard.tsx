import { ReactNode } from "react";

interface ImperialCardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function ImperialCard({ title, subtitle, children, className = "" }: ImperialCardProps) {
  return (
    <div className={`bg-ivory border border-border rounded-sm bronze-corners bronze-glow-hover ${className}`}>
      {title && (
        <div className="px-3 py-1.5 border-b border-border">
          <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-bronze-dark">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
      )}
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}
