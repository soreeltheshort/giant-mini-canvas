import { useState } from "react";
import {
  Map, Sword, Building2, Users, ScrollText,
  BarChart3, Settings, MessageSquare,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "map", icon: Map, label: "Map" },
  { id: "fleets", icon: Sword, label: "Fleets" },
  { id: "systems", icon: Building2, label: "Systems" },
  { id: "diplomacy", icon: Users, label: "Politics" },
  { id: "orders", icon: ScrollText, label: "Orders" },
  { id: "reports", icon: BarChart3, label: "Reports" },
  { id: "messages", icon: MessageSquare, label: "Messages", badge: 3 },
];

interface NavRailProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function NavRail({ activeTab, onTabChange }: NavRailProps) {
  return (
    <nav className="w-14 bg-marble-dark border-r-2 border-bronze/40 flex flex-col items-center py-2 gap-1 relative z-20">
      {NAV_ITEMS.map((item) => {
        const active = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`
              relative w-10 h-10 flex flex-col items-center justify-center rounded-sm
              transition-all duration-150 group
              ${active
                ? "bg-crimson text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-ivory-dark bronze-glow-hover"
              }
            `}
            title={item.label}
          >
            <item.icon className="w-4 h-4" />
            <span className="text-[8px] font-medium mt-0.5 leading-none uppercase tracking-wider">
              {item.label}
            </span>
            {item.badge && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-crimson text-primary-foreground text-[9px] font-bold flex items-center justify-center rounded-sm">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}

      {/* Bottom settings */}
      <div className="mt-auto">
        <button
          className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-sm hover:bg-ivory-dark transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
}
