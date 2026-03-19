interface TabControlProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export function TabControl({ tabs, active, onChange }: TabControlProps) {
  return (
    <div className="flex border border-border rounded-sm overflow-hidden bg-ivory">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`
            px-3 py-1.5 text-[10px] font-heading font-semibold uppercase tracking-wider
            transition-all duration-150 border-r border-border last:border-r-0
            ${active === tab
              ? "bg-crimson text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-ivory-dark"
            }
          `}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
