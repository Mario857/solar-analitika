"use client";

import { useState, useEffect } from "react";
import { Bar, Line } from "react-chartjs-2";
import { Config, MonthSummary, CachedMonthData, DerivedMonthlyData } from "@/lib/types";
import { computeMonthSummary, calculateDerivedMetrics } from "@/lib/calculations";
import { getAllCachedMonthKeys, getCachedMonth } from "@/lib/cache";
import { MONTH_NAMES } from "@/lib/config";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import ShareButton from "@/components/ShareButton";

interface MonthComparisonProps {
  config: Config;
  cacheRevision: number;
}

const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
const sectionHeading = "font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4";
const cardBox = "bg-surface-2 border border-border rounded-sm p-3 sm:p-4 text-center";
const cardLabel = "font-mono text-[0.6rem] text-text-dim uppercase tracking-wider";
const cardValue = "font-mono text-sm sm:text-base font-bold mt-1";

function formatMonthLabel(monthKey: string): string {
  const monthNum = parseInt(monthKey.slice(5, 7));
  const year = monthKey.slice(0, 4);
  return `${MONTH_NAMES[monthNum]} ${year}`;
}

/** Show percentage change with arrow */
function formatDelta(valueA: number, valueB: number, unit: string, invertColor = false): { text: string; color: string } {
  if (valueA === 0 && valueB === 0) return { text: "—", color: "text-text-dim" };
  const diff = valueB - valueA;
  const pct = valueA !== 0 ? (diff / valueA) * 100 : 0;
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "=";
  const isPositive = diff > 0;
  /* For costs, increase is bad (red). For production, increase is good (green). invertColor flips this. */
  const color = diff === 0 ? "text-text-dim" : (isPositive !== invertColor ? "text-green" : "text-red");
  return {
    text: `${arrow} ${Math.abs(diff).toFixed(1)} ${unit} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`,
    color,
  };
}

interface ComparisonRow {
  label: string;
  valueA: string;
  valueB: string;
  delta: { text: string; color: string };
}

function buildComparisonRows(summaryA: MonthSummary, summaryB: MonthSummary): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  const addRow = (label: string, a: number, b: number, unit: string, decimals = 1, invertColor = false) => {
    rows.push({
      label,
      valueA: `${a.toFixed(decimals)} ${unit}`,
      valueB: `${b.toFixed(decimals)} ${unit}`,
      delta: formatDelta(a, b, unit, invertColor),
    });
  };

  addRow("Solarna proizvodnja", summaryA.totalSolarProductionKwh, summaryB.totalSolarProductionKwh, "kWh");
  addRow("Predaja u mrežu", summaryA.totalFeedInKwh, summaryB.totalFeedInKwh, "kWh");
  addRow("Potrošnja iz mreže", summaryA.totalConsumedKwh, summaryB.totalConsumedKwh, "kWh", 1, true);
  addRow("Samopotrošnja", summaryA.totalSelfConsumedKwh, summaryB.totalSelfConsumedKwh, "kWh");
  addRow("Ukupna potrošnja", summaryA.totalHouseholdKwh, summaryB.totalHouseholdKwh, "kWh", 1, true);
  addRow("Samodovoljnost", summaryA.selfSufficiencyPercent, summaryB.selfSufficiencyPercent, "%");
  addRow("Samopotrošnja %", summaryA.selfConsumptionRatePercent, summaryB.selfConsumptionRatePercent, "%");

  if (summaryA.billTotalEur > 0 || summaryB.billTotalEur > 0) {
    addRow("Račun", summaryA.billTotalEur, summaryB.billTotalEur, "€", 2, true);
    addRow("Ušteda", summaryA.savingsEur, summaryB.savingsEur, "€", 2);
  }

  return rows;
}

export default function MonthComparison({ config, cacheRevision }: MonthComparisonProps) {
  const [cachedKeys, setCachedKeys] = useState<string[]>([]);
  const [monthKeyA, setMonthKeyA] = useState<string>("");
  const [monthKeyB, setMonthKeyB] = useState<string>("");
  const [summaryA, setSummaryA] = useState<MonthSummary | null>(null);
  const [summaryB, setSummaryB] = useState<MonthSummary | null>(null);
  const [derivedA, setDerivedA] = useState<DerivedMonthlyData | null>(null);
  const [derivedB, setDerivedB] = useState<DerivedMonthlyData | null>(null);

  /* Load available cached months */
  useEffect(() => {
    let cancelled = false;
    async function loadKeys() {
      const keys = await getAllCachedMonthKeys();
      if (cancelled) return;
      const sorted = keys.sort();
      setCachedKeys(sorted);
      /* Default: latest two months */
      if (sorted.length >= 2 && !monthKeyA && !monthKeyB) {
        setMonthKeyA(sorted[sorted.length - 2]);
        setMonthKeyB(sorted[sorted.length - 1]);
      } else if (sorted.length === 1 && !monthKeyA) {
        setMonthKeyA(sorted[0]);
      }
    }
    loadKeys();
    return () => { cancelled = true; };
  }, [cacheRevision]);

  /* Load month A data */
  useEffect(() => {
    if (!monthKeyA) { setSummaryA(null); setDerivedA(null); return; }
    let cancelled = false;
    async function load() {
      const cached = await getCachedMonth(monthKeyA);
      if (cancelled || !cached) return;
      setSummaryA(computeMonthSummary(cached, config));
      const fusionSolarDaily = cached.fusionSolarDaily || {};
      setDerivedA(calculateDerivedMetrics(cached.sortedDays, cached.dailyData, fusionSolarDaily, cached.hasFusionSolar));
    }
    load();
    return () => { cancelled = true; };
  }, [monthKeyA, config]);

  /* Load month B data */
  useEffect(() => {
    if (!monthKeyB) { setSummaryB(null); setDerivedB(null); return; }
    let cancelled = false;
    async function load() {
      const cached = await getCachedMonth(monthKeyB);
      if (cancelled || !cached) return;
      setSummaryB(computeMonthSummary(cached, config));
      const fusionSolarDaily = cached.fusionSolarDaily || {};
      setDerivedB(calculateDerivedMetrics(cached.sortedDays, cached.dailyData, fusionSolarDaily, cached.hasFusionSolar));
    }
    load();
    return () => { cancelled = true; };
  }, [monthKeyB, config]);

  const hasComparison = summaryA && summaryB;
  const comparisonRows = hasComparison ? buildComparisonRows(summaryA, summaryB) : [];

  /* Bar chart: side-by-side key metrics */
  const chartData = hasComparison ? {
    labels: ["Proizvodnja", "Predaja", "Potrošnja", "Samopotrošnja", "Kućanstvo"],
    datasets: [
      {
        label: formatMonthLabel(monthKeyA),
        data: [
          summaryA.totalSolarProductionKwh,
          summaryA.totalFeedInKwh,
          summaryA.totalConsumedKwh,
          summaryA.totalSelfConsumedKwh,
          summaryA.totalHouseholdKwh,
        ],
        backgroundColor: "#22d3ee",
        borderRadius: 2,
      },
      {
        label: formatMonthLabel(monthKeyB),
        data: [
          summaryB.totalSolarProductionKwh,
          summaryB.totalFeedInKwh,
          summaryB.totalConsumedKwh,
          summaryB.totalSelfConsumedKwh,
          summaryB.totalHouseholdKwh,
        ],
        backgroundColor: "#f0a420",
        borderRadius: 2,
      },
    ],
  } : null;

  const chartOptions = {
    ...CHART_OPTIONS,
    scales: {
      ...CHART_OPTIONS.scales,
      y: {
        ...CHART_OPTIONS.scales?.y,
        title: { display: true, text: "kWh", color: "#7a8a9e", font: { size: 10 } },
      },
    },
  };

  /* Daily production overlay chart — both months on same axis (day 1..31) */
  const dailyChartData = derivedA && derivedB ? {
    labels: Array.from({ length: Math.max(derivedA.days.length, derivedB.days.length) }, (_, i) => String(i + 1).padStart(2, "0")),
    datasets: [
      {
        label: formatMonthLabel(monthKeyA),
        data: derivedA.days.map((d) => d.solarProduction > 0 ? d.solarProduction : d.feedIn),
        borderColor: "#22d3ee",
        backgroundColor: "#22d3ee30",
        borderWidth: 2,
        fill: false,
        tension: 0.3,
        pointRadius: 2,
        pointBackgroundColor: "#22d3ee",
      },
      {
        label: formatMonthLabel(monthKeyB),
        data: derivedB.days.map((d) => d.solarProduction > 0 ? d.solarProduction : d.feedIn),
        borderColor: "#f0a420",
        backgroundColor: "#f0a42030",
        borderWidth: 2,
        fill: false,
        tension: 0.3,
        pointRadius: 2,
        pointBackgroundColor: "#f0a420",
      },
    ],
  } : null;

  const dailyChartOptions = {
    ...CHART_OPTIONS,
    scales: {
      ...CHART_OPTIONS.scales,
      y: {
        ...CHART_OPTIONS.scales?.y,
        title: { display: true, text: "kWh", color: "#7a8a9e", font: { size: 10 } },
      },
    },
  };

  const selectClass = "bg-surface-2 border border-border rounded-sm px-3 py-1.5 font-mono text-xs text-text cursor-pointer";

  return (
    <div id="share-compare" className={sectionBox}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={sectionHeading + " !mb-0"}>Usporedba mjeseci</h3>
        <ShareButton targetId="share-compare" fileName="solar-usporedba" />
      </div>

      {/* Month selectors */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div>
          <label className="font-mono text-[0.6rem] text-text-dim uppercase tracking-wider block mb-1">Mjesec A</label>
          <select className={selectClass} value={monthKeyA} onChange={(e) => setMonthKeyA(e.target.value)}>
            <option value="">— odaberi —</option>
            {cachedKeys.map((key) => (
              <option key={key} value={key}>{formatMonthLabel(key)}</option>
            ))}
          </select>
        </div>
        <span className="font-mono text-text-dim text-lg mt-4">vs</span>
        <div>
          <label className="font-mono text-[0.6rem] text-text-dim uppercase tracking-wider block mb-1">Mjesec B</label>
          <select className={selectClass} value={monthKeyB} onChange={(e) => setMonthKeyB(e.target.value)}>
            <option value="">— odaberi —</option>
            {cachedKeys.map((key) => (
              <option key={key} value={key}>{formatMonthLabel(key)}</option>
            ))}
          </select>
        </div>
      </div>

      {cachedKeys.length < 2 && (
        <p className="font-mono text-xs text-text-dim">
          Potrebna su minimalno 2 predmemorirana mjeseca. Dohvatite više mjeseci na Dashboard ili Godišnji tabu.
        </p>
      )}

      {hasComparison && (
        <>
          {/* Summary cards — top-level delta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className={cardBox}>
              <div className={cardLabel}>Proizvodnja Δ</div>
              <div className={`${cardValue} ${formatDelta(summaryA.totalSolarProductionKwh, summaryB.totalSolarProductionKwh, "kWh").color}`}>
                {formatDelta(summaryA.totalSolarProductionKwh, summaryB.totalSolarProductionKwh, "kWh").text}
              </div>
            </div>
            <div className={cardBox}>
              <div className={cardLabel}>Potrošnja Δ</div>
              <div className={`${cardValue} ${formatDelta(summaryA.totalConsumedKwh, summaryB.totalConsumedKwh, "kWh", true).color}`}>
                {formatDelta(summaryA.totalConsumedKwh, summaryB.totalConsumedKwh, "kWh", true).text}
              </div>
            </div>
            <div className={cardBox}>
              <div className={cardLabel}>Samodovoljnost Δ</div>
              <div className={`${cardValue} ${formatDelta(summaryA.selfSufficiencyPercent, summaryB.selfSufficiencyPercent, "%").color}`}>
                {formatDelta(summaryA.selfSufficiencyPercent, summaryB.selfSufficiencyPercent, "%").text}
              </div>
            </div>
            <div className={cardBox}>
              <div className={cardLabel}>Ušteda Δ</div>
              <div className={`${cardValue} ${formatDelta(summaryA.savingsEur, summaryB.savingsEur, "€").color}`}>
                {formatDelta(summaryA.savingsEur, summaryB.savingsEur, "€").text}
              </div>
            </div>
          </div>

          {/* Detailed comparison table */}
          <div className="overflow-x-auto mb-5">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-text-dim font-medium uppercase tracking-wider text-[0.6rem]">Metrika</th>
                  <th className="text-right py-2 px-2 text-cyan font-medium">{formatMonthLabel(monthKeyA)}</th>
                  <th className="text-right py-2 px-2 text-amber font-medium">{formatMonthLabel(monthKeyB)}</th>
                  <th className="text-right py-2 pl-4 text-text-dim font-medium">Razlika</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-border/30">
                    <td className="py-2 pr-4 text-text-dim">{row.label}</td>
                    <td className="py-2 px-2 text-right text-text">{row.valueA}</td>
                    <td className="py-2 px-2 text-right text-text">{row.valueB}</td>
                    <td className={`py-2 pl-4 text-right ${row.delta.color}`}>{row.delta.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Side-by-side bar chart */}
          {chartData && (
            <div className="mb-5">
              <h4 className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-3">Pregled po kategorijama</h4>
              <div className="h-[220px] sm:h-[260px]">
                <Bar data={chartData} options={chartOptions} />
              </div>
            </div>
          )}

          {/* Daily production overlay */}
          {dailyChartData && (
            <div>
              <h4 className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-3">Dnevna proizvodnja — preklapanje</h4>
              <div className="h-[220px] sm:h-[260px]">
                <Line data={dailyChartData} options={dailyChartOptions} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
