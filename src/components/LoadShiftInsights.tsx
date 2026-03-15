"use client";

import { Bar } from "react-chartjs-2";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import { LoadShiftAnalysis } from "@/lib/types";

interface LoadShiftInsightsProps {
  analysis: LoadShiftAnalysis;
  hasFusionSolar: boolean;
}

const HOURS_IN_DAY = 24;
const MIN_SHIFTABLE_KWH = 0.1;

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatHourRange(hour: number): string {
  return `${String(hour).padStart(2, "0")}–${String(hour + 1).padStart(2, "0")}h`;
}

export default function LoadShiftInsights({ analysis, hasFusionSolar }: LoadShiftInsightsProps) {
  const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
  const sectionHeading = "font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4";
  const noteText = "font-mono text-xs text-text-dim leading-normal mt-3";

  const hourLabels = Array.from({ length: HOURS_IN_DAY }, (_, i) => `${String(i).padStart(2, "0")}h`);

  /* --- Overlay chart: generation vs consumption per hour --- */
  const overlayChartData = {
    labels: hourLabels,
    datasets: [
      {
        label: "Prosj. proizvodnja (kW)",
        data: analysis.hourlyProfiles.map((profile) => +profile.averageGenerationKw.toFixed(3)),
        backgroundColor: "#f0a42060",
        borderColor: "#f0a420",
        borderWidth: 1.5,
        order: 2,
      },
      {
        label: "Prosj. potrošnja iz mreže (kW)",
        data: analysis.hourlyProfiles.map((profile) => +profile.averageConsumptionKw.toFixed(3)),
        backgroundColor: "#3090d860",
        borderColor: "#3090d8",
        borderWidth: 1.5,
        order: 1,
      },
    ],
  };

  /* --- Shifting potential chart: excess solar vs shiftable consumption --- */
  const shiftingChartData = {
    labels: hourLabels,
    datasets: [
      {
        label: "Višak solara — slobodan kapacitet (kW)",
        data: analysis.hourlyProfiles.map((profile) => +profile.excessGenerationKw.toFixed(3)),
        backgroundColor: "#27c96a50",
        borderColor: "#27c96a",
        borderWidth: 1.5,
      },
      {
        label: "Potrošnja iz mreže za vrijeme solara (kW)",
        data: analysis.hourlyProfiles.map((profile) => +profile.shiftableConsumptionKw.toFixed(3)),
        backgroundColor: "#e0404050",
        borderColor: "#e04040",
        borderWidth: 1.5,
      },
    ],
  };

  const hasShiftingPotential = analysis.shiftableDailyKwh >= MIN_SHIFTABLE_KWH;

  const bestHoursText = analysis.bestHoursForLoad.length > 0
    ? analysis.bestHoursForLoad.map(formatHourRange).join(", ")
    : "—";

  const peakGridHoursText = analysis.peakGridConsumptionHours.length > 0
    ? analysis.peakGridConsumptionHours.map(formatHourRange).join(", ")
    : "—";

  /* Build recommendation items based on analysis */
  interface Recommendation {
    icon: string;
    title: string;
    description: string;
    colorClass: string;
  }

  const recommendations: Recommendation[] = [];

  if (analysis.bestHoursForLoad.length > 0) {
    const startHour = formatHour(analysis.bestHoursForLoad[0]);
    const endHour = formatHour(analysis.bestHoursForLoad[analysis.bestHoursForLoad.length - 1] + 1);
    recommendations.push({
      icon: "🔌",
      title: "Perilica, sušilica, perilica posuđa",
      description: `Pokrenite između ${startHour}–${endHour} kad je višak solara najveći.`,
      colorClass: "text-green",
    });
  }

  if (analysis.excessSolarExportKwh > 1) {
    recommendations.push({
      icon: "🔋",
      title: "Baterija bi iskoristila višak",
      description: `Prosječno ${analysis.excessSolarExportKwh.toFixed(1)} kWh/dan viška odlazi u mrežu umjesto u bateriju.`,
      colorClass: "text-cyan",
    });
  }

  if (analysis.peakGridConsumptionHours.length > 0) {
    recommendations.push({
      icon: "🌙",
      title: "Večernja potrošnja",
      description: `Najveća potrošnja iz mreže: ${peakGridHoursText}. Razmislite o prebacivanju dijela na solarne sate.`,
      colorClass: "text-blue",
    });
  }

  if (analysis.gridConsumptionDuringSolarKwh > 0.5) {
    recommendations.push({
      icon: "☀️",
      title: "Potrošnja za vrijeme solara",
      description: `${analysis.gridConsumptionDuringSolarKwh.toFixed(1)} kWh/dan uzimate iz mreže dok paneli rade — dio toga može pokriti solar.`,
      colorClass: "text-orange",
    });
  }

  const noDataContent = !hasFusionSolar ? (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>Optimizacija potrošnje</h3>
      <p className={noteText}>Povežite FusionSolar za analizu optimizacije.</p>
    </div>
  ) : null;

  if (noDataContent) return noDataContent;

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4 sm:gap-4 sm:mb-6">
        <div className="metric-card accent-green bg-surface-1 border border-border rounded-default p-3 sm:p-4">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Višak solara/dan</div>
          <div className="font-mono text-lg font-bold text-green">{analysis.excessSolarExportKwh.toFixed(1)} <span className="text-xs font-normal text-text-dim">kWh</span></div>
        </div>
        <div className="metric-card accent-red bg-surface-1 border border-border rounded-default p-3 sm:p-4">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Mreža za solara/dan</div>
          <div className="font-mono text-lg font-bold text-red">{analysis.gridConsumptionDuringSolarKwh.toFixed(1)} <span className="text-xs font-normal text-text-dim">kWh</span></div>
        </div>
        <div className="metric-card accent-cyan bg-surface-1 border border-border rounded-default p-3 sm:p-4">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Pomakljivo/dan</div>
          <div className="font-mono text-lg font-bold text-cyan">{analysis.shiftableDailyKwh.toFixed(1)} <span className="text-xs font-normal text-text-dim">kWh</span></div>
        </div>
        <div className="metric-card accent-purple bg-surface-1 border border-border rounded-default p-3 sm:p-4">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Moguća ušteda/mj</div>
          <div className="font-mono text-lg font-bold text-purple">{analysis.estimatedMonthlySavingsEur.toFixed(2)} <span className="text-xs font-normal text-text-dim">€</span></div>
        </div>
      </div>

      {/* Generation vs Consumption overlay */}
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Prosječni satni profil — proizvodnja vs. potrošnja</h3>
        <div className="relative w-full min-h-[220px] sm:min-h-[280px]">
          <Bar data={overlayChartData} options={CHART_OPTIONS} />
        </div>
        <p className={noteText}>
          Narančasto = prosječna proizvodnja po satu. Plavo = prosječna potrošnja iz mreže.
          Preklapanje pokazuje koliko potrošnje pada u solarne sate.
        </p>
      </div>

      {/* Shifting potential */}
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Potencijal za pomicanje potrošnje</h3>
        <div className="relative w-full min-h-[220px] sm:min-h-[280px]">
          <Bar data={shiftingChartData} options={CHART_OPTIONS} />
        </div>
        <p className={noteText}>
          Zeleno = višak solara (slobodan kapacitet za uređaje). Crveno = potrošnja iz mreže tijekom solarnih sati (mogla bi se smanjiti).
        </p>
      </div>

      {/* Best hours + peak grid hours */}
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Preporučeni sati</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="bg-surface-2 border border-border rounded-default p-4">
            <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-2">Najbolji sati za uređaje</div>
            <div className="font-mono text-base font-bold text-green">{bestHoursText}</div>
            <p className={noteText}>Sati s najviše viška solarne energije — idealno za perilicu, bojler, punjenje EV-a.</p>
          </div>
          <div className="bg-surface-2 border border-border rounded-default p-4">
            <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-2">Najveća večernja potrošnja</div>
            <div className="font-mono text-base font-bold text-blue">{peakGridHoursText}</div>
            <p className={noteText}>Večernji sati s najvećom potrošnjom iz mreže — kandidati za prebacivanje na solarne sate.</p>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className={sectionBox}>
          <h3 className={sectionHeading}>Preporuke</h3>
          {recommendations.map((recommendation, index) => (
            <div key={index} className="flex gap-3 items-start py-3 border-b border-border last:border-b-0">
              <span className="text-lg shrink-0 leading-none mt-0.5">{recommendation.icon}</span>
              <div>
                <div className={`font-mono text-xs font-bold ${recommendation.colorClass}`}>{recommendation.title}</div>
                <p className="font-mono text-xs text-text-dim leading-normal mt-1">{recommendation.description}</p>
              </div>
            </div>
          ))}
          {hasShiftingPotential && (
            <p className={noteText}>
              Prebacivanjem ~{analysis.shiftableDailyKwh.toFixed(1)} kWh/dan na solarne sate mogli biste uštedjeti ~{analysis.estimatedMonthlySavingsEur.toFixed(2)} €/mj.
              Procjena pretpostavlja 40% večernje potrošnje pomakljivo, ograničeno na dostupan višak solara.
            </p>
          )}
        </div>
      )}
    </>
  );
}
