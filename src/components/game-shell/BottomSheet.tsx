import { useState } from "react";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";
import { ImperialCard } from "./ImperialCard";
import { StatusBadge } from "./StatusBadge";

type SheetSize = "compact" | "standard" | "expanded";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
}

const SIZES: Record<SheetSize, string> = {
  compact: "h-32",
  standard: "h-64",
  expanded: "h-[50vh]",
};

export default function BottomSheet({ open, onClose }: BottomSheetProps) {
  const [size, setSize] = useState<SheetSize>("standard");

  if (!open) return null;

  const cycleSize = () => {
    const order: SheetSize[] = ["compact", "standard", "expanded"];
    const idx = order.indexOf(size);
    setSize(order[(idx + 1) % order.length]);
  };

  return (
    <div
      className={`
        ${SIZES[size]} bg-marble border-t-2 border-bronze/60
        transition-all duration-300 ease-out animate-slide-up
        relative z-20 flex flex-col
      `}
    >
      {/* Sheet header */}
      <div className="h-8 flex items-center justify-between px-4 border-b border-border shrink-0">
        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-bronze-dark">
          Turn Orders
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={cycleSize}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title={`Current: ${size}`}
          >
            {size === "expanded" ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sheet content */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <OrderCard title="Fleet Movement" count={3} status="pending" />
          <OrderCard title="Construction" count={5} status="confirmed" />
          <OrderCard title="Politics" count={1} status="warning" />
        </div>
      </div>
    </div>
  );
}

function OrderCard({ title, count, status }: { title: string; count: number; status: "pending" | "confirmed" | "warning" }) {
  const variants = { pending: "warning" as const, confirmed: "success" as const, warning: "danger" as const };
  return (
    <ImperialCard title={title}>
      <div className="flex items-center justify-between">
        <span className="text-2xl font-heading font-bold text-foreground">{count}</span>
        <StatusBadge variant={variants[status]}>
          {status === "pending" ? "Pending" : status === "confirmed" ? "Confirmed" : "Attention"}
        </StatusBadge>
      </div>
    </ImperialCard>
  );
}
