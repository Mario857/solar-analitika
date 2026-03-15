"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Config,
  MonthSelection,
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
} from "@/lib/calculations";
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
import Settings from "@/components/Settings";

type TabId = "dash" | "energy" | "hourly" | "bill" | "table" | "settings";

const INITIAL_MONTH_COUNT = 6;

const STATUS_COLOR_MAP: Record<string, string> = {
  err: "text-red",
  ok: "text-green",
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

  const dailyDataRef = useRef<Record<string, DailyEnergyData>>({});
  const fusionSolarRef = useRef<Record<string, FusionSolarDay>>({});
  const hourlyDataRef = useRef<Record<string, Record<number, HourlySample>>>({});
  const [sortedDays, setSortedDays] = useState<string[]>([]);

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

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

  const handleAnalyze = useCallback(async () => {
    const formattedMonth = formatMonthForApi(selectedMonth);
    setIsLoading(true);
    setHasData(false);

    // Determine HEP token: auto-login if credentials are set, otherwise use manual token
    let activeHepToken = config.token;
    const hasHepCredentials = config.hepUsername && config.hepPassword;

    if (hasHepCredentials) {
      setStatus({ text: "HEP prijava...", cls: "" });
      try {
        const loginResponse = await fetch("/api/hep-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: config.hepUsername,
            password: config.hepPassword,
          }),
        });
        const loginResult = await loginResponse.json();
        if (loginResult.success && loginResult.token) {
          activeHepToken = loginResult.token;
          setStatus({ text: "HEP prijava ✓", cls: "" });
        } else {
          setStatus({ text: `HEP prijava: ${loginResult.error || "neuspjeh"}`, cls: "err" });
          setIsLoading(false);
          return;
        }
      } catch (error) {
        setStatus({ text: `HEP prijava: ${(error as Error).message}`, cls: "err" });
        setIsLoading(false);
        return;
      }
    }

    if (!activeHepToken) {
      setStatus({ text: "HEP: unesite korisničke podatke ili token u Postavkama", cls: "err" });
      setIsLoading(false);
      return;
    }

    setStatus({ text: "HEP predano (R)...", cls: "" });
    let generationRecords: HEPMeterRecord[];
    let consumptionRecords: HEPMeterRecord[] = [];

    try {
      generationRecords = await fetchHEPData(activeHepToken, config.meter, formattedMonth, "R");
    } catch (error) {
      setStatus({ text: `HEP gen: ${(error as Error).message}`, cls: "err" });
      setIsLoading(false);
      return;
    }

    setStatus({ text: `${generationRecords.length} gen. HEP preuzeto (P)...`, cls: "" });
    try {
      consumptionRecords = await fetchHEPData(activeHepToken, config.meter, formattedMonth, "P");
    } catch {
      consumptionRecords = [];
    }

    const hasConsumptionData = consumptionRecords.length > 0;
    setHasConsumption(hasConsumptionData);

    let hasFusionSolarData = false;
    let fusionSolarData: Record<string, FusionSolarDay> = {};

    // Determine FusionSolar cookie: auto-login if credentials are set, otherwise use manual cookie
    const hasAutoLoginCredentials = config.fusionSolarUsername && config.fusionSolarPassword;
    let activeFusionSolarCookie = config.fusionSolarCookie;

    if (hasAutoLoginCredentials && config.fusionSolarStation) {
      setStatus({ text: "FusionSolar prijava...", cls: "" });
      try {
        const loginResponse = await fetch("/api/fs-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: config.fusionSolarUsername,
            password: config.fusionSolarPassword,
            subdomain: config.fusionSolarSubdomain,
          }),
        });
        const loginResult = await loginResponse.json();
        if (loginResult.success && loginResult.cookie) {
          activeFusionSolarCookie = loginResult.cookie;
          setStatus({ text: "FS prijava ✓", cls: "" });
        } else {
          setStatus({ text: `FS prijava: ${loginResult.error || "neuspjeh"}`, cls: "err" });
        }
      } catch (error) {
        setStatus({ text: `FS prijava: ${(error as Error).message}`, cls: "err" });
      }
    }

    if (activeFusionSolarCookie && config.fusionSolarStation) {
      setStatus({ text: "FusionSolar podaci...", cls: "" });
      try {
        const fusionSolarResponse = await fetchFusionSolarData(activeFusionSolarCookie, config.fusionSolarStation, selectedMonth);
        fusionSolarData = parseFusionSolarResponse(fusionSolarResponse, selectedMonth);
        hasFusionSolarData = Object.keys(fusionSolarData).length > 0;
        const statusText = hasFusionSolarData ? "FS ✓" : "FS: no daily data found";
        setStatus({ text: statusText, cls: "" });
      } catch (error) {
        setStatus({ text: `FS: ${(error as Error).message}`, cls: "" });
      }
    }

    setHasFusionSolar(hasFusionSolarData);

    setStatus({ text: "Analiza...", cls: "" });

    const { dailyData, hourlyData } = processHEPRecords(generationRecords, consumptionRecords, selectedMonth);
    dailyDataRef.current = dailyData;
    hourlyDataRef.current = hourlyData;
    fusionSolarRef.current = fusionSolarData;

    const days = Object.keys(dailyData).sort();
    setSortedDays(days);

    if (days.length === 0) {
      setStatus({ text: "Nema podataka", cls: "err" });
      setIsLoading(false);
      return;
    }

    setHasData(true);
    const finalStatus = `HEP ✓ ${hasFusionSolarData ? "FusionSolar ✓" : "FS —"}`;
    setStatus({ text: finalStatus, cls: "ok" });
    setIsLoading(false);
  }, [config, selectedMonth]);

  const derived = hasData
    ? calculateDerivedMetrics(sortedDays, dailyDataRef.current, fusionSolarRef.current, hasFusionSolar)
    : null;
  const bill = hasData && hasConsumption
    ? calculateBill(sortedDays, dailyDataRef.current, config)
    : null;
  const billWithoutSolar = hasData && hasConsumption
    ? calculateBillWithoutSolar(sortedDays, dailyDataRef.current, config)
    : null;

  const statusColorClass = STATUS_COLOR_MAP[status.cls] || "text-text-dim";

  const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
  const sectionHeading = "font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4";
  const noteText = "font-mono text-xs text-text-dim leading-normal mt-3";

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
        <Settings config={config} onSave={handleSaveConfig} onReset={handleResetConfig} />
      </div>

      <div className={activeTab === "dash" ? "flex flex-col gap-6" : "hidden"}>
        <MonthNav monthList={monthList} selectedMonth={selectedMonth} onPickMonth={setSelectedMonth} onShiftMonth={handleShiftMonth} />
        <div className="flex gap-5 items-center flex-wrap">
          <button
            className="bg-amber text-background border-none rounded-sm px-6 py-2.5 font-body text-sm font-bold cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-[#f5b030] hover:-translate-y-px active:translate-y-0 disabled:opacity-35 disabled:cursor-wait disabled:translate-y-0"
            onClick={handleAnalyze}
            disabled={isLoading}
          >
            ANALIZIRAJ
          </button>
          <div className={`flex items-center gap-2 font-mono text-xs min-h-5 ${statusColorClass} ${isLoading ? "loading" : ""}`}>
            <div className="spinner" />
            <span>{status.text}</span>
          </div>
        </div>
        {dashboardContent}
      </div>

      <div className={activeTab === "energy" ? "block" : "hidden"}>{energyContent}</div>
      <div className={activeTab === "hourly" ? "block" : "hidden"}>{hourlyContent}</div>
      <div className={activeTab === "bill" ? "block" : "hidden"}>{billContent}</div>
      <div className={activeTab === "table" ? "block" : "hidden"}>{tableContent}</div>
    </div>
  );
}
