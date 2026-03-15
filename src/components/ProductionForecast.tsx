"use client";

import { Bar } from "react-chartjs-2";
import { MonthForecast } from "@/lib/types";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import ShareButton from "@/components/ShareButton";

interface ProductionForecastProps {
  forecast: MonthForecast;
  hasFusionSolar: boolean;
}

export default function ProductionForecast({ forecast, hasFusionSolar }: ProductionForecastProps) {
  const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
  const noteText = "font-mono text-xs text-text-dim leading-normal mt-3";

  const labels = forecast.dailySeries.map((entry) => entry.dayLabel);

  /* Chart: actual vs projected daily values */
  const feedInDatasets = [
    {
      label: "Predaja (stvarno)",
      data: forecast.dailySeries.map((entry) => entry.actualFeedInKwh),
      backgroundColor: "#f0a420",
      borderRadius: 2,
    },
    {
      label: "Predaja (projekcija)",
      data: forecast.dailySeries.map((entry) => entry.projectedFeedInKwh),
      backgroundColor: "#f0a42060",
      borderRadius: 2,
    },
    {
      label: "Potrošnja (stvarno)",
      data: forecast.dailySeries.map((entry) => entry.actualConsumedKwh),
      backgroundColor: "#3090d8",
      borderRadius: 2,
    },
    {
      label: "Potrošnja (projekcija)",
      data: forecast.dailySeries.map((entry) => entry.projectedConsumedKwh),
      backgroundColor: "#3090d860",
      borderRadius: 2,
    },
  ];

  const hasProduction = hasFusionSolar;
  const productionDatasets = hasProduction
    ? [
        {
          label: "Proizvodnja (stvarno)",
          data: forecast.dailySeries.map((entry) => entry.actualProductionKwh),
          backgroundColor: "#27c96a",
          borderRadius: 2,
        },
        {
          label: "Proizvodnja (projekcija)",
          data: forecast.dailySeries.map((entry) => entry.projectedProductionKwh),
          backgroundColor: "#27c96a60",
          borderRadius: 2,
        },
      ]
    : [];

  const chartData = {
    labels,
    datasets: [...productionDatasets, ...feedInDatasets],
  };

  const chartOptions = {
    ...CHART_OPTIONS,
    plugins: {
      ...CHART_OPTIONS.plugins,
      legend: {
        ...CHART_OPTIONS.plugins.legend,
        display: true,
      },
    },
  };

  const progressPercent = Math.round((forecast.analyzedDays / forecast.totalDaysInMonth) * 100);

  const hasBillProjection = forecast.projectedBillEur > 0;

  return (
    <div id="share-forecast" className={sectionBox}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-text-dim">Prognoza mjeseca</h3>
          {forecast.isWeatherAdjusted && (
            <span className="font-mono text-[0.55rem] px-1.5 py-0.5 rounded-sm bg-blue/20 text-blue">WEATHER</span>
          )}
        </div>
        <ShareButton targetId="share-forecast" fileName="solar-prognoza" />
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-1.5">
          <span className="font-mono text-xs text-text-dim">
            {forecast.analyzedDays} / {forecast.totalDaysInMonth} dana analizirano
          </span>
          <span className="font-mono text-xs text-text-dim">{progressPercent}%</span>
        </div>
        <div className="w-full h-1.5 bg-surface-2 rounded-sm overflow-hidden">
          <div
            className="h-full bg-amber rounded-sm transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-3 lg:grid-cols-4">
        {hasProduction && (
          <div className="metric-card accent-green bg-surface-2 border border-border rounded-sm p-3">
            <div className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-1">Proj. proizvodnja</div>
            <div className="font-mono text-base font-bold text-green">{forecast.projectedProductionKwh.toFixed(1)} kWh</div>
            <div className="font-mono text-[0.55rem] text-text-dim mt-0.5">
              ø {forecast.averageDailyProductionKwh.toFixed(1)} kWh/dan
            </div>
          </div>
        )}

        <div className="metric-card bg-surface-2 border border-border rounded-sm p-3">
          <div className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-1">Proj. predaja</div>
          <div className="font-mono text-base font-bold text-amber">{forecast.projectedFeedInKwh.toFixed(1)} kWh</div>
          <div className="font-mono text-[0.55rem] text-text-dim mt-0.5">
            ø {forecast.averageDailyFeedInKwh.toFixed(1)} kWh/dan
          </div>
        </div>

        <div className="metric-card accent-blue bg-surface-2 border border-border rounded-sm p-3">
          <div className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-1">Proj. potrošnja</div>
          <div className="font-mono text-base font-bold text-blue">{forecast.projectedConsumedKwh.toFixed(1)} kWh</div>
          <div className="font-mono text-[0.55rem] text-text-dim mt-0.5">
            ø {forecast.averageDailyConsumedKwh.toFixed(1)} kWh/dan
          </div>
        </div>

        {hasProduction && (
          <div className="metric-card accent-cyan bg-surface-2 border border-border rounded-sm p-3">
            <div className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-1">Proj. samodostatnost</div>
            <div className="font-mono text-base font-bold text-cyan">{forecast.projectedSelfSufficiencyPercent.toFixed(1)}%</div>
            <div className="font-mono text-[0.55rem] text-text-dim mt-0.5">
              ø {forecast.averageDailySelfConsumedKwh.toFixed(1)} kWh/dan vlastita
            </div>
          </div>
        )}

        {hasBillProjection && (
          <>
            <div className="metric-card accent-red bg-surface-2 border border-border rounded-sm p-3">
              <div className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-1">Proj. račun</div>
              <div className="font-mono text-base font-bold text-red">{forecast.projectedBillEur.toFixed(2)} €</div>
            </div>

            <div className="metric-card accent-green bg-surface-2 border border-border rounded-sm p-3">
              <div className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-1">Proj. ušteda</div>
              <div className="font-mono text-base font-bold text-green">{forecast.projectedSavingsEur.toFixed(2)} €</div>
            </div>
          </>
        )}
      </div>

      {/* Chart */}
      <div style={{ height: 280 }}>
        <Bar data={chartData} options={chartOptions} />
      </div>

      <p className={noteText}>
        {forecast.isWeatherAdjusted
          ? `Projekcija prilagođena vremenskoj prognozi (Open-Meteo). Temelj: ${forecast.analyzedDays} dana.`
          : `Projekcija na temelju prosjeka od ${forecast.analyzedDays} dana.`}
        {" "}Preostalo {forecast.remainingDays} dana u mjesecu.
      </p>
    </div>
  );
}
