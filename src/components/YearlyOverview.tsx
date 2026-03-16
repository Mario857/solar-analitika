"use client";

import { useState, useEffect, useCallback } from "react";
import { Bar, Line } from "react-chartjs-2";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import { Config, MonthSelection, MonthSummary } from "@/lib/types";
import { computeMonthSummary } from "@/lib/calculations";
import { getCachedMonth, getAllCachedMonthKeys } from "@/lib/cache";
import { MONTH_NAMES } from "@/lib/config";

interface YearlyOverviewProps {
  config: Config;
  onLoadMonth: (month: MonthSelection, forceRefresh?: boolean) => Promise<"ok" | "no-data" | "auth-error">;
  /** Incremented whenever new data is cached, so the component re-fetches summaries */
  cacheRevision: number;
}

const MONTHS_IN_YEAR = 12;

/** Check if a month is in the future (no data exists yet) */
function isFutureMonth(year: number, monthOneIndexed: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return year > currentYear || (year === currentYear && monthOneIndexed > currentMonth);
}

export default function YearlyOverview({ config, onLoadMonth, cacheRevision }: YearlyOverviewProps) {
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [summaries, setSummaries] = useState<(MonthSummary | null)[]>(Array(MONTHS_IN_YEAR).fill(null));
  const [cachedKeys, setCachedKeys] = useState<Set<string>>(new Set());
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState("");
  const [refreshingMonth, setRefreshingMonth] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
  const sectionHeading = "font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4";
  const noteText = "font-mono text-xs text-text-dim leading-normal mt-3";

  /* Load cached data for the selected year */
  useEffect(() => {
    let cancelled = false;

    async function loadYear() {
      const allKeys = await getAllCachedMonthKeys();
      if (cancelled) return;
      setCachedKeys(new Set(allKeys));

      const monthSummaries: (MonthSummary | null)[] = [];
      for (let monthIndex = 0; monthIndex < MONTHS_IN_YEAR; monthIndex++) {
        const monthKey = `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}`;
        if (allKeys.includes(monthKey)) {
          const cached = await getCachedMonth(monthKey);
          if (cancelled) return;
          if (cached) {
            monthSummaries.push(computeMonthSummary(cached, config));
          } else {
            monthSummaries.push(null);
          }
        } else {
          monthSummaries.push(null);
        }
      }

      if (!cancelled) {
        setSummaries(monthSummaries);
      }
    }

    loadYear();
    return () => { cancelled = true; };
  }, [selectedYear, config, cacheRevision]);

  const handleLoadAll = useCallback(async () => {
    setIsLoadingAll(true);
    setErrorMessage("");
    let loadedCount = 0;
    const skippedMonths: string[] = [];
    const failedMonths: string[] = [];

    for (let monthIndex = 0; monthIndex < MONTHS_IN_YEAR; monthIndex++) {
      const monthNumber = monthIndex + 1;
      if (isFutureMonth(selectedYear, monthNumber)) continue;

      const monthKey = `${selectedYear}-${String(monthNumber).padStart(2, "0")}`;
      if (cachedKeys.has(monthKey)) continue;

      setLoadingProgress(`${MONTH_NAMES[monthNumber]} ${selectedYear}...`);
      const month: MonthSelection = { month: monthNumber, year: selectedYear };

      try {
        const result = await onLoadMonth(month);

        if (result === "auth-error") {
          setErrorMessage("Greška prijave — prijavite se prvo na Postavkama");
          setLoadingProgress("");
          setIsLoadingAll(false);
          return;
        }

        if (result === "ok") {
          loadedCount++;
        } else {
          skippedMonths.push(MONTH_NAMES[monthNumber]);
        }
      } catch {
        failedMonths.push(MONTH_NAMES[monthNumber]);
      }
    }

    const summaryParts: string[] = [];
    if (loadedCount > 0) summaryParts.push(`${loadedCount} učitano`);
    if (skippedMonths.length > 0) summaryParts.push(`${skippedMonths.length} bez podataka`);
    const summaryText = summaryParts.length > 0 ? summaryParts.join(", ") : "Sve učitano";

    if (failedMonths.length > 0) {
      setErrorMessage(`Greška pri učitavanju: ${failedMonths.join(", ")}`);
    }

    setLoadingProgress(summaryText);
    setIsLoadingAll(false);
    setTimeout(() => setLoadingProgress(""), 4000);
  }, [selectedYear, cachedKeys, onLoadMonth]);

  const handleRefreshMonth = useCallback(async (monthNumber: number) => {
    setRefreshingMonth(monthNumber);
    setErrorMessage("");
    const month: MonthSelection = { month: monthNumber, year: selectedYear };

    try {
      const result = await onLoadMonth(month, true);
      if (result === "auth-error") {
        setErrorMessage("Greška prijave — prijavite se prvo na Postavkama");
      } else if (result === "no-data") {
        setErrorMessage(`Nema podataka za ${MONTH_NAMES[monthNumber]} ${selectedYear}`);
      }
    } catch {
      setErrorMessage(`Greška pri osvježavanju ${MONTH_NAMES[monthNumber]} ${selectedYear}`);
    }

    setRefreshingMonth(null);
  }, [selectedYear, onLoadMonth]);

  const cachedCount = summaries.filter((summary) => summary !== null).length;
  const loadableCount = Array.from({ length: MONTHS_IN_YEAR }, (_, index) =>
    !isFutureMonth(selectedYear, index + 1)
  ).filter(Boolean).length;
  /* Count how many loadable (non-future) months already have cached data */
  const cachedLoadableCount = Array.from({ length: MONTHS_IN_YEAR }, (_, index) => {
    const monthNumber = index + 1;
    const monthKey = `${selectedYear}-${String(monthNumber).padStart(2, "0")}`;
    return !isFutureMonth(selectedYear, monthNumber) && cachedKeys.has(monthKey);
  }).filter(Boolean).length;
  const monthLabels = Array.from({ length: MONTHS_IN_YEAR }, (_, index) => MONTH_NAMES[index + 1]);

  /* Aggregate yearly totals from available months */
  const availableSummaries = summaries.filter((summary): summary is MonthSummary => summary !== null);
  const yearlyTotals = {
    production: availableSummaries.reduce((sum, summary) => sum + summary.totalSolarProductionKwh, 0),
    feedIn: availableSummaries.reduce((sum, summary) => sum + summary.totalFeedInKwh, 0),
    consumed: availableSummaries.reduce((sum, summary) => sum + summary.totalConsumedKwh, 0),
    selfConsumed: availableSummaries.reduce((sum, summary) => sum + summary.totalSelfConsumedKwh, 0),
    household: availableSummaries.reduce((sum, summary) => sum + summary.totalHouseholdKwh, 0),
    billTotal: availableSummaries.reduce((sum, summary) => sum + summary.billTotalEur, 0),
    savings: availableSummaries.reduce((sum, summary) => sum + summary.savingsEur, 0),
  };
  const yearlySelfSufficiency = yearlyTotals.household > 0
    ? (yearlyTotals.selfConsumed / yearlyTotals.household) * 100
    : 0;

  /* --- Chart 1: Production & Consumption --- */
  const productionConsumptionData = {
    labels: monthLabels,
    datasets: [
      {
        label: "Proizvodnja (kWh)",
        data: summaries.map((summary) => summary?.totalSolarProductionKwh ?? 0),
        backgroundColor: "#e0783060",
        borderColor: "#e07830",
        borderWidth: 1.5,
      },
      {
        label: "Predano u mrežu (kWh)",
        data: summaries.map((summary) => summary?.totalFeedInKwh ?? 0),
        backgroundColor: "#f0a42060",
        borderColor: "#f0a420",
        borderWidth: 1.5,
      },
      {
        label: "Preuzeto iz mreže (kWh)",
        data: summaries.map((summary) => summary?.totalConsumedKwh ?? 0),
        backgroundColor: "#3090d860",
        borderColor: "#3090d8",
        borderWidth: 1.5,
      },
      {
        label: "Samopotrošnja (kWh)",
        data: summaries.map((summary) => summary?.totalSelfConsumedKwh ?? 0),
        backgroundColor: "#15b89a60",
        borderColor: "#15b89a",
        borderWidth: 1.5,
      },
    ],
  };

  /* --- Chart 2: Bill & Savings --- */
  const billSavingsData = {
    labels: monthLabels,
    datasets: [
      {
        label: "Račun sa solarom (€)",
        data: summaries.map((summary) => summary ? +summary.billTotalEur.toFixed(2) : 0),
        backgroundColor: "#9050b060",
        borderColor: "#9050b0",
        borderWidth: 1.5,
      },
      {
        label: "Ušteda (€)",
        data: summaries.map((summary) => summary ? +summary.savingsEur.toFixed(2) : 0),
        backgroundColor: "#27c96a60",
        borderColor: "#27c96a",
        borderWidth: 1.5,
      },
    ],
  };

  /* --- Chart 3: Self-sufficiency trend --- */
  const selfSufficiencyData = {
    labels: monthLabels,
    datasets: [
      {
        label: "Samodostatnost (%)",
        data: summaries.map((summary) => summary ? +summary.selfSufficiencyPercent.toFixed(1) : 0),
        borderColor: "#27c96a",
        backgroundColor: "#27c96a15",
        fill: true,
        tension: 0.3,
        pointRadius: summaries.map((summary) => (summary ? 4 : 0)),
        pointBackgroundColor: "#27c96a",
      },
      {
        label: "Samopotrošnja (%)",
        data: summaries.map((summary) => summary ? +summary.selfConsumptionRatePercent.toFixed(1) : 0),
        borderColor: "#15b89a",
        backgroundColor: "#15b89a15",
        fill: true,
        tension: 0.3,
        pointRadius: summaries.map((summary) => (summary ? 4 : 0)),
        pointBackgroundColor: "#15b89a",
      },
    ],
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNumber = now.getMonth() + 1;

  /* Month availability indicator: green = cached, gray = loadable, dim = future */
  const monthStatusContent = (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
      {Array.from({ length: MONTHS_IN_YEAR }, (_, index) => {
        const monthNumber = index + 1;
        const monthKey = `${selectedYear}-${String(monthNumber).padStart(2, "0")}`;
        const hasCached = cachedKeys.has(monthKey);
        const isFuture = isFutureMonth(selectedYear, monthNumber);
        const isCurrentMonth = selectedYear === currentYear && monthNumber === currentMonthNumber;
        const isRefreshing = refreshingMonth === monthNumber;

        let cellStyle = "bg-surface-2 border-border text-text-dim";
        if (hasCached) {
          cellStyle = "bg-green/10 border-green/30 text-green";
        } else if (isFuture) {
          cellStyle = "bg-surface-1 border-border/50 text-text-dim/40";
        }

        /* Current month gets a highlight ring */
        const currentRing = isCurrentMonth ? " ring-1 ring-amber/50" : "";

        /* Cached months can be clicked to refresh */
        const isClickable = hasCached && !isFuture && !isLoadingAll && !isRefreshing;

        return (
          <button
            key={monthKey}
            className={`text-center py-2 rounded-sm border font-mono text-[0.6rem] uppercase tracking-wide transition-all duration-150 ${cellStyle}${currentRing} ${isClickable ? "cursor-pointer hover:border-amber hover:text-amber" : "cursor-default"}`}
            onClick={isClickable ? () => handleRefreshMonth(monthNumber) : undefined}
            disabled={!isClickable}
            title={
              isFuture
                ? "Budući mjesec"
                : hasCached
                  ? "Klik za osvježavanje"
                  : "Nije učitano"
            }
          >
            {isRefreshing ? "..." : MONTH_NAMES[monthNumber]}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Year selector */}
      <div className={sectionBox}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={sectionHeading + " mb-0!"}>Godišnji pregled</h3>
          <div className="flex items-center gap-3">
            <button
              className="font-mono text-xs text-text-dim hover:text-amber cursor-pointer bg-transparent border-none px-2 py-1"
              onClick={() => setSelectedYear((prev) => prev - 1)}
            >
              ← {selectedYear - 1}
            </button>
            <span className="font-mono text-sm font-bold text-text-bright">{selectedYear}</span>
            <button
              className="font-mono text-xs text-text-dim hover:text-amber cursor-pointer bg-transparent border-none px-2 py-1"
              onClick={() => setSelectedYear((prev) => prev + 1)}
            >
              {selectedYear + 1} →
            </button>
          </div>
        </div>

        {/* Month status grid */}
        {monthStatusContent}

        <div className="flex items-center gap-4 mt-4">
          <span className="font-mono text-xs text-text-dim">
            {cachedCount}/{MONTHS_IN_YEAR} mjeseci učitano
          </span>
          {cachedLoadableCount < loadableCount && (
            <button
              className="bg-amber text-background border-none rounded-sm px-4 py-1.5 font-body text-xs font-bold cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-[#f5b030] hover:-translate-y-px active:translate-y-0 disabled:opacity-35 disabled:cursor-wait"
              onClick={handleLoadAll}
              disabled={isLoadingAll}
            >
              {isLoadingAll ? loadingProgress : "UČITAJ SVE"}
            </button>
          )}
        </div>

        {errorMessage && (
          <div className="flex items-center justify-between gap-2 mt-3 px-3 py-2 bg-red/10 rounded-sm">
            <span className="font-mono text-xs text-red">{errorMessage}</span>
            <button
              className="font-mono text-xs text-red/60 hover:text-red cursor-pointer bg-transparent border-none px-1"
              onClick={() => setErrorMessage("")}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      {cachedCount > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4 sm:gap-4 sm:mb-6">
          <div className="metric-card accent-orange bg-surface-1 border border-border rounded-default p-3 sm:p-4">
            <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Proizvodnja</div>
            <div className="font-mono text-lg font-bold text-orange">
              {yearlyTotals.production.toFixed(0)} <span className="text-xs font-normal text-text-dim">kWh</span>
            </div>
          </div>
          <div className="metric-card accent-blue bg-surface-1 border border-border rounded-default p-3 sm:p-4">
            <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Iz mreže</div>
            <div className="font-mono text-lg font-bold text-blue">
              {yearlyTotals.consumed.toFixed(0)} <span className="text-xs font-normal text-text-dim">kWh</span>
            </div>
          </div>
          <div className="metric-card accent-green bg-surface-1 border border-border rounded-default p-3 sm:p-4">
            <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Ukupna ušteda</div>
            <div className="font-mono text-lg font-bold text-green">
              {yearlyTotals.savings.toFixed(0)} <span className="text-xs font-normal text-text-dim">€</span>
            </div>
          </div>
          <div className="metric-card accent-cyan bg-surface-1 border border-border rounded-default p-3 sm:p-4">
            <div className="font-mono text-[0.6rem] uppercase tracking-wide text-text-dim mb-1">Samodostatnost</div>
            <div className="font-mono text-lg font-bold text-cyan">
              {yearlySelfSufficiency.toFixed(0)} <span className="text-xs font-normal text-text-dim">%</span>
            </div>
          </div>
        </div>
      )}

      {/* Chart 1: Production & Consumption */}
      {cachedCount > 0 && (
        <div className={sectionBox}>
          <h3 className={sectionHeading}>Mjesečna proizvodnja i potrošnja</h3>
          <div className="relative w-full min-h-[250px] sm:min-h-[320px]">
            <Bar data={productionConsumptionData} options={CHART_OPTIONS} />
          </div>
          <p className={noteText}>
            Ukupna proizvodnja: {yearlyTotals.production.toFixed(0)} kWh |
            Predano: {yearlyTotals.feedIn.toFixed(0)} kWh |
            Preuzeto: {yearlyTotals.consumed.toFixed(0)} kWh
          </p>
        </div>
      )}

      {/* Chart 2: Bill & Savings */}
      {cachedCount > 0 && (
        <div className={sectionBox}>
          <h3 className={sectionHeading}>Mjesečni račun i ušteda</h3>
          <div className="relative w-full min-h-[250px] sm:min-h-[320px]">
            <Bar data={billSavingsData} options={CHART_OPTIONS} />
          </div>
          <p className={noteText}>
            Ukupni račun: {yearlyTotals.billTotal.toFixed(0)} € |
            Ukupna ušteda: {yearlyTotals.savings.toFixed(0)} €
          </p>
        </div>
      )}

      {/* Chart 3: Self-sufficiency trend */}
      {cachedCount > 0 && (
        <div className={sectionBox}>
          <h3 className={sectionHeading}>Samodostatnost i samopotrošnja</h3>
          <div className="relative w-full min-h-[220px] sm:min-h-[280px]">
            <Line data={selfSufficiencyData} options={CHART_OPTIONS} />
          </div>
          <p className={noteText}>
            Prosječna samodostatnost: {yearlySelfSufficiency.toFixed(0)}% (iz {cachedCount} učitanih mjeseci)
          </p>
        </div>
      )}

      {/* Empty state */}
      {cachedCount === 0 && (
        <div className={sectionBox}>
          <p className={noteText}>
            Nema podataka za {selectedYear}. Analizirajte mjesece na Postavkama ili kliknite &quot;Učitaj sve&quot; iznad.
          </p>
        </div>
      )}
    </>
  );
}
