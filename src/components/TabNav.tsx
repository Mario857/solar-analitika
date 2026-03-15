"use client";

type TabId = "dash" | "yearly" | "energy" | "hourly" | "optimize" | "battery" | "roi" | "bill" | "table" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "dash", label: "Dashboard" },
  { id: "yearly", label: "Godišnji" },
  { id: "energy", label: "Energetski tok" },
  { id: "hourly", label: "Satni profil" },
  { id: "optimize", label: "Optimizacija" },
  { id: "battery", label: "Baterija" },
  { id: "roi", label: "ROI" },
  { id: "bill", label: "Račun" },
  { id: "table", label: "Tablica" },
  { id: "settings", label: "Postavke" },
];

interface TabNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export default function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`font-mono text-xs font-medium px-3 py-1.5 rounded-sm border border-border bg-transparent text-text-dim cursor-pointer whitespace-nowrap transition-all duration-150 hover:text-text${activeTab === t.id ? " bg-amber! text-background! border-amber! font-bold!" : ""}`}
          onClick={() => onTabChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
