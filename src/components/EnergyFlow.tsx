"use client";

import { DerivedMonthlyData } from "@/lib/types";

interface EnergyFlowProps {
  derived: DerivedMonthlyData;
  hasFusionSolar: boolean;
}

export default function EnergyFlow({ derived, hasFusionSolar }: EnergyFlowProps) {
  const panelValue = hasFusionSolar ? `${derived.totalSolarProduction.toFixed(1)} kWh` : "N/A kWh";
  const netGridFlow = (derived.totalConsumed - derived.totalFeedIn).toFixed(0);

  const summaryContent = hasFusionSolar ? (
    <>
      Samopotrošnja: <b style={{ color: "#15b89a" }}>{derived.selfConsumptionRate.toFixed(0)}%</b> |
      Samodostatnost: <b style={{ color: "#27c96a" }}>{derived.selfSufficiency.toFixed(0)}%</b>
    </>
  ) : (
    "Povežite FusionSolar za punu analizu"
  );

  return (
    <div className="bg-surface-1 border border-border rounded-default p-8 mb-8">
      <h3 className="font-mono text-[0.8rem] font-semibold uppercase tracking-[1.5px] text-text-dim mb-5">Energetski tok — mjesečni</h3>
      <div className="flex justify-center items-center gap-6 py-8 px-4 flex-wrap">
        <div className="bg-surface-2 border border-border-accent rounded-default py-6 px-7 text-center min-w-[140px]">
          <div className="font-mono text-[0.65rem] uppercase tracking-[1px] text-text-dim mb-2">☀ Paneli</div>
          <div className="font-mono text-[1.2rem] font-bold" style={{ color: "#e07830" }}>{panelValue}</div>
        </div>
        <div className="text-[1.6rem] text-text-dim">→</div>
        <div className="bg-surface-2 border border-border-accent rounded-default py-6 px-7 text-center min-w-[140px]">
          <div className="font-mono text-[0.65rem] uppercase tracking-[1px] text-text-dim mb-2">🏠 Kuća</div>
          <div className="font-mono text-[1.2rem] font-bold" style={{ color: "#9050b0" }}>{derived.totalHousehold.toFixed(1)} kWh</div>
          <div className="font-mono text-[0.72rem] text-text-dim leading-normal mt-3">samopotr: {derived.totalSelfConsumed.toFixed(1)}</div>
        </div>
        <div className="text-[1.6rem] text-text-dim">↔</div>
        <div className="bg-surface-2 border border-border-accent rounded-default py-6 px-7 text-center min-w-[140px]">
          <div className="font-mono text-[0.65rem] uppercase tracking-[1px] text-text-dim mb-2">⚡ Mreža</div>
          <div className="font-mono text-[1.2rem] font-bold" style={{ color: "#3090d8" }}>
            ↓{derived.totalConsumed.toFixed(0)} ↑{derived.totalFeedIn.toFixed(0)}
          </div>
          <div className="font-mono text-[0.72rem] text-text-dim leading-normal mt-3">neto: {netGridFlow} kWh</div>
        </div>
      </div>
      <div className="font-mono text-[0.72rem] text-text-dim leading-normal mt-4 text-center">{summaryContent}</div>
    </div>
  );
}
