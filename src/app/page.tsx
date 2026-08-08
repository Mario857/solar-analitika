"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  Config,
  SessionCredentials,
  MonthSelection,
  CachedMonthData,
  DailyEnergyData,
  FusionSolarDay,
  HourlySample,
  HEPMeterRecord,
  DegradationAnalysis,
  MeasuredMonthSavings,
  WeatherDayRadiation,
} from "@/lib/types";
import {
  saveConfig, resetConfig, resolveTariff,
  subscribeToConfig, getConfigSnapshot, getServerConfigSnapshot,
  loadCachedTokens, saveCachedHepToken, saveCachedFsCookie,
  HEP_API_BASE, FUSION_SOLAR_API,
} from "@/lib/config";
import {
  processHEPRecords,
  parseFusionSolarResponse,
  calculateDerivedMetrics,
  calculateBill,
  calculateBillWithoutSolar,
  formatMonthForApi,
  analyzeLoadShifting,
  compareTariffModels,
  calculateSystemEfficiency,
  calculateDegradation,
  calculateRoi,
  calculateForecast,
  aggregateHourlyRadiationToDaily,
  calculateGhiScaleFactors,
  computeMonthSummary,
  toMonthPrefix,
} from "@/lib/calculations";
import { getCachedMonth, setCachedMonth, getAllCachedMonthKeys } from "@/lib/cache";
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
import Donate from "@/components/Donate";
import ShareButton from "@/components/ShareButton";
import BatterySimulator from "@/components/BatterySimulator";
import TariffComparisonPanel from "@/components/TariffComparison";
import SystemEfficiencyPanel from "@/components/SystemEfficiencyPanel";
import DegradationPanel from "@/components/DegradationPanel";
import MonthComparison from "@/components/MonthComparison";
import AiChat from "@/components/AiChat";

type TabId = "dash" | "yearly" | "energy" | "hourly" | "optimize" | "battery" | "compare" | "roi" | "bill" | "table" | "ai" | "settings";

const INITIAL_MONTH_COUNT = 6;

const STATUS_COLOR_MAP: Record<string, string> = {
  err: "text-red",
  ok: "text-green",
  cached: "text-cyan",
};

/** Everything the dashboard renders for one month — always replaced as a unit */
interface MonthDataset {
  dailyData: Record<string, DailyEnergyData>;
  fusionSolarDaily: Record<string, FusionSolarDay>;
  hourlyData: Record<string, Record<number, HourlySample>>;
  sortedDays: string[];
  hasConsumption: boolean;
  hasFusionSolar: boolean;
}

const EMPTY_DATASET: MonthDataset = {
  dailyData: {},
  fusionSolarDaily: {},
  hourlyData: {},
  sortedDays: [],
  hasConsumption: false,
  hasFusionSolar: false,
};

/** A caught value is `unknown` — narrow it instead of asserting it is an Error */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Local "YYYY-MM-DD" — toISOString would shift the date across the UTC boundary */
function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  /* Config lives in an external store: the server snapshot is DEFAULTS and the
     client snapshot comes from localStorage, so hydration stays consistent
     without setting state inside an effect. */
  const config = useSyncExternalStore(subscribeToConfig, getConfigSnapshot, getServerConfigSnapshot);
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
  const [isCached, setIsCached] = useState(false);

  /* One state object rather than refs: the data and the day index that indexes it
     must swap together. Mutating a ref and reading it during render lets React
     paint one month's totals against another month's day list. */
  const [dataset, setDataset] = useState<MonthDataset>(EMPTY_DATASET);
  const { dailyData, fusionSolarDaily, hourlyData, sortedDays, hasConsumption, hasFusionSolar } = dataset;
  const hasData = sortedDays.length > 0;

  /* Store active tokens so yearly batch loading can reuse them */
  const activeHepTokenRef = useRef<string>("");
  const activeFsCookieRef = useRef<string>("");

  /* Why HEP last failed (bad login, or an HTTP error from the data endpoint).
     Without this the generic "Nema podataka" hides the real cause — e.g. when
     HEP retired the /v1 path and every call started answering 405. */
  const lastHepFailureMessageRef = useRef<string | null>(null);

  /* Track a cache revision counter so YearlyOverview can react to new cached data */
  const [cacheRevision, setCacheRevision] = useState(0);

  /* Weather-based GHI scale factors for production forecast */
  const [weatherScaleFactors, setWeatherScaleFactors] = useState<Record<string, number>>({});
  /* Raw daily radiation data for system efficiency calculation */
  const [weatherRadiation, setWeatherRadiation] = useState<WeatherDayRadiation[]>([]);
  /* Degradation analysis from all cached months */
  const [degradationAnalysis, setDegradationAnalysis] = useState<DegradationAnalysis | null>(null);
  /* Real per-month savings across every cached month — the ROI baseline */
  const [measuredMonthSavings, setMeasuredMonthSavings] = useState<MeasuredMonthSavings[]>([]);

  function applyCachedData(cached: CachedMonthData) {
    setDataset({
      dailyData: cached.dailyData,
      fusionSolarDaily: cached.fusionSolarDaily,
      hourlyData: cached.hourlyData,
      sortedDays: cached.sortedDays,
      hasConsumption: cached.hasConsumption,
      hasFusionSolar: cached.hasFusionSolar,
    });
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
      } else {
        /* No cache for this month — clear stale data from previous month */
        setDataset(EMPTY_DATASET);
        setIsCached(false);
        setStatus({ text: "Nema podataka — kliknite Analiziraj", cls: "" });
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
      /* Past months come from the archive endpoint, so only the future needs
         clamping — Open-Meteo forecasts about 16 days ahead. */
      const today = new Date();
      const monthStart = new Date(selectedMonth.year, selectedMonth.month - 1, 1);
      const monthEnd = new Date(selectedMonth.year, selectedMonth.month, 0);
      const maxFuture = new Date(today);
      maxFuture.setDate(maxFuture.getDate() + 16);

      const clampedEnd = monthEnd > maxFuture ? maxFuture : monthEnd;
      if (monthStart > clampedEnd) return;

      const startDate = toLocalDateKey(monthStart);
      const endDate = toLocalDateKey(clampedEnd);

      try {
        const response = await fetch(
          `/api/weather?latitude=${config.latitude}&longitude=${config.longitude}&start_date=${startDate}&end_date=${endDate}`
        );
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (cancelled || !data.hourly) return;

        const dailyRadiation = aggregateHourlyRadiationToDaily(data);

        /* Split into historical (analyzed days) and forecast (remaining days).
           Local date key, not UTC — near midnight toISOString names another day. */
        const todayStr = toLocalDateKey(today);
        const historicalDays = dailyRadiation.filter((d) => d.date < todayStr);
        const forecastDays = dailyRadiation.filter((d) => d.date >= todayStr);

        const scaleFactors = calculateGhiScaleFactors(historicalDays, forecastDays);
        if (!cancelled) {
          setWeatherScaleFactors(scaleFactors);
          setWeatherRadiation(dailyRadiation);
        }
      } catch {
        /* Weather fetch failed — forecast will use flat averages */
      }
    }

    fetchWeather();
    return () => { cancelled = true; };
  }, [hasData, selectedMonth, config.latitude, config.longitude]);

  /* Derive whole-history analyses from every cached month: panel degradation, and
     the measured monthly savings that anchor the ROI projection. Extrapolating ROI
     from whichever single month happens to be open swings the annual figure by 2x+. */
  useEffect(() => {
    if (!hasData) return;
    let cancelled = false;

    async function loadHistory() {
      const allKeys = await getAllCachedMonthKeys();
      if (cancelled || allKeys.length === 0) return;

      const allCached: CachedMonthData[] = [];
      for (const key of allKeys) {
        const cached = await getCachedMonth(key);
        if (cancelled) return;
        if (cached) allCached.push(cached);
      }
      if (cancelled) return;

      setDegradationAnalysis(calculateDegradation(allCached, config.installedKwp));

      const savings: MeasuredMonthSavings[] = allCached
        .filter((cached) => cached.hasConsumption)
        .map((cached) => ({
          monthKey: cached.monthKey,
          savingsEur: computeMonthSummary(cached, config).savingsEur,
        }));
      setMeasuredMonthSavings(savings);
    }

    loadHistory();
    return () => { cancelled = true; };
  }, [hasData, cacheRevision, config]);

  /* saveConfig/resetConfig publish to the config store, which re-renders subscribers */
  const handleSaveConfig = useCallback((newConfig: Config) => {
    saveConfig(newConfig);
  }, []);

  const handleResetConfig = useCallback(() => {
    resetConfig();
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

    /* A fetch that gets this far supersedes any earlier login complaint */
    lastHepFailureMessageRef.current = null;

    let generationRecords: HEPMeterRecord[];
    let consumptionRecords: HEPMeterRecord[] = [];

    try {
      generationRecords = await fetchHEPData(hepToken, currentConfig.meter, formattedMonth, "R");
    } catch (error) {
      lastHepFailureMessageRef.current = toErrorMessage(error);
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

  /** Login to HEP and return a fresh token, or null on failure */
  async function loginHep(): Promise<string | null> {
    const hasHepCredentials = credentials.hepUsername && credentials.hepPassword;
    if (!hasHepCredentials) return null;

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
        saveCachedHepToken(loginResult.token);
        /* Persist token in config so it's visible in Settings */
        saveConfig({ ...config, token: loginResult.token });
        lastHepFailureMessageRef.current = null;
        return loginResult.token;
      }
      setHepFailure(`HEP prijava: ${loginResult.error || "neuspjeh"}`);
    } catch (error) {
      setHepFailure(`HEP prijava: ${toErrorMessage(error)}`);
    }
    return null;
  }

  /** Show why HEP failed and keep it, so a later fallback cannot bury the cause */
  function setHepFailure(message: string) {
    lastHepFailureMessageRef.current = message;
    setStatus({ text: message, cls: "err" });
  }

  /** Login to FusionSolar and return a fresh cookie, or null on failure */
  async function loginFusionSolar(): Promise<string | null> {
    const hasAutoLoginCredentials = credentials.fusionSolarUsername && credentials.fusionSolarPassword;
    if (!hasAutoLoginCredentials || !config.fusionSolarStation) return null;

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
        saveCachedFsCookie(loginResult.cookie);
        /* Persist cookie in config so it's visible in Settings */
        saveConfig({ ...config, fusionSolarCookie: loginResult.cookie });
        return loginResult.cookie;
      }
    } catch {
      /* FS login failed — continue without it */
    }
    return null;
  }

  /**
   * Resolve active tokens using this priority:
   * 1. Cached tokens from localStorage (if not expired)
   * 2. Fresh login using session credentials
   * 3. Manual tokens from config (fallback)
   */
  async function resolveTokens(): Promise<{ hepToken: string; fsCookie: string } | null> {
    const cached = loadCachedTokens();
    const now = Date.now();

    /* --- HEP token --- */
    let hepToken = "";

    /* Try cached token first */
    if (cached.hepToken && cached.hepTokenExpiry > now) {
      hepToken = cached.hepToken;
    }

    /* No cached token — try login */
    if (!hepToken) {
      const freshToken = await loginHep();
      if (freshToken) {
        hepToken = freshToken;
      }
    }

    /* Still no token — fall back to manual token from config */
    if (!hepToken && config.token) {
      hepToken = config.token;
    }

    if (!hepToken) {
      setStatus({ text: "HEP: unesite korisničke podatke ili token u Postavkama", cls: "err" });
      return null;
    }

    /* --- FusionSolar cookie --- */
    let fsCookie = "";

    /* Try cached cookie first */
    if (cached.fsCookie && cached.fsCookieExpiry > now) {
      fsCookie = cached.fsCookie;
    }

    /* No cached cookie — try login */
    if (!fsCookie) {
      const freshCookie = await loginFusionSolar();
      if (freshCookie) {
        fsCookie = freshCookie;
      }
    }

    /* Still no cookie — fall back to manual cookie from config */
    if (!fsCookie && config.fusionSolarCookie) {
      fsCookie = config.fusionSolarCookie;
    }

    /* Store active tokens for reuse by yearly batch loading */
    activeHepTokenRef.current = hepToken;
    activeFsCookieRef.current = fsCookie;

    return { hepToken, fsCookie };
  }

  async function handleAnalyze() {
    setIsLoading(true);
    setIsCached(false);

    const tokens = await resolveTokens();
    if (!tokens) {
      setIsLoading(false);
      return;
    }

    setStatus({ text: "Dohvaćanje podataka...", cls: "" });

    let cached = await fetchAndProcessMonth(selectedMonth, tokens.hepToken, tokens.fsCookie, config);

    /* If fetch failed and we were using a cached token, it may be expired.
       Try re-login with session credentials and retry once. */
    if (!cached) {
      const freshHepToken = await loginHep();
      if (freshHepToken) {
        tokens.hepToken = freshHepToken;
        activeHepTokenRef.current = freshHepToken;
        setStatus({ text: "Token obnovljen, ponovni pokušaj...", cls: "" });
        cached = await fetchAndProcessMonth(selectedMonth, tokens.hepToken, tokens.fsCookie, config);
      }
    }

    if (!cached) {
      /* A recorded HEP failure is the real cause; a clean run that simply found
         no records for the month is the only case that deserves "Nema podataka". */
      const failureMessage = lastHepFailureMessageRef.current ?? "Nema podataka";
      setStatus({ text: failureMessage, cls: "err" });
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

    let cached = await fetchAndProcessMonth(
      month,
      activeHepTokenRef.current,
      activeFsCookieRef.current,
      config
    );

    /* If fetch failed, token may be stale — try re-login once */
    if (!cached) {
      const freshHepToken = await loginHep();
      const freshFsCookie = await loginFusionSolar();
      if (freshHepToken) {
        activeHepTokenRef.current = freshHepToken;
      }
      if (freshFsCookie) {
        activeFsCookieRef.current = freshFsCookie;
      }
      if (freshHepToken) {
        cached = await fetchAndProcessMonth(
          month,
          activeHepTokenRef.current,
          activeFsCookieRef.current,
          config
        );
      } else {
        return "auth-error";
      }
    }

    if (cached) {
      setCacheRevision((prev) => prev + 1);
      return "ok";
    }
    return "no-data";
  }

  const derived = hasData
    ? calculateDerivedMetrics(sortedDays, dailyData, fusionSolarDaily, hasFusionSolar)
    : null;
  /* Resolve tariff prices for the selected month */
  const monthKey = toMonthPrefix(selectedMonth);
  const activeTariff = resolveTariff(config, monthKey);
  /* Without production data self-consumption is unknown — bill estimates fall back to feed-in */
  const selfConsumedForBill = hasFusionSolar && derived ? derived.totalSelfConsumed : null;
  const bill = hasData && hasConsumption
    ? calculateBill(sortedDays, dailyData, activeTariff)
    : null;
  const billWithoutSolar = hasData && hasConsumption
    ? calculateBillWithoutSolar(sortedDays, dailyData, activeTariff, selfConsumedForBill)
    : null;
  const loadShiftAnalysis = hasData && hasConsumption
    ? analyzeLoadShifting(sortedDays, hourlyData)
    : null;
  const tariffComparison = hasData && hasConsumption
    ? compareTariffModels(sortedDays, dailyData, activeTariff, selfConsumedForBill)
    : null;

  const systemEfficiency = hasData && derived && hasFusionSolar
    ? calculateSystemEfficiency(derived, weatherRadiation, config.installedKwp)
    : null;

  const forecast = hasData && derived
    ? calculateForecast(selectedMonth, derived, dailyData, activeTariff, hasConsumption, hasFusionSolar, weatherScaleFactors)
    : null;

  /* Savings against the real monthly cost: invoice minus surplus payout (otkup) */
  const measuredSavings = bill && billWithoutSolar !== null ? billWithoutSolar - bill.effectiveCostEur : 0;
  const roiAnalysis = hasData && hasConsumption && measuredSavings > 0 && config.systemCostEur > 0
    ? calculateRoi(measuredSavings, selectedMonth, config.systemCostEur, config.installationDate, measuredMonthSavings)
    : null;

  const statusColorClass = STATUS_COLOR_MAP[status.cls] || "text-text-dim";

  const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
  const sectionHeading = "font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4";
  const noteText = "font-mono text-xs text-text-dim leading-normal mt-3";

  const analyzeButtonLabel = isCached ? "OSVJEŽI" : "ANALIZIRAJ";

  const forecastPanel = forecast
    ? <ProductionForecast forecast={forecast} hasFusionSolar={hasFusionSolar} />
    : null;

  const dashboardContent = hasData && derived ? (
    <div>
      <div id="share-cards">
        <Cards
          sortedDays={sortedDays}
          dailyData={dailyData}
          derived={derived}
          bill={bill}
          billWithoutSolar={billWithoutSolar}
          hasFusionSolar={hasFusionSolar}
          hasConsumption={hasConsumption}
        />
      </div>
      {forecastPanel}
      <div id="share-chart" className={sectionBox}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-text-dim">Dnevni pregled — svi izvori</h3>
          <ShareButton targetId="share-chart" fileName="solar-dnevni-pregled" />
        </div>
        <MainChart sortedDays={sortedDays} dailyData={dailyData} derived={derived} hasFusionSolar={hasFusionSolar} hasConsumption={hasConsumption} />
      </div>
      <Insights sortedDays={sortedDays} dailyData={dailyData} derived={derived} hasFusionSolar={hasFusionSolar} hasConsumption={hasConsumption} bill={bill} billWithoutSolar={billWithoutSolar} />
    </div>
  ) : null;

  const systemEfficiencyPanel = systemEfficiency
    ? <SystemEfficiencyPanel efficiency={systemEfficiency} installedKwp={config.installedKwp} />
    : null;
  const degradationPanel = degradationAnalysis
    ? <DegradationPanel analysis={degradationAnalysis} installedKwp={config.installedKwp} />
    : null;

  const energyContent = hasData && derived ? (
    <>
      <EnergyFlow derived={derived} hasFusionSolar={hasFusionSolar} />
      <EnergyCharts sortedDays={sortedDays} derived={derived} hasFusionSolar={hasFusionSolar} hasConsumption={hasConsumption} />
      {systemEfficiencyPanel}
      {degradationPanel}
    </>
  ) : (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>Energetski tok</h3>
      <p className={noteText}>Pokrenite analizu.</p>
    </div>
  );

  const hourlyContent = hasData && derived ? (
    <HourlyProfile sortedDays={sortedDays} hourlyData={hourlyData} derived={derived} hasFusionSolar={hasFusionSolar} hasConsumption={hasConsumption} />
  ) : (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>Satni profil</h3>
      <p className={noteText}>Pokrenite analizu.</p>
    </div>
  );

  const tariffComparisonPanel = tariffComparison
    ? <TariffComparisonPanel comparison={tariffComparison} activeTariffModel={activeTariff.tariffModel} />
    : null;
  const billEmptyMessage = hasData ? "Potrebni podaci preuzete energije." : "Pokrenite analizu.";

  const billContent = hasData && hasConsumption && bill && billWithoutSolar !== null ? (
    <>
      <div id="share-bill">
        <BillPanel bill={bill} billWithoutSolar={billWithoutSolar} tariff={activeTariff} />
      </div>
      {tariffComparisonPanel}
    </>
  ) : (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>Procjena računa</h3>
      <p className={noteText}>{billEmptyMessage}</p>
    </div>
  );

  const tableContent = hasData && derived ? (
    <DataTable dailyData={dailyData} derived={derived} hasFusionSolar={hasFusionSolar} hasConsumption={hasConsumption} />
  ) : (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>Tablica</h3>
      <p className={noteText}>Pokrenite analizu.</p>
    </div>
  );

  const optimizeContent = hasData && loadShiftAnalysis ? (
    <LoadShiftInsights analysis={loadShiftAnalysis} hasFusionSolar={hasFusionSolar} />
  ) : (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>Optimizacija potrošnje</h3>
      <p className={noteText}>{billEmptyMessage}</p>
    </div>
  );

  const batteryContent = hasData && hasConsumption && derived ? (
    <BatterySimulator
      sortedDays={sortedDays}
      hourlyData={hourlyData}
      derived={derived}
      tariff={activeTariff}
      selectedMonth={selectedMonth}
    />
  ) : (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>Simulacija baterije</h3>
      <p className={noteText}>{billEmptyMessage}</p>
    </div>
  );

  const roiEmptyMessage = (() => {
    if (!hasData) return "Pokrenite analizu.";
    if (config.systemCostEur <= 0) return "Unesite cijenu sustava u Postavkama.";
    return "Potrebni podaci preuzete energije i ušteda > 0 €.";
  })();

  const roiContent = roiAnalysis ? (
    <RoiCalculator
      analysis={roiAnalysis}
      systemCostEur={config.systemCostEur}
      selectedMonth={selectedMonth}
      hasInstallationDate={!!config.installationDate}
    />
  ) : (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>ROI — Povrat investicije</h3>
      <p className={noteText}>{roiEmptyMessage}</p>
    </div>
  );

  return (
    <div className="relative z-1 w-full max-w-[1100px] flex flex-col gap-4 px-4 pt-6 pb-16 sm:px-6 md:px-10 md:gap-6 md:pt-10 md:pb-20">
      <Header meter={config.meter} />
      <Donate />
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
      <div className={activeTab === "optimize" ? "block" : "hidden"}>{optimizeContent}</div>
      <div className={activeTab === "battery" ? "block" : "hidden"}>{batteryContent}</div>
      <div className={activeTab === "compare" ? "block" : "hidden"}>
        <MonthComparison config={config} cacheRevision={cacheRevision} />
      </div>
      <div className={activeTab === "roi" ? "block" : "hidden"}>{roiContent}</div>
      <div className={activeTab === "bill" ? "block" : "hidden"}>{billContent}</div>
      <div className={activeTab === "table" ? "block" : "hidden"}>{tableContent}</div>
      <div className={activeTab === "ai" ? "block" : "hidden"}>
        <AiChat
          config={config}
          monthKey={monthKey}
          derived={derived}
          bill={bill}
          billWithoutSolar={billWithoutSolar}
          tariff={activeTariff}
          loadShift={loadShiftAnalysis}
          hasFusionSolar={hasFusionSolar}
          hasConsumption={hasConsumption}
        />
      </div>
    </div>
  );
}
