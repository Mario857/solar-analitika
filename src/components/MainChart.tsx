"use client";

import { Bar } from "react-chartjs-2";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import { DailyEnergyData, DerivedMonthlyData } from "@/lib/types";

interface MainChartProps {
  sortedDays: string[];
  dailyData: Record<string, DailyEnergyData>;
  derived: DerivedMonthlyData;
  hasFusionSolar: boolean;
  hasConsumption: boolean;
}

export default function MainChart({ sortedDays, dailyData, derived, hasFusionSolar, hasConsumption }: MainChartProps) {
  const chartData = {
    labels: sortedDays.map((day) => day.slice(8)),
    datasets: [
      ...(hasFusionSolar
        ? [
            {
              label: "Proizvodnja (FS)",
              data: derived.days.map((day) => +day.solarProduction.toFixed(2)),
              backgroundColor: "#e0783060",
              borderColor: "#e07830",
              borderWidth: 1,
              borderRadius: 3,
            },
          ]
        : []),
      {
        label: "Predano",
        data: sortedDays.map((day) => +dailyData[day].feedInKwh.toFixed(2)),
        backgroundColor: "#f0a42080",
        borderColor: "#f0a420",
        borderWidth: 1,
        borderRadius: 3,
      },
      ...(hasConsumption
        ? [
            {
              label: "Preuzeto",
              data: sortedDays.map((day) => +dailyData[day].consumedKwh.toFixed(2)),
              backgroundColor: "#3090d870",
              borderColor: "#3090d8",
              borderWidth: 1,
              borderRadius: 3,
            },
          ]
        : []),
    ],
  };

  return (
    <div className="relative w-full min-h-[220px] sm:min-h-[260px]">
      <Bar data={chartData} options={CHART_OPTIONS} />
    </div>
  );
}
