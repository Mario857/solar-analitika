"use client";

import { DailyEnergyData, DerivedMonthlyData, BillBreakdown } from "@/lib/types";

interface InsightsProps {
  sortedDays: string[];
  dailyData: Record<string, DailyEnergyData>;
  derived: DerivedMonthlyData;
  hasFusionSolar: boolean;
  hasConsumption: boolean;
  bill: BillBreakdown | null;
  billWithoutSolar: number | null;
}

interface InsightItem {
  tag: string;
  tagClass: string;
  text: string;
}

const LOW_PRODUCTION_THRESHOLD_KWH = 0.5;
const LOW_SELF_CONSUMPTION_THRESHOLD = 30;

const TAG_STYLE_MAP: Record<string, string> = {
  solar: "bg-orange/20 text-orange",
  info: "bg-blue/20 text-blue",
  estimate: "bg-amber/20 text-amber",
  low: "bg-red/20 text-red",
  gap: "bg-red/20 text-red",
  currency: "bg-purple/20 text-purple",
};

export default function Insights({
  sortedDays,
  dailyData,
  derived,
  hasFusionSolar,
  hasConsumption,
  bill,
  billWithoutSolar,
}: InsightsProps) {
  const items: InsightItem[] = [];

  if (hasFusionSolar) {
    items.push({
      tag: "Solar",
      tagClass: "solar",
      text: `Paneli: ${derived.totalSolarProduction.toFixed(1)} kWh. Samopotrošnja: ${derived.totalSelfConsumed.toFixed(1)} kWh (${derived.selfConsumptionRate.toFixed(0)}%). U mrežu: ${derived.totalFeedIn.toFixed(1)} kWh.`,
    });
    items.push({
      tag: "Info",
      tagClass: "info",
      text: `Ukupno: ${derived.totalHousehold.toFixed(1)} kWh. Solar pokriva ${derived.selfSufficiency.toFixed(0)}%.`,
    });
    if (derived.selfConsumptionRate < LOW_SELF_CONSUMPTION_THRESHOLD) {
      items.push({
        tag: "Tip",
        tagClass: "estimate",
        text: `Samopotrošnja ${derived.selfConsumptionRate.toFixed(0)}% — razmislite o bateriji ili prebacivanju potrošnje 10–15h.`,
      });
    }
  }

  const lowProductionDays = sortedDays.filter((day) => dailyData[day].feedInKwh < LOW_PRODUCTION_THRESHOLD_KWH);
  if (lowProductionDays.length > 0 && lowProductionDays.length < sortedDays.length) {
    items.push({ tag: "Low", tagClass: "low", text: `${lowProductionDays.length} dana s min. proizvodnjom` });
  }

  let productionGapStart: string | null = null;
  for (let i = sortedDays.length - 1; i >= 0; i--) {
    if (dailyData[sortedDays[i]].feedInKwh > LOW_PRODUCTION_THRESHOLD_KWH) {
      if (i < sortedDays.length - 1) productionGapStart = sortedDays[i + 1];
      break;
    }
  }
  if (productionGapStart) {
    items.push({ tag: "Gap", tagClass: "gap", text: `Nula od ${productionGapStart}` });
  }

  if (hasConsumption && bill && billWithoutSolar) {
    const savings = billWithoutSolar - bill.total;
    items.push({
      tag: "€",
      tagClass: "currency",
      text: `Račun: ${bill.total.toFixed(2)}€ (neto ${bill.netBilledKwh.toFixed(0)} kWh). Bez solara: ~${billWithoutSolar.toFixed(0)}€. Ušteda: ${savings.toFixed(0)}€`,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="bg-surface-1 border border-border rounded-default p-8 mb-8">
      <h3 className="font-mono text-[0.8rem] font-semibold uppercase tracking-[1.5px] text-text-dim mb-5">Uvidi</h3>
      {items.map((item, index) => (
        <div key={index} className="text-[0.88rem] py-3 border-b border-border leading-[1.5] flex gap-4 items-baseline last:border-b-0">
          <span className={`inline-block font-mono text-[0.6rem] font-bold px-3 py-1.5 rounded-[4px] uppercase tracking-[0.5px] shrink-0 ${TAG_STYLE_MAP[item.tagClass] || ""}`}>{item.tag}</span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
