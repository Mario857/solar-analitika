"use client";

import { Bar } from "react-chartjs-2";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import { DerivedMonthlyData } from "@/lib/types";

interface EnergyChartsProps {
  sortedDays: string[];
  derived: DerivedMonthlyData;
  hasFusionSolar: boolean;
  hasConsumption: boolean;
}

const SELF_SUFFICIENCY_GOOD_THRESHOLD = 50;

export default function EnergyCharts({ sortedDays, derived, hasFusionSolar }: EnergyChartsProps) {
  const productionVsConsumptionData = {
    labels: sortedDays.map((day) => day.slice(8)),
    datasets: [
      ...(hasFusionSolar
        ? [
            {
              label: "Proizvodnja",
              data: derived.days.map((day) => +day.solarProduction.toFixed(2)),
              backgroundColor: "#e0783060",
              borderColor: "#e07830",
              borderWidth: 1,
              borderRadius: 3,
            },
            {
              label: "Samopotrošnja",
              data: derived.days.map((day) => +day.selfConsumed.toFixed(2)),
              backgroundColor: "#15b89a60",
              borderColor: "#15b89a",
              borderWidth: 1,
              borderRadius: 3,
            },
          ]
        : []),
      {
        label: "Potrošnja kuće",
        data: derived.days.map((day) => +day.householdTotal.toFixed(2)),
        backgroundColor: "#9050b040",
        borderColor: "#9050b0",
        borderWidth: 1,
        borderRadius: 3,
        type: "line" as const,
        tension: 0.3,
        pointRadius: 2,
        fill: false,
      },
    ] as never[],
  };

  const selfSufficiencyData = {
    labels: sortedDays.map((day) => day.slice(8)),
    datasets: [
      {
        label: "Samodostatnost %",
        data: derived.days.map((day) => +day.selfSufficiency.toFixed(1)),
        backgroundColor: derived.days.map((day) =>
          day.selfSufficiency > SELF_SUFFICIENCY_GOOD_THRESHOLD ? "#27c96a60" : "#e0404040"
        ),
        borderColor: derived.days.map((day) =>
          day.selfSufficiency > SELF_SUFFICIENCY_GOOD_THRESHOLD ? "#27c96a" : "#e04040"
        ),
        borderWidth: 1,
        borderRadius: 3,
      },
    ],
  };

  const sufficiencyChartOptions = {
    ...CHART_OPTIONS,
    scales: {
      ...CHART_OPTIONS.scales,
      y: { ...CHART_OPTIONS.scales.y, max: 100 },
    },
  };

  const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
  const sectionHeading = "font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4";

  return (
    <>
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Proizvodnja vs Potrošnja kuće</h3>
        <div className="relative w-full min-h-[220px] sm:min-h-[260px]">
          <Bar data={productionVsConsumptionData} options={CHART_OPTIONS} />
        </div>
      </div>
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Samodostatnost po danu (%)</h3>
        <div className="relative w-full min-h-[220px] sm:min-h-[260px]">
          <Bar data={selfSufficiencyData} options={sufficiencyChartOptions} />
        </div>
      </div>
    </>
  );
}
