import { ReactNode, ButtonHTMLAttributes } from "react";

interface ImperialButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const VARIANTS = {
  primary:
    "bg-crimson text-primary-foreground border-crimson hover:bg-crimson-light bronze-glow-hover",
  secondary:
    "bg-ivory border-bronze/50 text-foreground hover:border-bronze hover:bg-ivory-dark bronze-glow-hover",
  ghost:
    "bg-transparent text-muted-foreground hover:text-foreground hover:bg-ivory-dark",
};

const SIZES = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-4 text-sm",
  lg: "h-10 px-6 text-sm font-semibold",
};

export function ImperialButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ImperialButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 font-heading
        border rounded-sm transition-all duration-150
        uppercase tracking-wider
        disabled:opacity-50 disabled:pointer-events-none
        ${VARIANTS[variant]} ${SIZES[size]} ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
