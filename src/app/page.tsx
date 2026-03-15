"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Config,
  SessionCredentials,
  MonthSelection,
  CachedMonthData,
  DailyEnergyData,
  FusionSolarDay,
  HourlySample,
  HEPMeterRecord,
} from "@/lib/types";
import { loadConfig, saveConfig, resetConfig, HEP_API_BASE, FUSION_SOLAR_API } from "@/lib/config";
import {
  processHEPRecords,
  parseFusionSolarResponse,
  calculateDerivedMetrics,
  calculateBill,
  calculateBillWithoutSolar,
  formatMonthForApi,
  analyzeLoadShifting,
  calculateRoi,
  calculateForecast,
  aggregateHourlyRadiationToDaily,
  calculateGhiScaleFactors,
  toMonthPrefix,
} from "@/lib/calculations";
import { getCachedMonth, setCachedMonth } from "@/lib/cache";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";
import MonthNav from "@/components/MonthNav";
import Cards from "@/components/Cards";
import MainChart from "@/components/MainChart";
import Insights from "@/components/Insights";
import EnergyFlow from "@/components/EnergyFlow";
import EnergyCharts from "@/components/EnergyCharts";
import HourlyProfile from "@/components/HourlyProfile";
import BillPanel from "@/components/BillPanel";
import DataTable from "@/components/DataTable";
import LoadShiftInsights from "@/components/LoadShiftInsights";
import RoiCalculator from "@/components/RoiCalculator";
import YearlyOverview from "@/components/YearlyOverview";
import ProductionForecast from "@/components/ProductionForecast";
import Settings from "@/components/Settings";

type TabId = "dash" | "yearly" | "energy" | "hourly" | "optimize" | "roi" | "bill" | "table" | "settings";

const INITIAL_MONTH_COUNT = 6;

const STATUS_COLOR_MAP: Record<string, string> = {
  err: "text-red",
  ok: "text-green",
  cached: "text-cyan",
};

function buildInitialMonthList(): MonthSelection[] {
  const now = new Date();
  const months: MonthSelection[] = [];
  for (let i = INITIAL_MONTH_COUNT - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: date.getMonth() + 1, year: date.getFullYear() });
  }
  return months;
}

export default function Home() {
  const [config, setConfig] = useState<Config>(() => loadConfig());
  const [credentials, setCredentials] = useState<SessionCredentials>({
    hepUsername: "",
    hepPassword: "",
    fusionSolarUsername: "",
    fusionSolarPassword: "",
  });
  const [activeTab, setActiveTab] = useState<TabId>("dash");
  const [selectedMonth, setSelectedMonth] = useState<MonthSelection>(() => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  });
  const [monthList, setMonthList] = useState<MonthSelection[]>(buildInitialMonthList);

  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState({ text: "Unesite tokene u Postavkama", cls: "" });
  const [hasData, setHasData] = useState(false);
  const [hasConsumption, setHasConsumption] = useState(false);
  const [hasFusionSolar, setHasFusionSolar] = useState(false);
  const [isCached, setIsCached] = useState(false);

  const dailyDataRef = useRef<Record<string, DailyEnergyData>>({});
  const fusionSolarRef = useRef<Record<string, FusionSolarDay>>({});
  const hourlyDataRef = useRef<Record<string, Record<number, HourlySample>>>({});
  const [sortedDays, setSortedDays] = useState<string[]>([]);

  /* Store active tokens so yearly batch loading can reuse them */
  const activeHepTokenRef = useRef<string>("");
  const activeFsCookieRef = useRef<string>("");

  /* Track a cache revision counter so YearlyOverview can react to new cached data */
  const [cacheRevision, setCacheRevision] = useState(0);

  /* Weather-based GHI scale factors for production forecast */
  const [weatherScaleFactors, setWeatherScaleFactors] = useState<Record<string, number>>({});

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  function applyCachedData(cached: CachedMonthData) {
    dailyDataRef.current = cached.dailyData;
    fusionSolarRef.current = cached.fusionSolarDaily;
    hourlyDataRef.current = cached.hourlyData;
    setSortedDays(cached.sortedDays);
    setHasConsumption(cached.hasConsumption);
    setHasFusionSolar(cached.hasFusionSolar);
    setHasData(true);
    setIsCached(true);
  }

  /* Auto-load from cache when selectedMonth changes */
  useEffect(() => {
    let cancelled = false;
    async function loadFromCache() {
      const monthKey = toMonthPrefix(selectedMonth);
      const cached = await getCachedMonth(monthKey);
      if (cancelled) return;
      if (cached) {
        applyCachedData(cached);
        setStatus({ text: `Predmemorija (${cached.cachedAt.slice(0, 10)})`, cls: "cached" });
      }
    }
    loadFromCache();
    return () => { cancelled = true; };
  }, [selectedMonth]);

  /* Fetch weather radiation data for the current month to compute forecast scale factors */
  useEffect(() => {
    if (!hasData) return;
    let cancelled = false;

    async function fetchWeather() {
      /* Open-Meteo supports ~92 past days and ~16 forecast days.
         Clamp the date range to the API's available window. */
      const today = new Date();
      const monthStart = new Date(selectedMonth.year, selectedMonth.month - 1, 1);
      const monthEnd = new Date(selectedMonth.year, selectedMonth.month, 0);
      const maxPast = new Date(today);
      maxPast.setDate(maxPast.getDate() - 92);
      const maxFuture = new Date(today);
      maxFuture.setDate(maxFuture.getDate() + 16);

      const clampedStart = monthStart < maxPast ? maxPast : monthStart;
      const clampedEnd = monthEnd > maxFuture ? maxFuture : monthEnd;
      if (clampedStart >= clampedEnd) return;

      const startDate = clampedStart.toISOString().slice(0, 10);
      const endDate = clampedEnd.toISOString().slice(0, 10);

      try {
        const response = await fetch(
          `/api/weather?latitude=${config.latitude}&longitude=${config.longitude}&start_date=${startDate}&end_date=${endDate}`
        );
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (cancelled || !data.hourly) return;

        const dailyRadiation = aggregateHourlyRadiationToDaily(data);

        /* Split into historical (analyzed days) and forecast (remaining days) */
        const todayStr = new Date().toISOString().slice(0, 10);
        const historicalDays = dailyRadiation.filter((d) => d.date < todayStr);
        const forecastDays = dailyRadiation.filter((d) => d.date >= todayStr);

        const scaleFactors = calculateGhiScaleFactors(historicalDays, forecastDays);
        if (!cancelled) setWeatherScaleFactors(scaleFactors);
      } catch {
        /* Weather fetch failed — forecast will use flat averages */
      }
    }

    fetchWeather();
    return () => { cancelled = true; };
  }, [hasData, selectedMonth, config.latitude, config.longitude]);

  const handleSaveConfig = useCallback((newConfig: Config) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  }, []);

  const handleResetConfig = useCallback(() => {
    const newConfig = resetConfig();
    setConfig(newConfig);
  }, []);

  const handleShiftMonth = useCallback((direction: -1 | 1) => {
    setMonthList((prev) => {
      const edgeMonth = direction === -1 ? prev[0] : prev[prev.length - 1];
      const shiftedDate = new Date(edgeMonth.year, edgeMonth.month - 1 + direction, 1);
      const newMonth = { month: shiftedDate.getMonth() + 1, year: shiftedDate.getFullYear() };
      const updatedList = direction === -1
        ? [newMonth, ...prev.slice(0, -1)]
        : [...prev.slice(1), newMonth];
      setSelectedMonth(newMonth);
      return updatedList;
    });
  }, []);

  async function fetchHEPData(token: string, meter: string, month: string, direction: string): Promise<HEPMeterRecord[]> {
    const targetUrl = `${HEP_API_BASE}/${meter}/krivulja/mjesec/${month}/smjer/${direction}`;
    const response = await fetch("/api/hep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl, token }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HEP ${direction}: ${response.status}: ${errorText.slice(0, 100)}`);
    }
    return response.json();
  }

  async function fetchFusionSolarData(cookie: string, station: string, month: MonthSelection) {
    const startDate = new Date(month.year, month.month - 1, 1);
    const dateString = `${month.year}-${String(month.month).padStart(2, "0")}-01 00:00:00`;
    const targetUrl = `${FUSION_SOLAR_API}?stationDn=${encodeURIComponent(station)}&timeDim=4&timeZone=1.0&timeZoneStr=Europe%2FZagreb&queryTime=${startDate.getTime()}&dateStr=${encodeURIComponent(dateString)}&_=${Date.now()}`;
    const response = await fetch("/api/fs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl, cookie }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FS: ${response.status}: ${errorText.slice(0, 100)}`);
    }
    const data = await response.json();
    if (data.failCode === 407 || data.failCode === 305 || data.failCode === 302) {
      throw new Error("FS session expired — refresh cookie");
    }
    return data;
  }

  /**
   * Core data fetching + processing logic, extracted so both handleAnalyze
   * and yearly batch loading can use it. Returns CachedMonthData or null on failure.
   */
  async function fetchAndProcessMonth(
    month: MonthSelection,
    hepToken: string,
    fsCookie: string,
    currentConfig: Config
  ): Promise<CachedMonthData | null> {
    const formattedMonth = formatMonthForApi(month);

    let generationRecords: HEPMeterRecord[];
    let consumptionRecords: HEPMeterRecord[] = [];

    try {
      generationRecords = await fetchHEPData(hepToken, currentConfig.meter, formattedMonth, "R");
    } catch {
      return null;
    }

    try {
      consumptionRecords = await fetchHEPData(hepToken, currentConfig.meter, formattedMonth, "P");
    } catch {
      consumptionRecords = [];
    }

    const hasConsumptionData = consumptionRecords.length > 0;

    let hasFusionSolarData = false;
    let fusionSolarData: Record<string, FusionSolarDay> = {};

    if (fsCookie && currentConfig.fusionSolarStation) {
      try {
        const fusionSolarResponse = await fetchFusionSolarData(fsCookie, currentConfig.fusionSolarStation, month);
        fusionSolarData = parseFusionSolarResponse(fusionSolarResponse, month);
        hasFusionSolarData = Object.keys(fusionSolarData).length > 0;
      } catch {
        /* FusionSolar fetch failed — continue without it */
      }
    }

    const { dailyData, hourlyData } = processHEPRecords(generationRecords, consumptionRecords, month);
    const days = Object.keys(dailyData).sort();
    if (days.length === 0) return null;

    const monthKey = toMonthPrefix(month);
    const cached: CachedMonthData = {
      monthKey,
      cachedAt: new Date().toISOString(),
      dailyData,
      fusionSolarDaily: fusionSolarData,
      hourlyData,
      sortedDays: days,
      hasConsumption: hasConsumptionData,
      hasFusionSolar: hasFusionSolarData,
    };

    await setCachedMonth(cached);
    return cached;
  }

  /** Resolve active tokens: login if credentials set, otherwise use manual tokens */
  async function resolveTokens(): Promise<{ hepToken: string; fsCookie: string } | null> {
    let hepToken = config.token;
    const hasHepCredentials = credentials.hepUsername && credentials.hepPassword;

    if (hasHepCredentials) {
      setStatus({ text: "HEP prijava...", cls: "" });
      try {
        const loginResponse = await fetch("/api/hep-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: credentials.hepUsername,
            password: credentials.hepPassword,
          }),
        });
        const loginResult = await loginResponse.json();
        if (loginResult.success && loginResult.token) {
          hepToken = loginResult.token;
        } else {
          setStatus({ text: `HEP prijava: ${loginResult.error || "neuspjeh"}`, cls: "err" });
          return null;
        }
      } catch (error) {
        setStatus({ text: `HEP prijava: ${(error as Error).message}`, cls: "err" });
        return null;
      }
    }

    if (!hepToken) {
      setStatus({ text: "HEP: unesite korisničke podatke ili token u Postavkama", cls: "err" });
      return null;
    }

    let fsCookie = config.fusionSolarCookie;
    const hasAutoLoginCredentials = credentials.fusionSolarUsername && credentials.fusionSolarPassword;

    if (hasAutoLoginCredentials && config.fusionSolarStation) {
      setStatus({ text: "FusionSolar prijava...", cls: "" });
      try {
        const loginResponse = await fetch("/api/fs-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: credentials.fusionSolarUsername,
            password: credentials.fusionSolarPassword,
            subdomain: config.fusionSolarSubdomain,
          }),
        });
        const loginResult = await loginResponse.json();
        if (loginResult.success && loginResult.cookie) {
          fsCookie = loginResult.cookie;
        }
      } catch {
        /* FS login failed — continue without it */
      }
    }

    /* Store active tokens for reuse by yearly batch loading */
    activeHepTokenRef.current = hepToken;
    activeFsCookieRef.current = fsCookie;

    return { hepToken, fsCookie };
  }

  async function handleAnalyze() {
    setIsLoading(true);
    setHasData(false);
    setIsCached(false);

    const tokens = await resolveTokens();
    if (!tokens) {
      setIsLoading(false);
      return;
    }

    setStatus({ text: "Dohvaćanje podataka...", cls: "" });

    const cached = await fetchAndProcessMonth(selectedMonth, tokens.hepToken, tokens.fsCookie, config);
    if (!cached) {
      setStatus({ text: "Nema podataka", cls: "err" });
      setIsLoading(false);
      return;
    }

    applyCachedData(cached);
    setIsCached(false);
    setCacheRevision((prev) => prev + 1);

    const finalStatus = `HEP ✓ ${cached.hasFusionSolar ? "FusionSolar ✓" : "FS —"}`;
    setStatus({ text: finalStatus, cls: "ok" });
    setIsLoading(false);
  }

  /**
   * Callback for YearlyOverview: fetch a single month using stored tokens.
   * Returns "ok" on success, "no-data" if month has no records (e.g. no panels installed),
   * or "auth-error" if login is needed. Does NOT update the main dashboard state.
   */
  async function handleLoadMonthForYearly(
    month: MonthSelection,
    forceRefresh = false
  ): Promise<"ok" | "no-data" | "auth-error"> {
    /* Check cache first (skip if force-refreshing) */
    if (!forceRefresh) {
      const monthKey = toMonthPrefix(month);
      const existing = await getCachedMonth(monthKey);
      if (existing) return "ok";
    }

    /* Need tokens — try to login if not already done */
    if (!activeHepTokenRef.current) {
      const tokens = await resolveTokens();
      if (!tokens) return "auth-error";
    }

    const cached = await fetchAndProcessMonth(
      month,
      activeHepTokenRef.current,
      activeFsCookieRef.current,
      config
    );
    if (cached) {
      setCacheRevision((prev) => prev + 1);
      return "ok";
    }
    return "no-data";
  }

  const derived = hasData
    ? calculateDerivedMetrics(sortedDays, dailyDataRef.current, fusionSolarRef.current, hasFusionSolar)
    : null;
  const bill = hasData && hasConsumption
    ? calculateBill(sortedDays, dailyDataRef.current, config)
    : null;
  const billWithoutSolar = hasData && hasConsumption
    ? calculateBillWithoutSolar(sortedDays, dailyDataRef.current, config)
    : null;
  const loadShiftAnalysis = hasData && hasConsumption
    ? analyzeLoadShifting(sortedDays, hourlyDataRef.current, config)
    : null;

  const forecast = hasData && derived
    ? calculateForecast(selectedMonth, derived, bill, billWithoutSolar, hasFusionSolar, weatherScaleFactors)
    : null;

  const measuredSavings = bill && billWithoutSolar ? billWithoutSolar - bill.total : 0;
  const roiAnalysis = hasData && hasConsumption && measuredSavings > 0 && config.systemCostEur > 0
    ? calculateRoi(measuredSavings, selectedMonth, config.systemCostEur, config.installationDate)
    : null;

  const statusColorClass = STATUS_COLOR_MAP[status.cls] || "text-text-dim";

  const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
  const sectionHeading = "font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4";
  const noteText = "font-mono text-xs text-text-dim leading-normal mt-3";

  const analyzeButtonLabel = isCached ? "OSVJEŽI" : "ANALIZIRAJ";

  const dashboardContent = hasData && derived ? (
    <div>
      <Cards
        sortedDays={sortedDays}
        dailyData={dailyDataRef.current}
        derived={derived}
        bill={bill}
        billWithoutSolar={billWithoutSolar}
        hasFusionSolar={hasFusionSolar}
        hasConsumption={hasConsumption}
      />
      {forecast && <ProductionForecast forecast={forecast} hasFusionSolar={hasFusionSolar} />}
      <div className={sectionBox}>
        <h3 className={sectionHeading}>Dnevni pregled — svi izvori</h3>
        <MainChart sortedDays={sortedDays} dailyData={dailyDataRef.current} derived={derived} hasFusionSolar={hasFusionSolar} hasConsumption={hasConsumption} />
      </div>
      <Insights sortedDays={sortedDays} dailyData={dailyDataRef.current} derived={derived} hasFusionSolar={hasFusionSolar} hasConsumption={hasConsumption} bill={bill} billWithoutSolar={billWithoutSolar} />
    </div>
  ) : null;

  const energyContent = hasData && derived ? (
    <>
      <EnergyFlow derived={derived} hasFusionSolar={hasFusionSolar} />
      <EnergyCharts sortedDays={sortedDays} derived={derived} hasFusionSolar={hasFusionSolar} hasConsumption={hasConsumption} />
    </>
  ) : (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>Energetski tok</h3>
      <p className={noteText}>Pokrenite analizu.</p>
    </div>
  );

  const hourlyContent = hasData && derived ? (
    <HourlyProfile sortedDays={sortedDays} hourlyData={hourlyDataRef.current} derived={derived} hasFusionSolar={hasFusionSolar} hasConsumption={hasConsumption} />
  ) : (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>Satni profil</h3>
      <p className={noteText}>Pokrenite analizu.</p>
    </div>
  );

  const billContent = hasData && hasConsumption && bill ? (
    <BillPanel sortedDays={sortedDays} dailyData={dailyDataRef.current} bill={bill} billWithoutSolar={billWithoutSolar!} config={config} />
  ) : (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>Procjena računa</h3>
      <p className={noteText}>{hasData ? "Potrebni podaci preuzete energije." : "Pokrenite analizu."}</p>
    </div>
  );

  const tableContent = hasData && derived ? (
    <DataTable dailyData={dailyDataRef.current} derived={derived} hasFusionSolar={hasFusionSolar} hasConsumption={hasConsumption} />
  ) : (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>Tablica</h3>
      <p className={noteText}>Pokrenite analizu.</p>
    </div>
  );

  return (
    <div className="relative z-1 w-full max-w-[1100px] flex flex-col gap-4 px-4 pt-6 pb-16 sm:px-6 md:px-10 md:gap-6 md:pt-10 md:pb-20">
      <Header meter={config.meter} />
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div className={activeTab === "settings" ? "block" : "hidden"}>
        <Settings config={config} credentials={credentials} onSave={handleSaveConfig} onReset={handleResetConfig} onCredentialsChange={setCredentials} />
      </div>

      <div className={activeTab === "dash" ? "flex flex-col gap-6" : "hidden"}>
        <MonthNav monthList={monthList} selectedMonth={selectedMonth} onPickMonth={setSelectedMonth} onShiftMonth={handleShiftMonth} />
        <div className="flex gap-5 items-center flex-wrap">
          <button
            className="bg-amber text-background border-none rounded-sm px-6 py-2.5 font-body text-sm font-bold cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-[#f5b030] hover:-translate-y-px active:translate-y-0 disabled:opacity-35 disabled:cursor-wait disabled:translate-y-0"
            onClick={handleAnalyze}
            disabled={isLoading}
          >
            {analyzeButtonLabel}
          </button>
          <div className={`flex items-center gap-2 font-mono text-xs min-h-5 ${statusColorClass} ${isLoading ? "loading" : ""}`}>
            <div className="spinner" />
            <span>{status.text}</span>
          </div>
        </div>
        {dashboardContent}
      </div>

      <div className={activeTab === "yearly" ? "block" : "hidden"}>
        <YearlyOverview config={config} onLoadMonth={handleLoadMonthForYearly} cacheRevision={cacheRevision} />
      </div>

      <div className={activeTab === "energy" ? "block" : "hidden"}>{energyContent}</div>
      <div className={activeTab === "hourly" ? "block" : "hidden"}>{hourlyContent}</div>
      <div className={activeTab === "optimize" ? "block" : "hidden"}>
        {hasData && loadShiftAnalysis ? (
          <LoadShiftInsights analysis={loadShiftAnalysis} hasFusionSolar={hasFusionSolar} />
        ) : (
          <div className={sectionBox}>
            <h3 className={sectionHeading}>Optimizacija potrošnje</h3>
            <p className={noteText}>{hasData ? "Potrebni podaci preuzete energije." : "Pokrenite analizu."}</p>
          </div>
        )}
      </div>
      <div className={activeTab === "roi" ? "block" : "hidden"}>
        {roiAnalysis ? (
          <RoiCalculator
            analysis={roiAnalysis}
            systemCostEur={config.systemCostEur}
            selectedMonth={selectedMonth}
            hasInstallationDate={!!config.installationDate}
          />
        ) : (
          <div className={sectionBox}>
            <h3 className={sectionHeading}>ROI — Povrat investicije</h3>
            <p className={noteText}>
              {!hasData
                ? "Pokrenite analizu."
                : config.systemCostEur <= 0
                  ? "Unesite cijenu sustava u Postavkama."
                  : "Potrebni podaci preuzete energije i ušteda > 0 €."}
            </p>
          </div>
        )}
      </div>
      <div className={activeTab === "bill" ? "block" : "hidden"}>{billContent}</div>
      <div className={activeTab === "table" ? "block" : "hidden"}>{tableContent}</div>
    </div>
  );
}
