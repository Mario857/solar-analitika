"use client";

import { Line } from "react-chartjs-2";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import { HourlySample, DerivedMonthlyData } from "@/lib/types";

interface HourlyProfileProps {
  sortedDays: string[];
  hourlyData: Record<string, Record<number, HourlySample>>;
  derived: DerivedMonthlyData;
  hasFusionSolar: boolean;
  hasConsumption: boolean;
}

const HOURS_IN_DAY = 24;
const HEATMAP_START_HOUR = 5;
const HEATMAP_END_HOUR = 20;
const HEATMAP_HOUR_COUNT = HEATMAP_END_HOUR - HEATMAP_START_HOUR + 1;
const HEATMAP_BRIGHTNESS_MULTIPLIER = 1.2;
const MIN_HEATMAP_OPACITY = 0.03;
const HEATMAP_VISIBILITY_THRESHOLD = 0.01;

export default function HourlyProfile({ sortedDays, hourlyData, derived, hasFusionSolar, hasConsumption }: HourlyProfileProps) {
  let maxAveragePower = 0;
  for (const dateKey of sortedDays) {
    for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
      const sample = hourlyData[dateKey]?.[hour];
      const averagePower = sample && sample.sampleCount > 0 ? sample.generation / sample.sampleCount : 0;
      if (averagePower > maxAveragePower) maxAveragePower = averagePower;
    }
  }
  if (!maxAveragePower) maxAveragePower = 1;

  const averageGeneration = Array(HOURS_IN_DAY).fill(0);
  const averageConsumption = Array(HOURS_IN_DAY).fill(0);
  const dayCount = sortedDays.length || 1;

  for (const dateKey of sortedDays) {
    for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
      const sample = hourlyData[dateKey]?.[hour];
      if (sample && sample.sampleCount > 0) {
        averageGeneration[hour] += sample.generation / sample.sampleCount;
        averageConsumption[hour] += sample.consumption / sample.sampleCount;
      }
    }
  }
  for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
    averageGeneration[hour] /= dayCount;
    averageConsumption[hour] /= dayCount;
  }

  const profileChartData = {
    labels: Array.from({ length: HOURS_IN_DAY }, (_, i) => `${String(i).padStart(2, "0")}h`),
    datasets: [
      {
        label: "Prosj. gen kW",
        data: averageGeneration.map((value: number) => +value.toFixed(3)),
        borderColor: "#f0a420",
        backgroundColor: "#f0a42020",
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      },
      ...(hasConsumption
        ? [
            {
              label: "Prosj. con kW",
              data: averageConsumption.map((value: number) => +value.toFixed(3)),
              borderColor: "#3090d8",
              backgroundColor: "#3090d820",
              fill: true,
              tension: 0.3,
              pointRadius: 2,
            },
          ]
        : []),
    ],
  };

  let cumulativeFeedIn = 0;
  let cumulativeConsumed = 0;
  let cumulativeSolarProduction = 0;
  const cumulativeFeedInSeries: number[] = [];
  const cumulativeConsumedSeries: number[] = [];
  const cumulativeSolarSeries: number[] = [];

  for (const dateKey of sortedDays) {
    const dayMetrics = derived.days.find((entry) => entry.date === dateKey);
    cumulativeFeedIn += dayMetrics?.feedIn || 0;
    cumulativeFeedInSeries.push(+cumulativeFeedIn.toFixed(1));
    cumulativeConsumed += dayMetrics?.consumed || 0;
    cumulativeConsumedSeries.push(+cumulativeConsumed.toFixed(1));
    if (hasFusionSolar) {
      cumulativeSolarProduction += dayMetrics?.solarProduction || 0;
      cumulativeSolarSeries.push(+cumulativeSolarProduction.toFixed(1));
    }
  }

  const cumulativeChartData = {
    labels: sortedDays.map((day) => day.slice(5)),
    datasets: [
      ...(hasFusionSolar
        ? [
            {
              label: "Kum. proizvodnja",
              data: cumulativeSolarSeries,
              borderColor: "#e07830",
              tension: 0.2,
              pointRadius: 1,
            },
          ]
        : []),
      {
        label: "Kum. predano",
        data: cumulativeFeedInSeries,
        borderColor: "#f0a420",
        backgroundColor: "#f0a42015",
        fill: true,
        tension: 0.2,
        pointRadius: 1,
      },
      ...(hasConsumption
        ? [
            {
              label: "Kum. preuzeto",
              data: cumulativeConsumedSeries,
              borderColor: "#3090d8",
              backgroundColor: "#3090d815",
              fill: true,
              tension: 0.2,
              pointRadius: 1,
            },
          ]
        : []),
    ],
  };

  const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
  const sectionHeading = "font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4";

  return (
    <>
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Toplinska karta — proizvodnja (kW)</h3>
        <div className="overflow-x-auto scrollbar-hide">
          <div
            className="grid gap-[2px] min-w-fit"
            style={{ gridTemplateColumns: `30px repeat(${sortedDays.length}, 1fr)` }}
          >
            <div className="font-mono text-[0.5rem] text-text-dim flex items-center justify-center whitespace-nowrap" />
            {sortedDays.map((day) => (
              <div key={day} className="font-mono text-[0.5rem] text-text-dim flex items-center justify-center whitespace-nowrap">{day.slice(8)}</div>
            ))}
            {Array.from({ length: HEATMAP_HOUR_COUNT }, (_, index) => {
              const hour = index + HEATMAP_START_HOUR;
              return [
                <div key={`lbl-${hour}`} className="font-mono text-[0.5rem] text-text-dim flex items-center justify-center whitespace-nowrap">
                  {String(hour).padStart(2, "0")}
                </div>,
                ...sortedDays.map((dateKey) => {
                  const sample = hourlyData[dateKey]?.[hour];
                  const averagePower = sample && sample.sampleCount > 0 ? sample.generation / sample.sampleCount : 0;
                  const normalizedOpacity = Math.min((averagePower / maxAveragePower) * HEATMAP_BRIGHTNESS_MULTIPLIER, 1);
                  const cellOpacity = averagePower > HEATMAP_VISIBILITY_THRESHOLD ? normalizedOpacity.toFixed(2) : String(MIN_HEATMAP_OPACITY);
                  return (
                    <div
                      key={`${dateKey}-${hour}`}
                      className="heatmap-cell"
                      style={{ background: `rgba(240,164,32,${cellOpacity})` }}
                      title={`${dateKey} ${hour}:00 ${averagePower.toFixed(2)}kW`}
                    >
                      {averagePower.toFixed(1)}
                    </div>
                  );
                }),
              ];
            })}
          </div>
        </div>
      </div>
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Prosječni dnevni profil</h3>
        <div className="relative w-full min-h-[220px] sm:min-h-[260px]">
          <Line data={profileChartData} options={CHART_OPTIONS} />
        </div>
      </div>
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Kumulativna proizvodnja</h3>
        <div className="relative w-full min-h-[220px] sm:min-h-[260px]">
          <Line data={cumulativeChartData} options={CHART_OPTIONS} />
        </div>
      </div>
    </>
  );
}
