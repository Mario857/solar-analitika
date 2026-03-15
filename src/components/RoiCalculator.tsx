"use client";

import { Line } from "react-chartjs-2";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import { RoiAnalysis, MonthSelection } from "@/lib/types";

interface RoiCalculatorProps {
  analysis: RoiAnalysis;
  systemCostEur: number;
  selectedMonth: MonthSelection;
  hasInstallationDate: boolean;
}

const MONTHS_IN_YEAR = 12;

function formatMonths(months: number): string {
  const years = Math.floor(months / MONTHS_IN_YEAR);
  const remainingMonths = months % MONTHS_IN_YEAR;
  if (years === 0) return `${remainingMonths} mj`;
  if (remainingMonths === 0) return `${years} god`;
  return `${years} god ${remainingMonths} mj`;
}

/** Thin down projection labels for chart readability — show only every Nth label */
function sparseLabels(labels: string[], maxVisible: number): string[] {
  if (labels.length <= maxVisible) return labels;
  const step = Math.ceil(labels.length / maxVisible);
  return labels.map((label, index) => (index % step === 0 ? label : ""));
}

export default function RoiCalculator({ analysis, systemCostEur, selectedMonth, hasInstallationDate }: RoiCalculatorProps) {
  const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
  const sectionHeading = "font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4";
  const noteText = "font-mono text-xs text-text-dim leading-normal mt-3";

  const hasSystemCost = systemCostEur > 0;

  /* Find payback month index in projections */
  const paybackIndex = analysis.projections.findIndex(
    (projection) => projection.cumulativeSavingsEur >= systemCostEur
  );

  /* Build chart data */
  const rawLabels = analysis.projections.map((projection) => projection.label);
  const chartLabels = sparseLabels(rawLabels, 24);

  const cumulativeSavingsData = analysis.projections.map(
    (projection) => +projection.cumulativeSavingsEur.toFixed(2)
  );
  const systemCostLine = analysis.projections.map(() => systemCostEur);

  /* Mark the current month in projections */
  const currentMonthLabel = `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, "0")}`;
  const currentMonthIndex = analysis.projections.findIndex(
    (projection) => projection.label === currentMonthLabel
  );

  /* Point styling: highlight payback month */
  const pointRadii = analysis.projections.map((_, index) => {
    if (index === paybackIndex) return 6;
    if (index === currentMonthIndex) return 4;
    return 0;
  });
  const pointColors = analysis.projections.map((_, index) => {
    if (index === paybackIndex) return "#27c96a";
    if (index === currentMonthIndex) return "#f0a420";
    return "transparent";
  });

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: "Kumulativna ušteda (€)",
        data: cumulativeSavingsData,
        borderColor: "#27c96a",
        backgroundColor: "#27c96a15",
        fill: true,
        tension: 0.3,
        pointRadius: pointRadii,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
      },
      ...(hasSystemCost
        ? [
            {
              label: "Cijena sustava (€)",
              data: systemCostLine,
              borderColor: "#e04040",
              borderDash: [6, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              fill: false,
            },
          ]
        : []),
    ],
  };

  /* Monthly savings breakdown by season (for the seasonal chart) */
  const seasonalLabels = [
    "Sij", "Velj", "Ožu", "Tra", "Svi", "Lip",
    "Srp", "Kol", "Ruj", "Lis", "Stu", "Pro",
  ];
  /* Extract one year of monthly savings starting from January */
  const seasonalSavings: number[] = [];
  for (let monthIdx = 0; monthIdx < MONTHS_IN_YEAR; monthIdx++) {
    /* Find a projection for this calendar month */
    const matchingProjection = analysis.projections.find((projection) => {
      const projMonth = parseInt(projection.label.slice(5), 10);
      return projMonth === monthIdx + 1;
    });
    seasonalSavings.push(matchingProjection ? +matchingProjection.monthlySavingsEur.toFixed(2) : 0);
  }

  const seasonalChartData = {
    labels: seasonalLabels,
    datasets: [
      {
        label: "Procjena uštede po mjesecu (€)",
        data: seasonalSavings,
        borderColor: "#f0a420",
        backgroundColor: "#f0a42030",
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  };

  const isPaybackReached = hasInstallationDate && analysis.estimatedCumulativeSavingsEur >= systemCostEur && hasSystemCost;
  const remainingToPayback = hasSystemCost
    ? Math.max(systemCostEur - analysis.estimatedCumulativeSavingsEur, 0)
    : 0;

  const noConfigContent = !hasSystemCost ? (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>ROI — Povrat investicije</h3>
      <p className={noteText}>
        Unesite cijenu sustava u Postavkama za izračun povrata investicije.
      </p>
    </div>
  ) : null;

  if (noConfigContent) return noConfigContent;

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4 sm:gap-4 sm:mb-6">
        <div className="metric-card accent-green bg-surface-1 border border-border rounded-default p-3 sm:p-4">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Mjerena ušteda</div>
          <div className="font-mono text-lg font-bold text-green">
            {analysis.measuredMonthlySavingsEur.toFixed(2)} <span className="text-xs font-normal text-text-dim">€/mj</span>
          </div>
        </div>
        <div className="metric-card accent-amber bg-surface-1 border border-border rounded-default p-3 sm:p-4">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Godišnja procjena</div>
          <div className="font-mono text-lg font-bold text-amber">
            {analysis.estimatedAnnualSavingsEur.toFixed(0)} <span className="text-xs font-normal text-text-dim">€/god</span>
          </div>
        </div>
        <div className="metric-card accent-cyan bg-surface-1 border border-border rounded-default p-3 sm:p-4">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Povrat investicije</div>
          <div className="font-mono text-lg font-bold text-cyan">
            {analysis.paybackMonths > 0 ? formatMonths(analysis.paybackMonths) : "—"}
          </div>
        </div>
        <div className="metric-card accent-purple bg-surface-1 border border-border rounded-default p-3 sm:p-4">
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Godišnji ROI</div>
          <div className="font-mono text-lg font-bold text-purple">
            {analysis.annualRoiPercent.toFixed(1)} <span className="text-xs font-normal text-text-dim">%</span>
          </div>
        </div>
      </div>

      {/* Progress toward payback (if installation date is set) */}
      {hasInstallationDate && (
        <div className={sectionBox}>
          <h3 className={sectionHeading}>Napredak otplate</h3>
          <div className="flex items-center gap-4 mb-3">
            <div className="font-mono text-xs text-text-dim">
              {analysis.monthsElapsed} mj od instalacije
            </div>
            <div className="font-mono text-xs text-text-dim">|</div>
            <div className="font-mono text-xs text-text-dim">
              Procjena uštede do sad: <span className="text-green font-bold">{analysis.estimatedCumulativeSavingsEur.toFixed(0)} €</span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-surface-2 rounded-sm h-5 overflow-hidden border border-border">
            <div
              className="h-full rounded-sm transition-all duration-500"
              style={{
                width: `${Math.min((analysis.estimatedCumulativeSavingsEur / systemCostEur) * 100, 100)}%`,
                background: isPaybackReached
                  ? "linear-gradient(90deg, #27c96a, #15b89a)"
                  : "linear-gradient(90deg, #f0a420, #e07830)",
              }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="font-mono text-[0.6rem] text-text-dim">0 €</span>
            <span className="font-mono text-[0.6rem] text-text-dim">
              {isPaybackReached
                ? "Investicija otplaćena!"
                : `Preostalo: ${remainingToPayback.toFixed(0)} €`}
            </span>
            <span className="font-mono text-[0.6rem] text-text-dim">{systemCostEur.toFixed(0)} €</span>
          </div>
        </div>
      )}

      {/* Cumulative savings vs system cost chart */}
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Projekcija kumulativne uštede</h3>
        <div className="relative w-full min-h-[250px] sm:min-h-[320px]">
          <Line data={chartData} options={CHART_OPTIONS} />
        </div>
        <p className={noteText}>
          Zelena linija = kumulativna ušteda. Crvena isprekidana = cijena sustava ({systemCostEur.toFixed(0)} €).
          {paybackIndex >= 0 ? ` Točka povrata: ${analysis.projections[paybackIndex].label}.` : ""}
        </p>
      </div>

      {/* Seasonal savings distribution */}
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Sezonska raspodjela uštede</h3>
        <div className="relative w-full min-h-[200px] sm:min-h-[260px]">
          <Line data={seasonalChartData} options={CHART_OPTIONS} />
        </div>
        <p className={noteText}>
          Procjena mjesečne uštede temeljena na solarnoj proizvodnji za hrvatsku klimu.
          Ljetni mjeseci donose 3–5x veću uštedu od zimskih.
        </p>
      </div>

      {/* Key assumptions */}
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Pretpostavke</h3>
        <div className="grid gap-2">
          <div className="flex gap-2 items-baseline">
            <span className="font-mono text-[0.55rem] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 bg-amber/20 text-amber">Baza</span>
            <span className="font-mono text-xs text-text">
              Ušteda iz analiziranog mjeseca ({analysis.measuredMonthlySavingsEur.toFixed(2)} €) normalizirana za sezonu.
            </span>
          </div>
          <div className="flex gap-2 items-baseline">
            <span className="font-mono text-[0.55rem] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 bg-blue/20 text-blue">Sezona</span>
            <span className="font-mono text-xs text-text">
              Sezonski koeficijenti za hrvatsku klimu (ljeto ~1.5x, zima ~0.4x prosječnog mjeseca).
            </span>
          </div>
          <div className="flex gap-2 items-baseline">
            <span className="font-mono text-[0.55rem] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 bg-cyan/20 text-cyan">Cijene</span>
            <span className="font-mono text-xs text-text">
              Konstantne cijene energije (bez inflacije). Stvarni povrat može biti brži uz rast cijena.
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
