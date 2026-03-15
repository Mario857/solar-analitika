"use client";

import { useState, useEffect } from "react";
import { DailyEnergyData, DerivedMonthlyData, BillBreakdown } from "@/lib/types";

interface CardsProps {
  sortedDays: string[];
  dailyData: Record<string, DailyEnergyData>;
  derived: DerivedMonthlyData;
  bill: BillBreakdown | null;
  billWithoutSolar: number | null;
  hasFusionSolar: boolean;
  hasConsumption: boolean;
}

interface CardDefinition {
  label: string;
  value: string;
  subtitle: string;
  colorClass: string;
}

const CARD_ANIMATION_DELAY_MS = 40;
const SAVINGS_DISPLAY_THRESHOLD = 1;

const VALUE_COLOR_MAP: Record<string, string> = {
  "accent-blue": "text-blue",
  "accent-green": "text-green",
  "accent-purple": "text-purple",
  "accent-cyan": "text-cyan",
  "accent-orange": "text-orange",
};

export default function Cards({
  sortedDays,
  dailyData,
  derived,
  bill,
  billWithoutSolar,
  hasFusionSolar,
  hasConsumption,
}: CardsProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  const savings = bill && billWithoutSolar ? billWithoutSolar - bill.total : 0;
  const peakGenerationKw = Math.max(...sortedDays.map((day) => dailyData[day].peakGenerationKw));
  const peakGenerationDay = sortedDays.find((day) => dailyData[day].peakGenerationKw === peakGenerationKw);

  const cards: CardDefinition[] = [
    ...(hasFusionSolar
      ? [{ label: "Proizvodnja panela", value: derived.totalSolarProduction.toFixed(1), subtitle: "kWh (FusionSolar)", colorClass: "accent-orange" }]
      : []),
    { label: "Predano u mrežu", value: derived.totalFeedIn.toFixed(1), subtitle: "kWh", colorClass: "" },
    ...(hasConsumption
      ? [{ label: "Preuzeto iz mreže", value: derived.totalConsumed.toFixed(1), subtitle: "kWh", colorClass: "accent-blue" }]
      : []),
    ...(hasConsumption && bill
      ? [{ label: "Neto obračun", value: bill.netBilledKwh.toFixed(0), subtitle: "kWh (za HEP račun)", colorClass: bill.netBilledKwh < derived.totalConsumed ? "accent-green" : "" }]
      : []),
    ...(hasFusionSolar
      ? [{ label: "Samopotrošnja", value: derived.totalSelfConsumed.toFixed(1), subtitle: `kWh (${derived.selfConsumptionRate.toFixed(0)}% proizv.)`, colorClass: "accent-cyan" }]
      : []),
    ...(hasFusionSolar
      ? [{ label: "Potrošnja kuće", value: derived.totalHousehold.toFixed(1), subtitle: "kWh ukupno", colorClass: "accent-purple" }]
      : []),
    ...(hasFusionSolar && derived.selfSufficiency > 0
      ? [{ label: "Samodostatnost", value: derived.selfSufficiency.toFixed(0) + "%", subtitle: "solar pokriva", colorClass: "accent-green" }]
      : []),
    { label: "Vršna snaga", value: peakGenerationKw.toFixed(2), subtitle: `kW ${peakGenerationDay?.slice(5) || ""}`, colorClass: "" },
    ...(hasConsumption && bill
      ? [{ label: "Račun", value: bill.total.toFixed(2), subtitle: "€ s PDV", colorClass: "accent-purple" }]
      : []),
    ...(savings > SAVINGS_DISPLAY_THRESHOLD
      ? [{ label: "Ušteda", value: savings.toFixed(0), subtitle: "€/mj", colorClass: "accent-green" }]
      : []),
  ];

  const getValueClasses = (colorClass: string) => {
    const base = "font-mono text-[1.4rem] font-bold leading-[1.1]";
    const color = VALUE_COLOR_MAP[colorClass] || "text-amber";
    return `${base} ${color}`;
  };

  // Animate cards appearing one by one via React state
  useEffect(() => {
    setVisibleCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < cards.length; i++) {
      timers.push(setTimeout(() => setVisibleCount(i + 1), i * CARD_ANIMATION_DELAY_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [cards.length]);

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 mb-8">
      {cards.map((card, index) => {
        const isVisible = index < visibleCount;
        return (
          <div
            key={index}
            className={`metric-card ${card.colorClass} bg-surface-1 border border-border rounded-default px-6 py-5 opacity-0 translate-y-2 transition-all duration-300 ease-in-out${isVisible ? " opacity-100! translate-y-0!" : ""}`}
          >
            <div className="font-mono text-[0.65rem] uppercase tracking-[1.5px] text-text-dim mb-2">{card.label}</div>
            <div className={getValueClasses(card.colorClass)}>{card.value}</div>
            <div className="font-mono text-[0.72rem] text-text-dim mt-2">{card.subtitle}</div>
          </div>
        );
      })}
    </div>
  );
}
