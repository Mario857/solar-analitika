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
    <div className="bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8">
      <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4">Energetski tok — mjesečni</h3>
      <div className="flex justify-center items-center gap-3 sm:gap-6 py-4 sm:py-8 px-2 sm:px-4 flex-wrap">
        <div className="bg-surface-2 border border-border-accent rounded-default py-4 px-5 sm:py-6 sm:px-7 text-center min-w-[120px] sm:min-w-[140px]">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1.5">☀ Paneli</div>
          <div className="font-mono text-base sm:text-lg font-bold" style={{ color: "#e07830" }}>{panelValue}</div>
        </div>
        <div className="text-xl sm:text-2xl text-text-dim">→</div>
        <div className="bg-surface-2 border border-border-accent rounded-default py-4 px-5 sm:py-6 sm:px-7 text-center min-w-[120px] sm:min-w-[140px]">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1.5">🏠 Kuća</div>
          <div className="font-mono text-base sm:text-lg font-bold" style={{ color: "#9050b0" }}>{derived.totalHousehold.toFixed(1)} kWh</div>
          <div className="font-mono text-xs text-text-dim leading-normal mt-2">samopotr: {derived.totalSelfConsumed.toFixed(1)}</div>
        </div>
        <div className="text-xl sm:text-2xl text-text-dim">↔</div>
        <div className="bg-surface-2 border border-border-accent rounded-default py-4 px-5 sm:py-6 sm:px-7 text-center min-w-[120px] sm:min-w-[140px]">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1.5">⚡ Mreža</div>
          <div className="font-mono text-base sm:text-lg font-bold" style={{ color: "#3090d8" }}>
            ↓{derived.totalConsumed.toFixed(0)} ↑{derived.totalFeedIn.toFixed(0)}
          </div>
          <div className="font-mono text-xs text-text-dim leading-normal mt-2">neto: {netGridFlow} kWh</div>
        </div>
      </div>
      <div className="font-mono text-xs text-text-dim leading-normal mt-3 text-center">{summaryContent}</div>
    </div>
  );
}
