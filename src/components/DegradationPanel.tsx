"use client";

import { Line, Bar } from "react-chartjs-2";
import { DegradationAnalysis } from "@/lib/types";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import { MONTH_NAMES } from "@/lib/config";
import ShareButton from "@/components/ShareButton";

interface DegradationPanelProps {
  analysis: DegradationAnalysis;
  installedKwp: number;
}

const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
const cardBox = "bg-surface-2 border border-border rounded-sm p-3 sm:p-4 text-center";
const cardLabel = "font-mono text-[0.6rem] text-text-dim uppercase tracking-wider";
const cardValue = "font-mono text-sm sm:text-base font-bold mt-1";

function formatMonthLabel(monthKey: string): string {
  const monthNum = parseInt(monthKey.slice(5, 7));
  const year = monthKey.slice(2, 4);
  return `${MONTH_NAMES[monthNum]} '${year}`;
}

/** Classify degradation rate relative to expected 0.5%/year */
function getDegradationStatus(rate: number): { label: string; color: string; description: string } {
  if (rate < 0) {
    return { label: "Poboljšanje", color: "text-green", description: "Sustav pokazuje rast — mogući sezonski utjecaj ili kratki raspon podataka" };
  }
  if (rate <= 0.5) {
    return { label: "Normalno", color: "text-green", description: "Degradacija unutar očekivanog raspona (≤0.5%/god)" };
  }
  if (rate <= 1.0) {
    return { label: "Blago povišeno", color: "text-amber", description: "Nešto iznad prosjeka — pratite trend" };
  }
  return { label: "Povišeno", color: "text-red", description: "Značajna degradacija — preporuča se inspekcija panela" };
}

export default function DegradationPanel({ analysis, installedKwp }: DegradationPanelProps) {
  const status = getDegradationStatus(analysis.annualDegradationRatePercent);

  const labels = analysis.monthlyPoints.map((p) => formatMonthLabel(p.monthKey));

  /* Specific yield bar chart */
  const yieldChartData = {
    labels,
    datasets: [
      {
        label: "Specifični prinos (kWh/kWp)",
        data: analysis.monthlyPoints.map((p) => p.specificYieldKwhPerKwp),
        backgroundColor: analysis.monthlyPoints.map((p) =>
          p.hasFusionSolar ? "#f0a420" : "#f0a42060"
        ),
        borderRadius: 2,
      },
    ],
  };

  const yieldChartOptions = {
    ...CHART_OPTIONS,
    scales: {
      ...CHART_OPTIONS.scales,
      y: {
        ...CHART_OPTIONS.scales?.y,
        title: { display: true, text: "kWh/kWp", color: "#7a8a9e", font: { size: 10 } },
      },
    },
  };

  /* Trend line chart — production over time with linear trend overlay */
  const productionChartData = {
    labels,
    datasets: [
      {
        label: "Proizvodnja (kWh)",
        data: analysis.monthlyPoints.map((p) => p.productionKwh),
        borderColor: "#22d3ee",
        backgroundColor: "#22d3ee30",
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: "#22d3ee",
      },
      {
        label: "Trend linija",
        data: analysis.monthlyPoints.map((_, index) => {
          /* Compute month index from first month */
          const point = analysis.monthlyPoints[index];
          const year = parseInt(point.monthKey.slice(0, 4));
          const monthNum = parseInt(point.monthKey.slice(5, 7));
          const firstYear = parseInt(analysis.firstMonth.slice(0, 4));
          const firstMonthNum = parseInt(analysis.firstMonth.slice(5, 7));
          const monthIndex = (year - firstYear) * 12 + (monthNum - firstMonthNum);

          /* De-normalize: multiply by seasonal factor to get actual expected yield */
          const SEASONAL_INDEX: Record<number, number> = {
            1: 0.40, 2: 0.55, 3: 0.80, 4: 1.05,
            5: 1.30, 6: 1.45, 7: 1.50, 8: 1.35,
            9: 1.05, 10: 0.70, 11: 0.45, 12: 0.35,
          };
          const seasonalFactor = SEASONAL_INDEX[monthNum] || 1.0;
          const normalizedTrendYield = analysis.trendSlopePerMonth * monthIndex + analysis.trendIntercept;
          return normalizedTrendYield * seasonalFactor * installedKwp;
        }),
        borderColor: "#e0525280",
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  const trendChartOptions = {
    ...CHART_OPTIONS,
    scales: {
      ...CHART_OPTIONS.scales,
      y: {
        ...CHART_OPTIONS.scales?.y,
        title: { display: true, text: "kWh", color: "#7a8a9e", font: { size: 10 } },
      },
    },
  };

  /* Calculate some derived stats */
  const yields = analysis.monthlyPoints.map((p) => p.specificYieldKwhPerKwp);
  const averageYield = yields.reduce((sum, v) => sum + v, 0) / yields.length;
  const maxYield = Math.max(...yields);
  const minYield = Math.min(...yields);
  const bestMonth = analysis.monthlyPoints[yields.indexOf(maxYield)];
  const worstMonth = analysis.monthlyPoints[yields.indexOf(minYield)];

  /* After 25 years projection */
  const projectedLossAfter25Years = analysis.annualDegradationRatePercent > 0
    ? (1 - Math.pow(1 - analysis.annualDegradationRatePercent / 100, 25)) * 100
    : 0;

  const reliabilityNote = analysis.isReliable
    ? `Analiza temeljena na ${analysis.monthlyPoints.length} mjeseci podataka (${analysis.firstMonth} — ${analysis.lastMonth}).`
    : `Upozorenje: Samo ${analysis.monthlyPoints.length} mjeseci podataka — potrebno minimalno 6 za pouzdanu procjenu.`;

  return (
    <div id="share-degradation" className={sectionBox}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-text-dim">Degradacija panela</h3>
        <ShareButton targetId="share-degradation" fileName="solar-degradacija" />
      </div>

      {/* Status banner */}
      <div className="bg-surface-2 border border-border-accent rounded-sm p-3 mb-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="font-mono text-[0.6rem] text-text-dim uppercase tracking-wider">Godišnja degradacija</span>
            <div className={`font-mono text-xl font-bold mt-0.5 ${status.color}`}>
              {analysis.annualDegradationRatePercent.toFixed(2)}%/god
            </div>
          </div>
          <div className="text-right">
            <span className={`font-mono text-xs font-bold ${status.color}`}>{status.label}</span>
            <div className="font-mono text-[0.55rem] text-text-dim mt-0.5 max-w-[220px]">{status.description}</div>
          </div>
        </div>
        {/* Degradation gauge bar */}
        <div className="mt-3 h-2 bg-surface-1 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(Math.max(analysis.annualDegradationRatePercent / 2, 0) * 100, 100)}%`,
              background:
                analysis.annualDegradationRatePercent <= 0 ? "#00c896"
                : analysis.annualDegradationRatePercent <= 0.5 ? "#00c896"
                : analysis.annualDegradationRatePercent <= 1.0 ? "#f0a420"
                : "#e05252",
            }}
          />
        </div>
        <div className="flex justify-between mt-1 font-mono text-[0.5rem] text-text-dim">
          <span>0%</span>
          <span>0.5% normalno</span>
          <span>1.0% povišeno</span>
          <span>2.0%</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className={cardBox}>
          <div className={cardLabel}>Prosj. prinos</div>
          <div className={`${cardValue} text-amber`}>{averageYield.toFixed(1)} kWh/kWp</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Najbolji mjesec</div>
          <div className={`${cardValue} text-green`}>
            {maxYield.toFixed(1)} kWh/kWp
            <div className="font-mono text-[0.55rem] text-text-dim">{formatMonthLabel(bestMonth.monthKey)}</div>
          </div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Najslabiji mjesec</div>
          <div className={`${cardValue} text-red`}>
            {minYield.toFixed(1)} kWh/kWp
            <div className="font-mono text-[0.55rem] text-text-dim">{formatMonthLabel(worstMonth.monthKey)}</div>
          </div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Proj. gubitak 25g</div>
          <div className={`${cardValue} ${projectedLossAfter25Years > 15 ? "text-red" : "text-cyan"}`}>
            {projectedLossAfter25Years > 0 ? `${projectedLossAfter25Years.toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      {/* Installed system info */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <div className={cardBox}>
          <div className={cardLabel}>Instalirana snaga</div>
          <div className={`${cardValue} text-text`}>{installedKwp} kWp</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Analiziranih mjeseci</div>
          <div className={`${cardValue} text-text`}>{analysis.monthlyPoints.length}</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Očekivana degradacija</div>
          <div className={`${cardValue} text-text-dim`}>~{analysis.expectedDegradationRatePercent}%/god</div>
        </div>
      </div>

      {/* Production trend chart */}
      <div className="mb-5">
        <h4 className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-3">Mjesečna proizvodnja s trend linijom</h4>
        <div className="h-[220px] sm:h-[260px]">
          <Line data={productionChartData} options={trendChartOptions} />
        </div>
      </div>

      {/* Specific yield bar chart */}
      <div className="mb-4">
        <h4 className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-3">Specifični prinos po mjesecu</h4>
        <div className="h-[220px] sm:h-[260px]">
          <Bar data={yieldChartData} options={yieldChartOptions} />
        </div>
      </div>

      <p className="font-mono text-[0.55rem] text-text-dim mt-4">
        {reliabilityNote} Kristalni silicijski paneli tipično degradiraju ~0.5%/god.
        Specifični prinos normaliziran sezonskim indeksom za Hrvatsku.
        {!analysis.isReliable && " Dohvatite više mjeseci u Godišnjem pregledu za pouzdaniju analizu."}
      </p>
    </div>
  );
}
