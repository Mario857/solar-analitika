"use client";

import { DailyEnergyData, DerivedMonthlyData } from "@/lib/types";

interface DataTableProps {
  dailyData: Record<string, DailyEnergyData>;
  derived: DerivedMonthlyData;
  hasFusionSolar: boolean;
  hasConsumption: boolean;
}

const LOW_PRODUCTION_THRESHOLD = 0.5;

export default function DataTable({ dailyData, derived, hasFusionSolar, hasConsumption }: DataTableProps) {
  return (
    <div className="bg-surface-1 border border-border rounded-default p-8 mb-8">
      <h3 className="font-mono text-[0.8rem] font-semibold uppercase tracking-[1.5px] text-text-dim mb-5">Dnevni pregled</h3>
      <div className="max-h-[500px] overflow-y-auto overflow-x-auto scrollbar-hide">
        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th className="text-right">Fusion kWh</th>
              <th className="text-right">Pred. kWh</th>
              <th className="text-right">Preuz. kWh</th>
              <th className="text-right">Samopotr.</th>
              <th className="text-right">Kuća kWh</th>
              <th className="text-right">Samodost.</th>
              <th className="text-right">Vrh gen</th>
            </tr>
          </thead>
          <tbody>
            {derived.days.map((dayMetrics) => {
              const dayData = dailyData[dayMetrics.date];
              const isDimmed = dayMetrics.solarProduction < LOW_PRODUCTION_THRESHOLD && dayMetrics.feedIn < LOW_PRODUCTION_THRESHOLD;
              const selfConsumptionDisplay = hasFusionSolar
                ? `${dayMetrics.selfConsumed.toFixed(2)} (${dayMetrics.selfConsumptionRate.toFixed(0)}%)`
                : "—";
              const sufficiencyDisplay = hasFusionSolar ? `${dayMetrics.selfSufficiency.toFixed(0)}%` : "—";

              return (
                <tr key={dayMetrics.date} className={isDimmed ? "opacity-40" : ""}>
                  <td>{dayMetrics.date}</td>
                  <td className="text-right text-orange font-semibold">{hasFusionSolar ? dayMetrics.solarProduction.toFixed(2) : "—"}</td>
                  <td className="text-right text-amber font-semibold">{dayMetrics.feedIn.toFixed(2)}</td>
                  <td className="text-right text-blue font-semibold">{hasConsumption ? dayMetrics.consumed.toFixed(2) : "—"}</td>
                  <td className="text-right text-cyan font-semibold">{selfConsumptionDisplay}</td>
                  <td className="text-right">{dayMetrics.householdTotal.toFixed(2)}</td>
                  <td className="text-right text-green font-semibold">{sufficiencyDisplay}</td>
                  <td className="text-right">
                    {dayData.peakGenerationKw.toFixed(2)} @ {dayData.peakGenerationTime || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
