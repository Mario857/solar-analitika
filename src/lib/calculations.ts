import {
  Config,
  TariffPrices,
  TariffComparison,
  SystemEfficiency,
  DailyEfficiency,
  CachedMonthData,
  DailyEnergyData,
  FusionSolarDay,
  DerivedMonthlyData,
  BillBreakdown,
  BatteryConfig,
  BatteryHourState,
  BatterySimulationResult,
  ForecastDayEntry,
  HEPMeterRecord,
  HourlySample,
  LoadShiftAnalysis,
  HourlyLoadShiftProfile,
  MonthForecast,
  MonthSelection,
  MonthSummary,
  WeatherDayRadiation,
  RoiAnalysis,
  RoiMonthProjection,
  DegradationAnalysis,
  DegradationMonthPoint,
  YearOverYearComparison,
  MeasuredMonthSavings,
  CalendarMonthSavings,
} from "@/lib/types";
import { resolveTariff } from "@/lib/config";

const HOURS_IN_DAY = 24;
const QUARTER_HOUR_FACTOR = 0.25;
/** The battery simulation steps one hour at a time, so kW × this = kWh per step */
const HOURS_PER_STEP = 1;

/**
 * Format a Date as a local "YYYY-MM-DD" key. HEP timestamps are Croatian local
 * time, so the date key must come from the same local clock as getHours() —
 * toISOString() would shift readings before 01:00/02:00 onto the previous day.
 */
function formatLocalDateKey(timestamp: Date): string {
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** HEP switches the VT window together with daylight saving time, not by calendar month */
function isDaylightSavingTime(timestamp: Date): boolean {
  const januaryOffset = new Date(timestamp.getFullYear(), 0, 1).getTimezoneOffset();
  const julyOffset = new Date(timestamp.getFullYear(), 6, 1).getTimezoneOffset();
  const standardTimeOffset = Math.max(januaryOffset, julyOffset);
  return timestamp.getTimezoneOffset() < standardTimeOffset;
}

/** High tariff (VT) window for a given day: summer time 08-22, standard time 07-21 */
function getHighTariffWindow(day: Date): { startHour: number; endHour: number } {
  return isDaylightSavingTime(day)
    ? { startHour: 8, endHour: 22 }
    : { startHour: 7, endHour: 21 };
}

/** Check if a timestamp falls within high tariff (VT) hours */
export function isHighTariffHour(timestamp: Date): boolean {
  const hour = timestamp.getHours();
  const window = getHighTariffWindow(timestamp);
  return hour >= window.startHour && hour < window.endHour;
}

function parseDecimalValue(value: string): number {
  return parseFloat(value.replace(",", "."));
}

/** Format month selection as "YYYY-MM" prefix for date filtering */
export function toMonthPrefix(selection: MonthSelection): string {
  return selection.year + "-" + String(selection.month).padStart(2, "0");
}

/** Format month selection as "MM.YYYY" for HEP API */
export function formatMonthForApi(selection: MonthSelection): string {
  return String(selection.month).padStart(2, "0") + "." + selection.year;
}

/** Process raw HEP meter records into daily and hourly aggregates */
export function processHEPRecords(
  generationRecords: HEPMeterRecord[],
  consumptionRecords: HEPMeterRecord[],
  selectedMonth: MonthSelection
): {
  dailyData: Record<string, DailyEnergyData>;
  hourlyData: Record<string, Record<number, HourlySample>>;
} {
  const dailyData: Record<string, DailyEnergyData> = {};
  const hourlyData: Record<string, Record<number, HourlySample>> = {};
  const monthPrefix = toMonthPrefix(selectedMonth);

  function ensureDayExists(dateKey: string) {
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = {
        feedInKwh: 0,
        consumedKwh: 0,
        peakGenerationKw: 0,
        peakGenerationTime: "",
        peakConsumptionKw: 0,
        peakConsumptionTime: "",
        feedInHighTariffKwh: 0,
        feedInLowTariffKwh: 0,
        consumedHighTariffKwh: 0,
        consumedLowTariffKwh: 0,
        statusIndicators: [],
      };
    }
    if (!hourlyData[dateKey]) {
      hourlyData[dateKey] = {};
      for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
        hourlyData[dateKey][hour] = { generation: 0, consumption: 0, sampleCount: 0, consumptionSampleCount: 0 };
      }
    }
  }

  for (const record of generationRecords) {
    const timestamp = new Date(record.Datum);
    const dateKey = formatLocalDateKey(timestamp);
    if (!dateKey.startsWith(monthPrefix)) continue;

    ensureDayExists(dateKey);
    const powerKw = parseDecimalValue(record.Value);
    const energyKwh = powerKw * QUARTER_HOUR_FACTOR;

    dailyData[dateKey].feedInKwh += energyKwh;
    if (isHighTariffHour(timestamp)) {
      dailyData[dateKey].feedInHighTariffKwh += energyKwh;
    } else {
      dailyData[dateKey].feedInLowTariffKwh += energyKwh;
    }
    if (powerKw > dailyData[dateKey].peakGenerationKw) {
      dailyData[dateKey].peakGenerationKw = powerKw;
      dailyData[dateKey].peakGenerationTime = timestamp.toTimeString().slice(0, 5);
    }
    if ((record.Status || "0") !== "0") {
      dailyData[dateKey].statusIndicators.push(1);
    }

    const hour = timestamp.getHours();
    hourlyData[dateKey][hour].generation += powerKw;
    hourlyData[dateKey][hour].sampleCount++;
  }

  for (const record of consumptionRecords) {
    const timestamp = new Date(record.Datum);
    const dateKey = formatLocalDateKey(timestamp);
    if (!dateKey.startsWith(monthPrefix)) continue;

    ensureDayExists(dateKey);
    const powerKw = parseDecimalValue(record.Value);
    const energyKwh = powerKw * QUARTER_HOUR_FACTOR;

    dailyData[dateKey].consumedKwh += energyKwh;
    if (isHighTariffHour(timestamp)) {
      dailyData[dateKey].consumedHighTariffKwh += energyKwh;
    } else {
      dailyData[dateKey].consumedLowTariffKwh += energyKwh;
    }
    if (powerKw > dailyData[dateKey].peakConsumptionKw) {
      dailyData[dateKey].peakConsumptionKw = powerKw;
      dailyData[dateKey].peakConsumptionTime = timestamp.toTimeString().slice(0, 5);
    }

    const hourSample = hourlyData[dateKey][timestamp.getHours()];
    hourSample.consumption += powerKw;
    hourSample.consumptionSampleCount = (hourSample.consumptionSampleCount ?? 0) + 1;
  }

  return { dailyData, hourlyData };
}

/** Parse FusionSolar API response into daily production data */
export function parseFusionSolarResponse(
  response: Record<string, unknown>,
  selectedMonth: MonthSelection
): Record<string, FusionSolarDay> {
  const fusionSolarDaily: Record<string, FusionSolarDay> = {};
  let data = (response.data as Record<string, unknown>) || response;
  if (!data) return fusionSolarDaily;

  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return fusionSolarDaily;
    }
  }

  // Shape 1: flat array of objects with collectTime
  if (Array.isArray(data)) {
    for (const entry of data) {
      const record = entry as Record<string, unknown>;
      /* collectTime may arrive as a number — coerce before slicing */
      const dateStr = String(record.collectTime ?? record.date ?? "");
      if (dateStr) {
        fusionSolarDaily[dateStr.slice(0, 10)] = {
          production: parseFloat(String(record.productPower)) || 0,
        };
      }
    }
    return fusionSolarDaily;
  }

  // Shape 2: { xAxis: [...dates], productPower: [...values] }
  if (data.xAxis && data.productPower) {
    const dates = data.xAxis as string[];
    const values = data.productPower as string[];
    for (let i = 0; i < dates.length; i++) {
      let dateStr = String(dates[i]);
      if (/^\d{8}$/.test(dateStr)) {
        dateStr = dateStr.slice(0, 4) + "-" + dateStr.slice(4, 6) + "-" + dateStr.slice(6, 8);
      } else if (/^\d{1,2}$/.test(dateStr)) {
        dateStr = `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, "0")}-${dateStr.padStart(2, "0")}`;
      } else if (dateStr.length === 5 && dateStr.includes("-")) {
        dateStr = `${selectedMonth.year}-${dateStr}`;
      } else {
        dateStr = dateStr.slice(0, 10);
      }
      fusionSolarDaily[dateStr] = { production: parseFloat(String(values[i])) || 0 };
    }
    return fusionSolarDaily;
  }

  // Shape 3: { productPower: [...] } indexed by day-of-month
  if (data.productPower && Array.isArray(data.productPower) && (data.productPower as string[]).length > 0) {
    const values = data.productPower as string[];
    for (let i = 0; i < values.length; i++) {
      const dayNumber = i + 1;
      const dateStr = `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      fusionSolarDaily[dateStr] = { production: parseFloat(String(values[i])) || 0 };
    }
    return fusionSolarDaily;
  }

  return fusionSolarDaily;
}

/** Calculate derived metrics (self-consumption, self-sufficiency) from combined data */
export function calculateDerivedMetrics(
  sortedDays: string[],
  dailyData: Record<string, DailyEnergyData>,
  fusionSolarDaily: Record<string, FusionSolarDay>,
  hasFusionSolar: boolean
): DerivedMonthlyData {
  let totalFeedIn = 0;
  let totalConsumed = 0;
  let totalSolarProduction = 0;
  const dayMetrics = [];

  for (const dateKey of sortedDays) {
    const feedIn = dailyData[dateKey].feedInKwh;
    const consumed = dailyData[dateKey].consumedKwh;
    const solarProduction = fusionSolarDaily[dateKey]?.production || 0;
    const selfConsumed = hasFusionSolar ? Math.max(solarProduction - feedIn, 0) : 0;
    const householdTotal = consumed + selfConsumed;
    const selfConsumptionRate = solarProduction > 0 ? (selfConsumed / solarProduction) * 100 : 0;
    const selfSufficiency = householdTotal > 0 ? (selfConsumed / householdTotal) * 100 : 0;

    totalFeedIn += feedIn;
    totalConsumed += consumed;
    totalSolarProduction += solarProduction;

    dayMetrics.push({
      date: dateKey,
      feedIn,
      consumed,
      solarProduction,
      selfConsumed,
      householdTotal,
      selfConsumptionRate,
      selfSufficiency,
    });
  }

  const totalSelfConsumed = hasFusionSolar ? Math.max(totalSolarProduction - totalFeedIn, 0) : 0;
  const totalHousehold = totalConsumed + totalSelfConsumed;

  return {
    days: dayMetrics,
    totalFeedIn,
    totalConsumed,
    totalSolarProduction,
    totalSelfConsumed,
    totalHousehold,
    selfConsumptionRate: totalSolarProduction > 0 ? (totalSelfConsumed / totalSolarProduction) * 100 : 0,
    selfSufficiency: totalHousehold > 0 ? (totalSelfConsumed / totalHousehold) * 100 : 0,
  };
}

/** Grid energy flows split by tariff band */
export interface GridFlows {
  importHighTariffKwh: number;
  importLowTariffKwh: number;
  exportHighTariffKwh: number;
  exportLowTariffKwh: number;
}

/** Sum the per-band VT/NT flows of a set of days into a single GridFlows */
export function sumGridFlows(
  sortedDays: string[],
  dailyData: Record<string, DailyEnergyData>
): GridFlows {
  const flows: GridFlows = {
    importHighTariffKwh: 0,
    importLowTariffKwh: 0,
    exportHighTariffKwh: 0,
    exportLowTariffKwh: 0,
  };
  for (const dateKey of sortedDays) {
    const day = dailyData[dateKey];
    flows.importHighTariffKwh += day.consumedHighTariffKwh;
    flows.importLowTariffKwh += day.consumedLowTariffKwh;
    flows.exportHighTariffKwh += day.feedInHighTariffKwh;
    flows.exportLowTariffKwh += day.feedInLowTariffKwh;
  }
  return flows;
}

/**
 * Calculate a full monthly bill from arbitrary grid flows under HEP samoopskrba
 * net metering. Validated against a real HEP Opskrba invoice (5/2026): feed-in
 * offsets consumption 1:1 on every per-kWh item (energy AND network fees), and
 * the monthly surplus is purchased (otkup) at the energy tariff without VAT —
 * paid out as account credit, not as an invoice line.
 *
 * Netting depends on the tariff model: single tariff nets the month as one pool,
 * dual tariff nets VT and NT separately. Every per-kWh item — energy, network,
 * solidarity AND renewable (OIE) — must use the same netted base, otherwise the
 * surcharges get billed on kWh the energy line never saw.
 *
 * This is the single source of truth for billing; every caller goes through it
 * so the bill panel, tariff comparison and battery simulator cannot drift apart.
 */
export function calculateBillFromFlows(flows: GridFlows, tariff: TariffPrices): BillBreakdown {
  const totalConsumedKwh = flows.importHighTariffKwh + flows.importLowTariffKwh;
  const totalFeedInKwh = flows.exportHighTariffKwh + flows.exportLowTariffKwh;

  /* Per-band nets are always well defined; which of them drives the bill
     depends on the tariff model below. */
  const netHighTariffKwh = Math.max(flows.importHighTariffKwh - flows.exportHighTariffKwh, 0);
  const netLowTariffKwh = Math.max(flows.importLowTariffKwh - flows.exportLowTariffKwh, 0);

  let netBilledKwh: number;
  let energyCost: number;
  let networkCost: number;
  let surplusKwh: number;
  let surplusCreditEur: number;

  if (tariff.tariffModel === "single") {
    netBilledKwh = Math.max(totalConsumedKwh - totalFeedInKwh, 0);
    energyCost = netBilledKwh * tariff.energyPriceSingleTariff;
    networkCost = netBilledKwh * (tariff.distributionSingleTariff + tariff.transmissionSingleTariff);
    surplusKwh = Math.max(totalFeedInKwh - totalConsumedKwh, 0);
    surplusCreditEur = surplusKwh * tariff.energyPriceSingleTariff;
  } else {
    netBilledKwh = netHighTariffKwh + netLowTariffKwh;
    energyCost =
      netHighTariffKwh * tariff.energyPriceHighTariff + netLowTariffKwh * tariff.energyPriceLowTariff;
    networkCost =
      netHighTariffKwh * (tariff.distributionHighTariff + tariff.transmissionHighTariff) +
      netLowTariffKwh * (tariff.distributionLowTariff + tariff.transmissionLowTariff);
    const surplusHighTariff = Math.max(flows.exportHighTariffKwh - flows.importHighTariffKwh, 0);
    const surplusLowTariff = Math.max(flows.exportLowTariffKwh - flows.importLowTariffKwh, 0);
    surplusKwh = surplusHighTariff + surplusLowTariff;
    surplusCreditEur =
      surplusHighTariff * tariff.energyPriceHighTariff + surplusLowTariff * tariff.energyPriceLowTariff;
  }

  const solidarityCost = tariff.solidarityDiscount ? 0 : netBilledKwh * tariff.solidarityRate;
  const renewableEnergyCost = netBilledKwh * tariff.renewableEnergyRate;
  const fixedCosts = tariff.supplyFee + tariff.meteringFee;
  const subtotal = energyCost + networkCost + solidarityCost + renewableEnergyCost + fixedCosts;
  const vatAmount = subtotal * tariff.vatRate;
  const total = subtotal + vatAmount;

  return {
    energyCost,
    networkCost,
    solidarityCost,
    renewableEnergyCost,
    fixedCosts,
    subtotal,
    vatAmount,
    total,
    netBilledKwh,
    netHighTariffKwh,
    netLowTariffKwh,
    totalConsumedKwh,
    totalFeedInKwh,
    surplusKwh,
    surplusCreditEur,
    effectiveCostEur: total - surplusCreditEur,
  };
}

/** Calculate the monthly bill for a set of days of meter data */
export function calculateBill(
  sortedDays: string[],
  dailyData: Record<string, DailyEnergyData>,
  tariff: TariffPrices
): BillBreakdown {
  return calculateBillFromFlows(sumGridFlows(sortedDays, dailyData), tariff);
}

/**
 * Calculate hypothetical bill without solar (all household consumption from grid).
 * Without panels the household would draw grid consumption PLUS the energy the
 * panels covered directly (self-consumed). Feed-in would simply not exist, so it
 * must NOT be added — it is only used as a rough proxy when production data
 * (and therefore selfConsumedKwh) is unavailable.
 */
export function calculateBillWithoutSolarFromFlows(
  flows: GridFlows,
  tariff: TariffPrices,
  selfConsumedKwh: number | null
): number {
  const consumedHighTariff = flows.importHighTariffKwh;
  const consumedLowTariff = flows.importLowTariffKwh;
  const feedInHighTariff = flows.exportHighTariffKwh;
  const feedInLowTariff = flows.exportLowTariffKwh;

  const consumedKwh = consumedHighTariff + consumedLowTariff;
  const feedInKwh = feedInHighTariff + feedInLowTariff;
  const solarCoveredKwh = selfConsumedKwh ?? feedInKwh;
  const totalKwh = consumedKwh + solarCoveredKwh;

  let energyCost: number;
  let networkCost: number;

  if (tariff.tariffModel === "single") {
    energyCost = totalKwh * tariff.energyPriceSingleTariff;
    networkCost = totalKwh * (tariff.distributionSingleTariff + tariff.transmissionSingleTariff);
  } else {
    /* Self-consumption happens during solar hours, so split it across VT/NT
       in the same proportion as feed-in; default to VT when there is no feed-in. */
    const highTariffShare = feedInKwh > 0 ? feedInHighTariff / feedInKwh : 1;
    const highTariffKwh = consumedHighTariff + solarCoveredKwh * highTariffShare;
    const lowTariffKwh = consumedLowTariff + solarCoveredKwh * (1 - highTariffShare);
    energyCost = highTariffKwh * tariff.energyPriceHighTariff + lowTariffKwh * tariff.energyPriceLowTariff;
    networkCost =
      highTariffKwh * (tariff.distributionHighTariff + tariff.transmissionHighTariff) +
      lowTariffKwh * (tariff.distributionLowTariff + tariff.transmissionLowTariff);
  }

  /* No feed-in to net against, so every per-kWh item is charged on the full load */
  const solidarityCost = tariff.solidarityDiscount ? 0 : totalKwh * tariff.solidarityRate;
  const subtotal =
    energyCost + networkCost + solidarityCost + totalKwh * tariff.renewableEnergyRate +
    tariff.supplyFee + tariff.meteringFee;
  return subtotal * (1 + tariff.vatRate);
}

export function calculateBillWithoutSolar(
  sortedDays: string[],
  dailyData: Record<string, DailyEnergyData>,
  tariff: TariffPrices,
  selfConsumedKwh: number | null
): number {
  return calculateBillWithoutSolarFromFlows(
    sumGridFlows(sortedDays, dailyData),
    tariff,
    selfConsumedKwh
  );
}

/**
 * Compare bills under single (JT) vs dual (VT/NT) tariff models,
 * both with and without solar, using the same underlying price data.
 */
export function compareTariffModels(
  sortedDays: string[],
  dailyData: Record<string, DailyEnergyData>,
  tariff: TariffPrices,
  selfConsumedKwh: number | null
): TariffComparison {
  const singleTariff: TariffPrices = { ...tariff, tariffModel: "single" };
  const dualTariff: TariffPrices = { ...tariff, tariffModel: "dual" };

  const singleTariffBill = calculateBill(sortedDays, dailyData, singleTariff);
  const dualTariffBill = calculateBill(sortedDays, dailyData, dualTariff);
  const singleTariffBillWithoutSolar = calculateBillWithoutSolar(sortedDays, dailyData, singleTariff, selfConsumedKwh);
  const dualTariffBillWithoutSolar = calculateBillWithoutSolar(sortedDays, dailyData, dualTariff, selfConsumedKwh);

  /* Compare real monthly cost (invoice minus surplus payout), not just the invoice */
  const singleTariffSolarSavings = singleTariffBillWithoutSolar - singleTariffBill.effectiveCostEur;
  const dualTariffSolarSavings = dualTariffBillWithoutSolar - dualTariffBill.effectiveCostEur;

  const cheaperWithSolar = singleTariffBill.effectiveCostEur <= dualTariffBill.effectiveCostEur ? "single" : "dual";
  const savingsDifference = Math.abs(singleTariffBill.effectiveCostEur - dualTariffBill.effectiveCostEur);

  return {
    singleTariffBill,
    dualTariffBill,
    singleTariffBillWithoutSolar,
    dualTariffBillWithoutSolar,
    singleTariffSolarSavings,
    dualTariffSolarSavings,
    cheaperWithSolar,
    savingsDifference,
  };
}

/**
 * Calculate system efficiency by comparing actual production against
 * theoretical maximum based on installed kWp and solar irradiance (GHI).
 *
 * Theoretical kWh = kWp × Peak Sun Hours (PSH)
 * PSH = daily GHI (Wh/m²) / 1000
 * Performance Ratio (PR) = Actual / Theoretical × 100%
 */
export function calculateSystemEfficiency(
  derived: DerivedMonthlyData,
  weatherRadiation: WeatherDayRadiation[],
  installedKwp: number
): SystemEfficiency | null {
  if (installedKwp <= 0 || weatherRadiation.length === 0) return null;

  /* Build a lookup from date to GHI */
  const ghiByDate = new Map<string, number>();
  for (const wr of weatherRadiation) {
    ghiByDate.set(wr.date, wr.dailyGhiWh);
  }

  const dailyEfficiency: DailyEfficiency[] = [];
  let totalActualKwh = 0;
  let totalTheoreticalKwh = 0;

  for (const day of derived.days) {
    const ghiWh = ghiByDate.get(day.date);
    if (ghiWh === undefined || ghiWh <= 0) continue;

    /* Use solar production if available (FusionSolar), else feed-in as proxy */
    const actualKwh = day.solarProduction > 0 ? day.solarProduction : day.feedIn;
    if (actualKwh <= 0) continue;

    const peakSunHours = ghiWh / 1000;
    const theoreticalKwh = installedKwp * peakSunHours;
    const pr = theoreticalKwh > 0 ? (actualKwh / theoreticalKwh) * 100 : 0;

    dailyEfficiency.push({
      date: day.date,
      actualKwh,
      theoreticalKwh,
      performanceRatioPercent: Math.min(pr, 150),
      peakSunHours,
    });

    totalActualKwh += actualKwh;
    totalTheoreticalKwh += theoreticalKwh;
  }

  if (dailyEfficiency.length === 0) return null;

  const performanceRatioPercent = totalTheoreticalKwh > 0
    ? (totalActualKwh / totalTheoreticalKwh) * 100
    : 0;

  const averagePeakSunHours = dailyEfficiency.reduce((sum, d) => sum + d.peakSunHours, 0) / dailyEfficiency.length;

  /* Two different specific yields, kept apart on purpose. Irradiance data does not
     always cover the whole month (Open-Meteo's archive has gaps and limits), and PR
     may only be computed on matched days. Reporting that partial figure as the
     month's yield understates it — May 2026 read 101.5 instead of 142.7 kWh/kWp. */
  const specificYieldKwhPerKwp = totalActualKwh / installedKwp;
  const productionDays = derived.days.filter(
    (day) => (day.solarProduction > 0 ? day.solarProduction : day.feedIn) > 0
  ).length;
  const monthlyProductionKwh = derived.totalSolarProduction > 0
    ? derived.totalSolarProduction
    : derived.totalFeedIn;
  const monthlySpecificYieldKwhPerKwp = monthlyProductionKwh / installedKwp;
  const coveredDays = dailyEfficiency.length;

  let healthStatus: SystemEfficiency["healthStatus"];
  if (performanceRatioPercent >= 85) healthStatus = "excellent";
  else if (performanceRatioPercent >= 75) healthStatus = "good";
  else if (performanceRatioPercent >= 60) healthStatus = "fair";
  else healthStatus = "poor";

  return {
    performanceRatioPercent,
    actualProductionKwh: totalActualKwh,
    theoreticalProductionKwh: totalTheoreticalKwh,
    dailyEfficiency,
    averagePeakSunHours,
    specificYieldKwhPerKwp,
    monthlySpecificYieldKwhPerKwp,
    coveredDays,
    productionDays,
    isPartialCoverage: coveredDays < productionDays,
    healthStatus,
  };
}

/** Expected annual degradation rate for crystalline silicon panels */
const EXPECTED_DEGRADATION_RATE_PERCENT = 0.5;

/** Same-month pairs needed before the degradation estimate is worth trusting */
const MIN_COMPARISONS_FOR_RELIABLE_TREND = 6;

/**
 * Analyze panel degradation across all cached months by comparing each calendar
 * month against the same calendar month in another year.
 *
 * Deliberately avoids any hardcoded seasonal index. A fixed "typical Croatia"
 * curve cannot match a specific roof — orientation, shading, winter fog and snow
 * make a real site diverge from it by a factor of two or more, and that error
 * lands directly on the degradation number. Comparing June to June cancels
 * seasonality exactly, with no model to be wrong about.
 *
 * Returns null when no calendar month appears in two different years.
 */
export function calculateDegradation(
  cachedMonths: CachedMonthData[],
  installedKwp: number
): DegradationAnalysis | null {
  if (installedKwp <= 0 || cachedMonths.length < 2) return null;

  const monthlyPoints: DegradationMonthPoint[] = [];

  for (const cached of cachedMonths) {
    /* Skip partial months (e.g. the in-progress current month) — a half-filled
       month halves the specific yield and reads as fake steep degradation */
    const cachedYear = parseInt(cached.monthKey.slice(0, 4));
    const cachedMonthNum = parseInt(cached.monthKey.slice(5, 7));
    const daysInCachedMonth = new Date(cachedYear, cachedMonthNum, 0).getDate();
    if (cached.sortedDays.length < daysInCachedMonth - 2) continue;

    const fusionSolarDaily = cached.fusionSolarDaily || {};
    const derived = calculateDerivedMetrics(
      cached.sortedDays,
      cached.dailyData,
      fusionSolarDaily,
      cached.hasFusionSolar
    );

    /* Use FusionSolar total production if available, else feed-in as proxy */
    const productionKwh = cached.hasFusionSolar
      ? derived.totalSolarProduction
      : derived.totalFeedIn;

    if (productionKwh <= 0) continue;

    monthlyPoints.push({
      monthKey: cached.monthKey,
      productionKwh,
      specificYieldKwhPerKwp: productionKwh / installedKwp,
      hasFusionSolar: cached.hasFusionSolar,
    });
  }

  if (monthlyPoints.length < 2) return null;

  monthlyPoints.sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  /* Group by calendar month so we only ever compare like with like. Mixing
     FusionSolar production with feed-in proxy would compare different
     quantities, so those points are not paired against each other. */
  const pointsByCalendarMonth = new Map<number, DegradationMonthPoint[]>();
  for (const point of monthlyPoints) {
    const monthNum = parseInt(point.monthKey.slice(5, 7));
    const bucket = pointsByCalendarMonth.get(monthNum) ?? [];
    bucket.push(point);
    pointsByCalendarMonth.set(monthNum, bucket);
  }

  const comparisons: YearOverYearComparison[] = [];
  for (const [month, points] of pointsByCalendarMonth) {
    for (let i = 1; i < points.length; i++) {
      const earlier = points[i - 1];
      const later = points[i];
      if (earlier.hasFusionSolar !== later.hasFusionSolar) continue;
      if (earlier.specificYieldKwhPerKwp <= 0) continue;

      const yearsApart =
        parseInt(later.monthKey.slice(0, 4)) - parseInt(earlier.monthKey.slice(0, 4));
      if (yearsApart <= 0) continue;

      /* Annualize the ratio so a 2-year gap is not counted as a 1-year drop */
      const ratio = later.specificYieldKwhPerKwp / earlier.specificYieldKwhPerKwp;
      const annualChangePercent = (1 - Math.pow(ratio, 1 / yearsApart)) * 100;

      comparisons.push({
        month,
        earlierMonthKey: earlier.monthKey,
        laterMonthKey: later.monthKey,
        earlierYieldKwhPerKwp: earlier.specificYieldKwhPerKwp,
        laterYieldKwhPerKwp: later.specificYieldKwhPerKwp,
        yearsApart,
        annualChangePercent,
      });
    }
  }

  if (comparisons.length === 0) return null;

  const rates = comparisons.map((comparison) => comparison.annualChangePercent);
  const annualDegradationRatePercent = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;

  /* Report the spread so a single noisy pair cannot masquerade as precision */
  const variance =
    rates.reduce((sum, rate) => sum + Math.pow(rate - annualDegradationRatePercent, 2), 0) /
    rates.length;
  const uncertaintyPercent = Math.sqrt(variance);

  const firstMonthKey = monthlyPoints[0].monthKey;
  const lastMonthKey = monthlyPoints[monthlyPoints.length - 1].monthKey;
  const spanMonths =
    (parseInt(lastMonthKey.slice(0, 4)) - parseInt(firstMonthKey.slice(0, 4))) * 12 +
    (parseInt(lastMonthKey.slice(5, 7)) - parseInt(firstMonthKey.slice(5, 7))) +
    1;

  return {
    monthlyPoints,
    comparisons: comparisons.sort((a, b) => a.month - b.month),
    annualDegradationRatePercent,
    uncertaintyPercent,
    isReliable: comparisons.length >= MIN_COMPARISONS_FOR_RELIABLE_TREND,
    expectedDegradationRatePercent: EXPECTED_DEGRADATION_RATE_PERCENT,
    firstMonth: firstMonthKey,
    lastMonth: lastMonthKey,
    totalMonths: spanMonths,
  };
}

const SOLAR_PRODUCTION_THRESHOLD_KW = 0.1;
const TOP_HOURS_COUNT = 3;
const EVENING_HOURS_START = 17;
const EVENING_HOURS_END = 23;
/** Fraction of evening grid consumption assumed shiftable to solar hours */
const SHIFTABLE_FRACTION = 0.4;

/**
 * Analyze hourly generation vs consumption patterns to identify
 * load shifting opportunities — when grid consumption could be
 * moved to solar production hours to increase self-consumption.
 *
 * Note: no € savings are estimated. Under HEP samoopskrba net metering
 * (feed-in nets every per-kWh item 1:1 and surplus is purchased at the
 * energy tariff), shifting consumption into solar hours reduces grid
 * import and feed-in equally, so the bill does not change. The kWh
 * analysis remains useful for battery sizing and for tariff schemes
 * without full netting.
 */
export function analyzeLoadShifting(
  sortedDays: string[],
  hourlyData: Record<string, Record<number, HourlySample>>
): LoadShiftAnalysis {
  const dayCount = sortedDays.length || 1;

  /* Build average hourly profiles across the month */
  const hourlyProfiles: HourlyLoadShiftProfile[] = [];
  for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
    let totalGeneration = 0;
    let totalConsumption = 0;

    for (const dateKey of sortedDays) {
      const sample = hourlyData[dateKey]?.[hour];
      if (!sample) continue;
      if (sample.sampleCount > 0) {
        totalGeneration += sample.generation / sample.sampleCount;
      }
      /* Older cached data has no separate consumption count — fall back to the generation count */
      const consumptionCount = sample.consumptionSampleCount ?? sample.sampleCount;
      if (consumptionCount > 0) {
        totalConsumption += sample.consumption / consumptionCount;
      }
    }

    const averageGenerationKw = totalGeneration / dayCount;
    const averageConsumptionKw = totalConsumption / dayCount;

    /* During solar hours: grid consumption that could have been covered by solar */
    const isSolarHour = averageGenerationKw > SOLAR_PRODUCTION_THRESHOLD_KW;
    const shiftableConsumptionKw = isSolarHour ? averageConsumptionKw : 0;
    /* Excess generation = solar power going to grid instead of being used locally */
    const excessGenerationKw = isSolarHour
      ? Math.max(averageGenerationKw - averageConsumptionKw, 0)
      : 0;

    hourlyProfiles.push({
      hour,
      averageGenerationKw,
      averageConsumptionKw,
      shiftableConsumptionKw,
      excessGenerationKw,
    });
  }

  /* Grid consumption during solar production hours (kWh/day) */
  const gridConsumptionDuringSolarKwh = hourlyProfiles.reduce(
    (sum, profile) => sum + profile.shiftableConsumptionKw,
    0
  );

  /* Excess solar exported during peak hours (kWh/day) */
  const excessSolarExportKwh = hourlyProfiles.reduce(
    (sum, profile) => sum + profile.excessGenerationKw,
    0
  );

  /* Best hours for running heavy appliances (highest excess generation) */
  const bestHoursForLoad = [...hourlyProfiles]
    .filter((profile) => profile.excessGenerationKw > SOLAR_PRODUCTION_THRESHOLD_KW)
    .sort((a, b) => b.excessGenerationKw - a.excessGenerationKw)
    .slice(0, TOP_HOURS_COUNT)
    .map((profile) => profile.hour);

  /* Evening hours with highest grid consumption — prime candidates for shifting */
  const peakGridConsumptionHours = [...hourlyProfiles]
    .filter(
      (profile) =>
        profile.hour >= EVENING_HOURS_START &&
        profile.hour <= EVENING_HOURS_END &&
        profile.averageConsumptionKw > SOLAR_PRODUCTION_THRESHOLD_KW
    )
    .sort((a, b) => b.averageConsumptionKw - a.averageConsumptionKw)
    .slice(0, TOP_HOURS_COUNT)
    .map((profile) => profile.hour);

  /* Estimate shiftable daily kWh: fraction of evening consumption that could move to solar hours */
  let eveningGridConsumptionKwh = 0;
  for (const profile of hourlyProfiles) {
    if (profile.hour >= EVENING_HOURS_START && profile.hour <= EVENING_HOURS_END) {
      eveningGridConsumptionKwh += profile.averageConsumptionKw;
    }
  }
  /* Cap shiftable load by available excess solar */
  const shiftableDailyKwh = Math.min(
    eveningGridConsumptionKwh * SHIFTABLE_FRACTION,
    excessSolarExportKwh
  );

  return {
    hourlyProfiles,
    gridConsumptionDuringSolarKwh,
    excessSolarExportKwh,
    shiftableDailyKwh,
    bestHoursForLoad,
    peakGridConsumptionHours,
  };
}

const MONTHS_IN_YEAR = 12;

/**
 * Monthly share of annual PV yield for continental Croatia (Zagreb area),
 * index 0 = January. Only the *shape* matters — the values are normalized
 * below so the weights always average 1.0, which is what every consumer
 * assumes. Hand-maintained lists that "should sum to 12" silently drift;
 * normalizing in code makes that impossible.
 */
const SEASONAL_YIELD_SHARE = [3.2, 4.7, 7.8, 9.9, 11.7, 12.5, 13.6, 12.7, 9.7, 7.1, 3.7, 2.6];

/** Seasonal weights relative to an average month — sum to exactly 12 by construction */
const SEASONAL_WEIGHTS = (() => {
  const total = SEASONAL_YIELD_SHARE.reduce((sum, share) => sum + share, 0);
  return SEASONAL_YIELD_SHARE.map((share) => (share / total) * MONTHS_IN_YEAR);
})();

const MAX_PROJECTION_YEARS = 25;
const MAX_PROJECTION_MONTHS = MAX_PROJECTION_YEARS * MONTHS_IN_YEAR;

/** Assumed annual rise in electricity prices — savings track the price you avoid paying */
const ANNUAL_PRICE_INFLATION_PERCENT = 2.0;
/** Assumed annual panel output loss, matching the crystalline-silicon expectation */
const ANNUAL_PANEL_DEGRADATION_PERCENT = 0.5;
/** Discount rate for the discounted payback — the return the money could earn elsewhere */
const ANNUAL_DISCOUNT_RATE_PERCENT = 3.0;

/**
 * Build a savings figure for each of the 12 calendar months.
 *
 * Measured months are used as-is (averaged when the same calendar month appears
 * in several years). Months never measured are filled from the seasonal shape,
 * scaled so it matches the measured months overall — a least-squares style fit
 * across everything known rather than extrapolating from one arbitrary month.
 *
 * This matters: savings are capped by the bill and floored by net-metering, so
 * they do NOT scale with production. Extrapolating an annual figure from a single
 * month swings the answer by more than 2x depending on which month is open.
 */
function buildCalendarMonthSavings(
  measuredMonths: MeasuredMonthSavings[],
  fallbackSavingsEur: number,
  fallbackMonth: number
): CalendarMonthSavings[] {
  const savingsByMonth = new Map<number, number[]>();
  for (const measured of measuredMonths) {
    const month = parseInt(measured.monthKey.slice(5, 7));
    if (!(month >= 1 && month <= MONTHS_IN_YEAR)) continue;
    const bucket = savingsByMonth.get(month) ?? [];
    bucket.push(measured.savingsEur);
    savingsByMonth.set(month, bucket);
  }

  const averageFor = (month: number) => {
    const values = savingsByMonth.get(month);
    if (!values || values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  /* Fit the seasonal shape to whatever has actually been measured */
  let measuredSavingsTotal = 0;
  let measuredWeightTotal = 0;
  for (let month = 1; month <= MONTHS_IN_YEAR; month++) {
    const average = averageFor(month);
    if (average === null) continue;
    measuredSavingsTotal += average;
    measuredWeightTotal += SEASONAL_WEIGHTS[month - 1];
  }

  const fallbackWeight = SEASONAL_WEIGHTS[fallbackMonth - 1];
  const seasonalScale = (() => {
    if (measuredWeightTotal > 0) return measuredSavingsTotal / measuredWeightTotal;
    if (fallbackWeight > 0) return fallbackSavingsEur / fallbackWeight;
    return fallbackSavingsEur;
  })();

  const result: CalendarMonthSavings[] = [];
  for (let month = 1; month <= MONTHS_IN_YEAR; month++) {
    const average = averageFor(month);
    result.push({
      month,
      savingsEur: average ?? seasonalScale * SEASONAL_WEIGHTS[month - 1],
      isMeasured: average !== null,
    });
  }
  return result;
}

/**
 * Calculate ROI and payback projections.
 *
 * Uses every measured month available and only falls back to the seasonal shape
 * for months that have never been fetched. The projection accounts for rising
 * electricity prices, panel degradation, and the time value of money.
 */
export function calculateRoi(
  measuredMonthlySavingsEur: number,
  selectedMonth: MonthSelection,
  systemCostEur: number,
  installationDate: string,
  measuredMonths: MeasuredMonthSavings[] = []
): RoiAnalysis {
  const calendarMonthSavings = buildCalendarMonthSavings(
    measuredMonths,
    measuredMonthlySavingsEur,
    selectedMonth.month
  );
  const savingsForMonth = (monthIndexZeroBased: number) =>
    calendarMonthSavings[monthIndexZeroBased].savingsEur;

  const estimatedAnnualSavingsEur = calendarMonthSavings.reduce(
    (sum, entry) => sum + entry.savingsEur,
    0
  );
  const measuredMonthCount = calendarMonthSavings.filter((entry) => entry.isMeasured).length;

  const annualRoiPercent = systemCostEur > 0
    ? (estimatedAnnualSavingsEur / systemCostEur) * 100
    : 0;

  /* Calculate months elapsed since installation */
  let monthsElapsed = 0;
  let estimatedCumulativeSavingsEur = 0;
  if (installationDate) {
    const installDate = new Date(installationDate);
    const now = new Date(selectedMonth.year, selectedMonth.month - 1, 1);
    monthsElapsed = (now.getFullYear() - installDate.getFullYear()) * MONTHS_IN_YEAR
      + (now.getMonth() - installDate.getMonth());
    if (monthsElapsed < 0) monthsElapsed = 0;

    for (let i = 0; i < monthsElapsed; i++) {
      const elapsedMonth = new Date(installDate.getFullYear(), installDate.getMonth() + i, 1);
      estimatedCumulativeSavingsEur += savingsForMonth(elapsedMonth.getMonth());
    }
  }

  /* Build projection series: from installation month until payback (or max 25 years).
     Savings grow with electricity prices and shrink with panel degradation; the
     discounted series values future euros at today's money. */
  const priceInflation = ANNUAL_PRICE_INFLATION_PERCENT / 100;
  const panelDegradation = ANNUAL_PANEL_DEGRADATION_PERCENT / 100;
  const discountRate = ANNUAL_DISCOUNT_RATE_PERCENT / 100;

  const startDate = installationDate
    ? new Date(installationDate)
    : new Date(selectedMonth.year, selectedMonth.month - 1, 1);

  const projections: RoiMonthProjection[] = [];
  let cumulative = 0;
  let discountedCumulative = 0;
  let paybackMonths = 0;
  let discountedPaybackMonths = 0;

  for (let i = 0; i < MAX_PROJECTION_MONTHS; i++) {
    const projectedDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const yearsFromStart = i / MONTHS_IN_YEAR;
    const monthlySavings =
      savingsForMonth(projectedDate.getMonth()) *
      Math.pow(1 + priceInflation, yearsFromStart) *
      Math.pow(1 - panelDegradation, yearsFromStart);

    cumulative += monthlySavings;
    discountedCumulative += monthlySavings / Math.pow(1 + discountRate, yearsFromStart);

    if (paybackMonths === 0 && systemCostEur > 0 && cumulative >= systemCostEur) {
      paybackMonths = i + 1;
    }
    if (discountedPaybackMonths === 0 && systemCostEur > 0 && discountedCumulative >= systemCostEur) {
      discountedPaybackMonths = i + 1;
    }

    projections.push({
      label: `${projectedDate.getFullYear()}-${String(projectedDate.getMonth() + 1).padStart(2, "0")}`,
      monthlySavingsEur: monthlySavings,
      cumulativeSavingsEur: cumulative,
      discountedCumulativeSavingsEur: discountedCumulative,
    });

    /* Stop a year past payback, but always cover the elapsed period plus two years */
    const hasBothPaybacks = paybackMonths > 0 && discountedPaybackMonths > 0;
    const isPastPaybackTail = hasBothPaybacks && i >= discountedPaybackMonths + MONTHS_IN_YEAR;
    const coversElapsed = i >= monthsElapsed + MONTHS_IN_YEAR * 2;
    if (isPastPaybackTail && coversElapsed) break;
  }

  return {
    measuredMonthlySavingsEur,
    estimatedAnnualSavingsEur,
    calendarMonthSavings,
    measuredMonthCount,
    paybackMonths,
    discountedPaybackMonths,
    annualRoiPercent,
    monthsElapsed,
    estimatedCumulativeSavingsEur,
    priceInflationPercent: ANNUAL_PRICE_INFLATION_PERCENT,
    panelDegradationPercent: ANNUAL_PANEL_DEGRADATION_PERCENT,
    discountRatePercent: ANNUAL_DISCOUNT_RATE_PERCENT,
    projections,
  };
}

/** Compute a month summary from cached data for the yearly overview */
export function computeMonthSummary(
  cached: CachedMonthData,
  config: Config
): MonthSummary {
  const fusionSolarDaily: Record<string, FusionSolarDay> = cached.fusionSolarDaily || {};
  const derived = calculateDerivedMetrics(
    cached.sortedDays,
    cached.dailyData,
    fusionSolarDaily,
    cached.hasFusionSolar
  );
  /* Resolve tariff prices for this specific month */
  const tariff = resolveTariff(config, cached.monthKey);
  const selfConsumedForBill = cached.hasFusionSolar ? derived.totalSelfConsumed : null;
  const bill = cached.hasConsumption
    ? calculateBill(cached.sortedDays, cached.dailyData, tariff)
    : null;
  const billWithoutSolar = cached.hasConsumption
    ? calculateBillWithoutSolar(cached.sortedDays, cached.dailyData, tariff, selfConsumedForBill)
    : 0;

  return {
    monthKey: cached.monthKey,
    analyzedDays: cached.sortedDays.length,
    totalFeedInKwh: derived.totalFeedIn,
    totalConsumedKwh: derived.totalConsumed,
    totalSolarProductionKwh: derived.totalSolarProduction,
    totalSelfConsumedKwh: derived.totalSelfConsumed,
    totalHouseholdKwh: derived.totalHousehold,
    selfConsumptionRatePercent: derived.selfConsumptionRate,
    selfSufficiencyPercent: derived.selfSufficiency,
    billTotalEur: bill?.total ?? 0,
    billWithoutSolarEur: billWithoutSolar,
    /* Savings against the real monthly cost: invoice minus surplus payout */
    savingsEur: bill ? billWithoutSolar - bill.effectiveCostEur : 0,
  };
}

/** Minimum analyzed days required to make a meaningful forecast */
const MIN_FORECAST_DAYS = 3;
/** Low-production day threshold — excluded from forecast average to avoid skewing */
const FORECAST_LOW_PRODUCTION_THRESHOLD = 0.3;

/** Minimum scale factor clamp to prevent near-zero projections */
const MIN_WEATHER_SCALE = 0.05;
/** Maximum scale factor clamp to prevent extreme outliers */
const MAX_WEATHER_SCALE = 3.0;

/**
 * Parse Open-Meteo hourly response into daily GHI totals.
 * Sums hourly shortwave_radiation (W/m²) per day.
 */
export function aggregateHourlyRadiationToDaily(
  response: { hourly: { time: string[]; shortwave_radiation: number[] } }
): WeatherDayRadiation[] {
  const dailyMap: Record<string, number> = {};

  for (let i = 0; i < response.hourly.time.length; i++) {
    const date = response.hourly.time[i].slice(0, 10);
    const radiation = response.hourly.shortwave_radiation[i] ?? 0;
    dailyMap[date] = (dailyMap[date] ?? 0) + radiation;
  }

  return Object.entries(dailyMap).map(([date, dailyGhiWh]) => ({ date, dailyGhiWh }));
}

/**
 * Compute per-day weather scale factors by comparing forecast GHI to historical average.
 * Scale > 1 = sunnier than average, < 1 = cloudier.
 */
export function calculateGhiScaleFactors(
  historicalDays: WeatherDayRadiation[],
  forecastDays: WeatherDayRadiation[]
): Record<string, number> {
  /* Days with zero GHI are almost always API gaps, not genuinely sunless days —
     Open-Meteo returns nulls past its archive window. Averaging them in drags the
     baseline down and makes every forecast day look sunnier than average. */
  const validHistorical = historicalDays.filter((day) => day.dailyGhiWh > 0);
  const historicalTotal = validHistorical.reduce((sum, day) => sum + day.dailyGhiWh, 0);
  const historicalAvg = validHistorical.length > 0 ? historicalTotal / validHistorical.length : 0;

  if (historicalAvg <= 0) return {};

  const scaleFactors: Record<string, number> = {};
  for (const day of forecastDays) {
    if (day.dailyGhiWh <= 0) continue;
    const raw = day.dailyGhiWh / historicalAvg;
    scaleFactors[day.date] = Math.max(MIN_WEATHER_SCALE, Math.min(MAX_WEATHER_SCALE, raw));
  }
  return scaleFactors;
}

/**
 * Project remaining days of a partial month based on analyzed data.
 * When weatherScaleFactors are provided, solar-dependent metrics (production, feed-in)
 * are scaled per day by forecasted vs historical solar radiation. Consumption stays flat.
 */
export function calculateForecast(
  selectedMonth: MonthSelection,
  derived: DerivedMonthlyData,
  dailyData: Record<string, DailyEnergyData>,
  tariff: TariffPrices,
  hasConsumption: boolean,
  hasFusionSolar: boolean,
  weatherScaleFactors?: Record<string, number>
): MonthForecast | null {
  const totalDaysInMonth = new Date(selectedMonth.year, selectedMonth.month, 0).getDate();

  /* HEP data is delayed — today's readings are incomplete, so exclude today.
     Also filter out zero-value records for future days returned by the API. */
  const todayStr = formatLocalDateKey(new Date());
  const activeDays = derived.days.filter(
    (day) => day.date !== todayStr && (day.feedIn > 0 || day.consumed > 0 || day.solarProduction > 0)
  );
  const analyzedDays = activeDays.length;
  /* Project real calendar days after the last day with data, not analyzedDays+1..,
     which drifts when today or gap days are excluded */
  const lastActiveDayOfMonth = analyzedDays > 0
    ? parseInt(activeDays[analyzedDays - 1].date.slice(8, 10))
    : 0;
  const remainingDays = totalDaysInMonth - lastActiveDayOfMonth;

  /* Only forecast partial months with enough data */
  if (remainingDays <= 0 || analyzedDays < MIN_FORECAST_DAYS) return null;

  const isWeatherAdjusted = !!weatherScaleFactors && Object.keys(weatherScaleFactors).length > 0;

  /* Filter out near-zero production days (cloudy/rain) for a more realistic average.
     With weather scaling, cloudy days are handled by the per-day scale factor, so the
     baseline must include them — otherwise good weather gets double-counted. */
  const productiveDays = hasFusionSolar
    ? activeDays.filter((day) => day.solarProduction > FORECAST_LOW_PRODUCTION_THRESHOLD)
    : activeDays.filter((day) => day.feedIn > FORECAST_LOW_PRODUCTION_THRESHOLD);
  const sunnyDayBasis = productiveDays.length >= MIN_FORECAST_DAYS ? productiveDays : activeDays;
  const forecastBasis = isWeatherAdjusted ? activeDays : sunnyDayBasis;
  const basisCount = forecastBasis.length;

  const averageDailyProductionKwh = hasFusionSolar
    ? forecastBasis.reduce((sum, day) => sum + day.solarProduction, 0) / basisCount
    : 0;
  const averageDailyFeedInKwh = forecastBasis.reduce((sum, day) => sum + day.feedIn, 0) / basisCount;
  const averageDailySelfConsumedKwh = hasFusionSolar
    ? forecastBasis.reduce((sum, day) => sum + day.selfConsumed, 0) / basisCount
    : 0;
  /* Household consumption has no reason to follow sunshine, so it always averages
     over every active day — never over the sunny-day subset used for production. */
  const averageDailyConsumedKwh =
    activeDays.reduce((sum, day) => sum + day.consumed, 0) / analyzedDays;

  /* Build daily chart series and accumulate projected totals */
  const dailySeries: ForecastDayEntry[] = [];
  let projectedProductionSum = 0;
  let projectedFeedInSum = 0;
  let projectedConsumedSum = 0;
  let projectedSelfConsumedSum = 0;

  for (const day of activeDays) {
    dailySeries.push({
      dayLabel: day.date.slice(8),
      actualProductionKwh: hasFusionSolar ? day.solarProduction : null,
      actualFeedInKwh: day.feedIn,
      actualConsumedKwh: day.consumed,
      projectedProductionKwh: null,
      projectedFeedInKwh: null,
      projectedConsumedKwh: null,
    });
  }

  for (let dayOffset = 1; dayOffset <= remainingDays; dayOffset++) {
    const dayNumber = lastActiveDayOfMonth + dayOffset;
    const dateStr = `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;

    /* Weather scales solar-dependent values; consumption stays flat */
    const scale = weatherScaleFactors?.[dateStr] ?? 1;
    const dayProduction = averageDailyProductionKwh * scale;
    const dayFeedIn = averageDailyFeedInKwh * scale;
    const daySelfConsumed = averageDailySelfConsumedKwh * scale;

    projectedProductionSum += dayProduction;
    projectedFeedInSum += dayFeedIn;
    projectedConsumedSum += averageDailyConsumedKwh;
    projectedSelfConsumedSum += daySelfConsumed;

    dailySeries.push({
      dayLabel: String(dayNumber).padStart(2, "0"),
      actualProductionKwh: null,
      actualFeedInKwh: null,
      actualConsumedKwh: null,
      projectedProductionKwh: hasFusionSolar ? dayProduction : null,
      projectedFeedInKwh: dayFeedIn,
      projectedConsumedKwh: averageDailyConsumedKwh,
    });
  }

  const projectedProductionKwh = derived.totalSolarProduction + projectedProductionSum;
  const projectedFeedInKwh = derived.totalFeedIn + projectedFeedInSum;
  const projectedConsumedKwh = derived.totalConsumed + projectedConsumedSum;
  const projectedSelfConsumedKwh = derived.totalSelfConsumed + projectedSelfConsumedSum;
  const projectedHousehold = projectedConsumedKwh + projectedSelfConsumedKwh;
  const projectedSelfSufficiencyPercent = projectedHousehold > 0
    ? (projectedSelfConsumedKwh / projectedHousehold) * 100
    : 0;

  /* Project the bill by re-running the real billing engine on projected kWh, never
     by scaling euros. Net metering charges max(import − export, 0), so cost is not
     proportional to days: a month that is net-import at day 10 can finish at net
     zero, and linear scaling would invent a bill that never arrives. */
  let projectedBillEur = 0;
  let projectedSavingsEur = 0;
  if (hasConsumption) {
    const actualFlows = sumGridFlows(
      activeDays.map((day) => day.date),
      dailyData
    );
    /* Split each projected day across VT/NT in the same proportion the month has
       shown so far — the tariff windows move with daylight saving, not per day. */
    const actualImport = actualFlows.importHighTariffKwh + actualFlows.importLowTariffKwh;
    const actualExport = actualFlows.exportHighTariffKwh + actualFlows.exportLowTariffKwh;
    const importHighShare = actualImport > 0 ? actualFlows.importHighTariffKwh / actualImport : 0.5;
    const exportHighShare = actualExport > 0 ? actualFlows.exportHighTariffKwh / actualExport : 1;

    const projectedFlows: GridFlows = {
      importHighTariffKwh: actualFlows.importHighTariffKwh + projectedConsumedSum * importHighShare,
      importLowTariffKwh: actualFlows.importLowTariffKwh + projectedConsumedSum * (1 - importHighShare),
      exportHighTariffKwh: actualFlows.exportHighTariffKwh + projectedFeedInSum * exportHighShare,
      exportLowTariffKwh: actualFlows.exportLowTariffKwh + projectedFeedInSum * (1 - exportHighShare),
    };

    const projectedBill = calculateBillFromFlows(projectedFlows, tariff);
    projectedBillEur = projectedBill.total;

    /* Without panels the household would draw its own load from the grid instead */
    const projectedBillWithoutSolar = calculateBillWithoutSolarFromFlows(
      projectedFlows,
      tariff,
      hasFusionSolar ? projectedSelfConsumedKwh : null
    );
    projectedSavingsEur = projectedBillWithoutSolar - projectedBill.effectiveCostEur;
  }

  return {
    isWeatherAdjusted,
    analyzedDays,
    totalDaysInMonth,
    remainingDays,
    averageDailyProductionKwh,
    averageDailyFeedInKwh,
    averageDailyConsumedKwh,
    averageDailySelfConsumedKwh,
    projectedProductionKwh,
    projectedFeedInKwh,
    projectedConsumedKwh,
    projectedSelfConsumedKwh,
    projectedSelfSufficiencyPercent,
    projectedBillEur,
    projectedSavingsEur,
    dailySeries,
  };
}

/** Default battery presets for common residential systems */
export const BATTERY_PRESETS: { label: string; config: BatteryConfig }[] = [
  { label: "5 kWh", config: { capacityKwh: 5, maxChargeRateKw: 2.5, maxDischargeRateKw: 2.5, roundTripEfficiency: 0.9 } },
  { label: "10 kWh", config: { capacityKwh: 10, maxChargeRateKw: 5, maxDischargeRateKw: 5, roundTripEfficiency: 0.9 } },
  { label: "15 kWh", config: { capacityKwh: 15, maxChargeRateKw: 5, maxDischargeRateKw: 5, roundTripEfficiency: 0.9 } },
];

/** Approximate battery cost per kWh for ROI estimate (€) */
const BATTERY_COST_PER_KWH_EUR = 500;


/**
 * Simulate hour-by-hour battery charge/discharge for the month.
 * Uses greedy strategy: charge from excess solar, discharge when consuming from grid.
 * Both scenarios are priced with the same net-metering cost model (incl. surplus
 * payout), so the savings reflect what a battery would actually change on the bill.
 */
export function simulateBattery(
  sortedDays: string[],
  hourlyData: Record<string, Record<number, HourlySample>>,
  derived: DerivedMonthlyData,
  tariff: TariffPrices,
  battery: BatteryConfig,
  selectedMonth: MonthSelection
): BatterySimulationResult {
  const chargeEfficiency = Math.sqrt(battery.roundTripEfficiency);
  const dischargeEfficiency = Math.sqrt(battery.roundTripEfficiency);

  /* Accumulators for monthly totals */
  let totalEnergyStoredKwh = 0;
  let totalEnergyDischargedKwh = 0;
  let totalGridImportWithBatteryKwh = 0;
  let totalGridExportWithBatteryKwh = 0;
  let totalGridFeedInKwh = 0;
  let totalGridDrawKwh = 0;
  /* AC-side energy in and out of the battery — their difference is the round-trip loss */
  let totalAcIntoBatteryKwh = 0;
  let totalAcFromBatteryKwh = 0;

  /* Tariff-band grid flows for cost comparison: with battery vs actual (without) */
  const flowsWithBattery: GridFlows = {
    importHighTariffKwh: 0,
    importLowTariffKwh: 0,
    exportHighTariffKwh: 0,
    exportLowTariffKwh: 0,
  };
  const flowsWithoutBattery: GridFlows = {
    importHighTariffKwh: 0,
    importLowTariffKwh: 0,
    exportHighTariffKwh: 0,
    exportLowTariffKwh: 0,
  };

  /* Average hourly profile accumulators (24 slots) */
  const hourlyTotals: { gen: number; con: number; charged: number; discharged: number; gridIn: number; gridOut: number; soc: number; count: number }[] = [];
  for (let h = 0; h < HOURS_IN_DAY; h++) {
    hourlyTotals.push({ gen: 0, con: 0, charged: 0, discharged: 0, gridIn: 0, gridOut: 0, soc: 0, count: 0 });
  }

  /* Simulate each day independently — battery resets to 0% overnight is unrealistic,
     so we carry state across days within the month. */
  let stateOfChargeKwh = 0;

  for (const dateKey of sortedDays) {
    const dayHourly = hourlyData[dateKey];
    if (!dayHourly) continue;

    const dayTariffWindow = getHighTariffWindow(new Date(dateKey + "T12:00:00"));

    for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
      const sample = dayHourly[hour];
      /* HourlySample stores the sum of 15-min kW readings — energy for the
         hour is that sum × 0.25, same conversion as the daily aggregates */
      const genKwh = (sample ? sample.generation : 0) * QUARTER_HOUR_FACTOR;
      const conKwh = (sample ? sample.consumption : 0) * QUARTER_HOUR_FACTOR;
      const isHighTariff = hour >= dayTariffWindow.startHour && hour < dayTariffWindow.endHour;

      totalGridFeedInKwh += genKwh;
      totalGridDrawKwh += conKwh;

      /* Net surplus or deficit this hour. HEP export and import are never truly
         simultaneous at 15-min resolution, but a real battery would absorb an
         export and release it minutes later, so netting within the hour is the
         right approximation for battery behaviour. */
      const surplus = genKwh - conKwh;
      let chargedKwh = 0;
      let dischargedKwh = 0;
      let gridImportKwh = 0;
      let gridExportKwh = 0;

      if (surplus > 0) {
        /* Excess solar — charge battery first, export remainder.
           Both rate limits are applied on the AC side, so charge and discharge
           caps mean the same thing (inverter power, not cell-side energy). */
        const availableCapacity = battery.capacityKwh - stateOfChargeKwh;
        const acAvailableKwh = Math.min(surplus, battery.maxChargeRateKw * HOURS_PER_STEP);
        chargedKwh = Math.max(Math.min(acAvailableKwh * chargeEfficiency, availableCapacity), 0);
        stateOfChargeKwh += chargedKwh;
        totalEnergyStoredKwh += chargedKwh;

        /* Remaining surplus goes to grid */
        const usedForCharging = chargedKwh / chargeEfficiency;
        totalAcIntoBatteryKwh += usedForCharging;
        gridExportKwh = surplus - usedForCharging;
      } else {
        /* Deficit — discharge battery first, import remainder from grid */
        const deficit = -surplus;
        const acWantedKwh = Math.min(deficit, battery.maxDischargeRateKw * HOURS_PER_STEP);
        dischargedKwh = Math.max(Math.min(acWantedKwh / dischargeEfficiency, stateOfChargeKwh), 0);
        stateOfChargeKwh -= dischargedKwh;
        totalEnergyDischargedKwh += dischargedKwh;

        const coveredByBattery = dischargedKwh * dischargeEfficiency;
        totalAcFromBatteryKwh += coveredByBattery;
        gridImportKwh = Math.max(deficit - coveredByBattery, 0);
      }

      totalGridImportWithBatteryKwh += gridImportKwh;
      totalGridExportWithBatteryKwh += gridExportKwh;

      /* Tariff-split grid flows for cost comparison; without battery the meter
         flows are simply consumption (import) and generation (export) */
      if (isHighTariff) {
        flowsWithBattery.importHighTariffKwh += gridImportKwh;
        flowsWithBattery.exportHighTariffKwh += gridExportKwh;
        flowsWithoutBattery.importHighTariffKwh += conKwh;
        flowsWithoutBattery.exportHighTariffKwh += genKwh;
      } else {
        flowsWithBattery.importLowTariffKwh += gridImportKwh;
        flowsWithBattery.exportLowTariffKwh += gridExportKwh;
        flowsWithoutBattery.importLowTariffKwh += conKwh;
        flowsWithoutBattery.exportLowTariffKwh += genKwh;
      }

      /* Accumulate for average hourly profile */
      hourlyTotals[hour].gen += genKwh;
      hourlyTotals[hour].con += conKwh;
      hourlyTotals[hour].charged += chargedKwh;
      hourlyTotals[hour].discharged += dischargedKwh;
      hourlyTotals[hour].gridIn += gridImportKwh;
      hourlyTotals[hour].gridOut += gridExportKwh;
      hourlyTotals[hour].soc += stateOfChargeKwh;
      hourlyTotals[hour].count += 1;
    }
  }

  const sampleMonth = sortedDays[0] ? new Date(sortedDays[0] + "T12:00:00") : new Date(selectedMonth.year, selectedMonth.month - 1, 1);
  const monthIdx = sampleMonth.getMonth();
  const sampleTariffWindow = getHighTariffWindow(sampleMonth);

  /* Build average hourly profile */
  const averageHourlyProfile: BatteryHourState[] = hourlyTotals.map((t, hour) => {
    const count = t.count || 1;
    return {
      hour,
      generationKwh: t.gen / count,
      consumptionKwh: t.con / count,
      chargedKwh: t.charged / count,
      dischargedKwh: t.discharged / count,
      gridImportKwh: t.gridIn / count,
      gridExportKwh: t.gridOut / count,
      stateOfChargeKwh: t.soc / count,
      isHighTariff: hour >= sampleTariffWindow.startHour && hour < sampleTariffWindow.endHour,
    };
  });

  /* Price both scenarios with the same net-metering cost model (incl. surplus payout).
     Under full netting a battery shrinks import and export together, so savings are
     typically near zero or negative due to round-trip losses — that is the honest result. */
  const billWithBatteryEur = calculateBillFromFlows(flowsWithBattery, tariff).effectiveCostEur;
  const billWithoutBatteryEur = totalGridDrawKwh > 0 || totalGridFeedInKwh > 0
    ? calculateBillFromFlows(flowsWithoutBattery, tariff).effectiveCostEur
    : 0;
  const totalGridImportWithoutBatteryKwh = derived.totalConsumed;

  const monthlySavingsEur = billWithoutBatteryEur - billWithBatteryEur;

  /* Round-trip loss: AC energy pushed into the battery that never came back out.
     Energy still sitting in the battery at month end counts here too — for a
     monthly view it has not served any load. */
  const totalBatteryLossKwh = Math.max(totalAcIntoBatteryKwh - totalAcFromBatteryKwh, 0);

  /* Self-consumption and self-sufficiency are shares of GROSS PANEL PRODUCTION and
     of HOUSEHOLD LOAD — never of grid feed-in or grid draw, which is what the meter
     alone reports. Without FusionSolar production the ratios are simply unknowable.
     Solar retained on site = production − export; of that, the round-trip loss never
     reaches a load, so it must come off before comparing against household load. */
  const productionKwh = derived.totalSolarProduction;
  const householdLoadKwh = derived.totalHousehold;
  const hasProductionData = productionKwh > 0 && householdLoadKwh > 0;

  const selfConsumedWithoutBatteryKwh = derived.totalSelfConsumed;
  const selfConsumedWithBatteryKwh = Math.max(
    productionKwh - totalGridExportWithBatteryKwh - totalBatteryLossKwh,
    0
  );

  const toPercentOf = (value: number, total: number) => Math.min((value / total) * 100, 100);
  const selfConsumptionWithoutBatteryPercent = hasProductionData
    ? toPercentOf(selfConsumedWithoutBatteryKwh, productionKwh)
    : null;
  const selfConsumptionWithBatteryPercent = hasProductionData
    ? toPercentOf(selfConsumedWithBatteryKwh, productionKwh)
    : null;
  const selfSufficiencyWithoutBatteryPercent = hasProductionData
    ? toPercentOf(selfConsumedWithoutBatteryKwh, householdLoadKwh)
    : null;
  const selfSufficiencyWithBatteryPercent = hasProductionData
    ? toPercentOf(selfConsumedWithBatteryKwh, householdLoadKwh)
    : null;

  /* Annualize savings using seasonal weights */
  const currentSeasonalWeight = SEASONAL_WEIGHTS[monthIdx];
  const normalizedMonthly = currentSeasonalWeight > 0 ? monthlySavingsEur / currentSeasonalWeight : monthlySavingsEur;
  let estimatedAnnualSavingsEur = 0;
  for (let i = 0; i < MONTHS_IN_YEAR; i++) {
    estimatedAnnualSavingsEur += normalizedMonthly * SEASONAL_WEIGHTS[i];
  }

  /* Payback estimate — with zero or negative savings the battery never pays back */
  const batteryCostEur = battery.capacityKwh * BATTERY_COST_PER_KWH_EUR;
  const paybackYears = estimatedAnnualSavingsEur > 0 ? batteryCostEur / estimatedAnnualSavingsEur : 99;

  return {
    averageHourlyProfile,
    billWithBatteryEur,
    billWithoutBatteryEur,
    monthlySavingsEur,
    selfConsumptionWithBatteryPercent,
    selfConsumptionWithoutBatteryPercent,
    selfSufficiencyWithBatteryPercent,
    selfSufficiencyWithoutBatteryPercent,
    totalBatteryLossKwh,
    householdLoadKwh,
    totalEnergyStoredKwh,
    totalEnergyDischargedKwh,
    totalGridImportWithBatteryKwh,
    totalGridExportWithBatteryKwh,
    totalGridImportWithoutBatteryKwh,
    estimatedAnnualSavingsEur,
    paybackYears,
  };
}
