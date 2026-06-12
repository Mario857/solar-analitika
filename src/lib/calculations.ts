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
} from "@/lib/types";
import { resolveTariff } from "@/lib/config";

const HOURS_IN_DAY = 24;
const QUARTER_HOUR_FACTOR = 0.25;

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

/**
 * Calculate monthly electricity bill under HEP samoopskrba net metering.
 * Validated against a real HEP Opskrba invoice (5/2026): feed-in offsets
 * consumption 1:1 on every per-kWh item (energy AND network fees), and the
 * monthly surplus is purchased (otkup) at the energy tariff without VAT —
 * paid out as account credit, not as an invoice line.
 */
export function calculateBill(
  sortedDays: string[],
  dailyData: Record<string, DailyEnergyData>,
  tariff: TariffPrices
): BillBreakdown {
  const isSingleTariff = tariff.tariffModel === "single";

  let totalConsumedKwh = 0;
  let totalFeedInKwh = 0;
  for (const dateKey of sortedDays) {
    totalConsumedKwh += dailyData[dateKey].consumedKwh;
    totalFeedInKwh += dailyData[dateKey].feedInKwh;
  }
  const netBilledKwh = Math.max(totalConsumedKwh - totalFeedInKwh, 0);

  let energyCost = 0;
  let networkCost = 0;
  let surplusKwh = 0;
  let surplusCreditEur = 0;

  if (isSingleTariff) {
    energyCost = netBilledKwh * tariff.energyPriceSingleTariff;
    networkCost = netBilledKwh * (tariff.distributionSingleTariff + tariff.transmissionSingleTariff);
    surplusKwh = Math.max(totalFeedInKwh - totalConsumedKwh, 0);
    surplusCreditEur = surplusKwh * tariff.energyPriceSingleTariff;
  } else {
    let consumedHighTariff = 0;
    let consumedLowTariff = 0;
    let feedInHighTariff = 0;
    let feedInLowTariff = 0;
    for (const dateKey of sortedDays) {
      consumedHighTariff += dailyData[dateKey].consumedHighTariffKwh;
      consumedLowTariff += dailyData[dateKey].consumedLowTariffKwh;
      feedInHighTariff += dailyData[dateKey].feedInHighTariffKwh;
      feedInLowTariff += dailyData[dateKey].feedInLowTariffKwh;
    }
    const netHighTariff = Math.max(consumedHighTariff - feedInHighTariff, 0);
    const netLowTariff = Math.max(consumedLowTariff - feedInLowTariff, 0);
    energyCost = netHighTariff * tariff.energyPriceHighTariff + netLowTariff * tariff.energyPriceLowTariff;
    networkCost =
      netHighTariff * (tariff.distributionHighTariff + tariff.transmissionHighTariff) +
      netLowTariff * (tariff.distributionLowTariff + tariff.transmissionLowTariff);
    const surplusHighTariff = Math.max(feedInHighTariff - consumedHighTariff, 0);
    const surplusLowTariff = Math.max(feedInLowTariff - consumedLowTariff, 0);
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
    totalConsumedKwh,
    totalFeedInKwh,
    surplusKwh,
    surplusCreditEur,
    effectiveCostEur: total - surplusCreditEur,
  };
}

/**
 * Calculate hypothetical bill without solar (all household consumption from grid).
 * Without panels the household would draw grid consumption PLUS the energy the
 * panels covered directly (self-consumed). Feed-in would simply not exist, so it
 * must NOT be added — it is only used as a rough proxy when production data
 * (and therefore selfConsumedKwh) is unavailable.
 */
export function calculateBillWithoutSolar(
  sortedDays: string[],
  dailyData: Record<string, DailyEnergyData>,
  tariff: TariffPrices,
  selfConsumedKwh: number | null
): number {
  const isSingleTariff = tariff.tariffModel === "single";

  let consumedKwh = 0;
  let feedInKwh = 0;
  for (const dateKey of sortedDays) {
    consumedKwh += dailyData[dateKey].consumedKwh;
    feedInKwh += dailyData[dateKey].feedInKwh;
  }
  const solarCoveredKwh = selfConsumedKwh ?? feedInKwh;
  const totalKwh = consumedKwh + solarCoveredKwh;

  let energyCost: number;
  let networkCost: number;

  if (isSingleTariff) {
    energyCost = totalKwh * tariff.energyPriceSingleTariff;
    networkCost = totalKwh * (tariff.distributionSingleTariff + tariff.transmissionSingleTariff);
  } else {
    let consumedHighTariff = 0;
    let consumedLowTariff = 0;
    let feedInHighTariff = 0;
    let feedInLowTariff = 0;
    for (const dateKey of sortedDays) {
      consumedHighTariff += dailyData[dateKey].consumedHighTariffKwh;
      consumedLowTariff += dailyData[dateKey].consumedLowTariffKwh;
      feedInHighTariff += dailyData[dateKey].feedInHighTariffKwh;
      feedInLowTariff += dailyData[dateKey].feedInLowTariffKwh;
    }
    /* Self-consumption happens during solar hours, so split it across VT/NT
       in the same proportion as feed-in; default to VT when there is no feed-in. */
    const feedInTotal = feedInHighTariff + feedInLowTariff;
    const highTariffShare = feedInTotal > 0 ? feedInHighTariff / feedInTotal : 1;
    const highTariffKwh = consumedHighTariff + solarCoveredKwh * highTariffShare;
    const lowTariffKwh = consumedLowTariff + solarCoveredKwh * (1 - highTariffShare);
    energyCost = highTariffKwh * tariff.energyPriceHighTariff + lowTariffKwh * tariff.energyPriceLowTariff;
    networkCost =
      highTariffKwh * (tariff.distributionHighTariff + tariff.transmissionHighTariff) +
      lowTariffKwh * (tariff.distributionLowTariff + tariff.transmissionLowTariff);
  }

  const solidarityCost = tariff.solidarityDiscount ? 0 : totalKwh * tariff.solidarityRate;
  const subtotal = energyCost + networkCost + solidarityCost + totalKwh * tariff.renewableEnergyRate + tariff.supplyFee + tariff.meteringFee;
  return subtotal + subtotal * tariff.vatRate;
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
  const specificYieldKwhPerKwp = totalActualKwh / installedKwp;

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
    healthStatus,
  };
}

/**
 * Seasonal irradiance index for Croatia (relative to annual average).
 * Used to normalize monthly specific yield so summer/winter differences
 * don't mask the real degradation trend.
 * Source: typical GHI distribution for continental Croatia (Zagreb area).
 */
const SEASONAL_IRRADIANCE_INDEX: Record<number, number> = {
  1: 0.40, 2: 0.55, 3: 0.80, 4: 1.05,
  5: 1.30, 6: 1.45, 7: 1.50, 8: 1.35,
  9: 1.05, 10: 0.70, 11: 0.45, 12: 0.35,
};

/** Expected annual degradation rate for crystalline silicon panels */
const EXPECTED_DEGRADATION_RATE_PERCENT = 0.5;

/** Minimum months of data needed for a reliable degradation estimate */
const MIN_MONTHS_FOR_RELIABLE_TREND = 12;

/**
 * Minimum time span (in months) between first and last data point.
 * Degradation analysis across a single season is misleading even with
 * seasonal normalization, so we require at least 12 months of span.
 */
const MIN_SPAN_MONTHS = 12;

/**
 * Analyze panel degradation across all cached months.
 * Uses seasonally-normalized specific yield (kWh/kWp) and fits a linear
 * regression to estimate annual degradation rate.
 * Returns null if fewer than 12 months of span — seasonal normalization
 * is unreliable over shorter periods.
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

    const specificYield = productionKwh / installedKwp;

    monthlyPoints.push({
      monthKey: cached.monthKey,
      productionKwh,
      specificYieldKwhPerKwp: specificYield,
      hasFusionSolar: cached.hasFusionSolar,
    });
  }

  if (monthlyPoints.length < 2) return null;

  /* Sort chronologically */
  monthlyPoints.sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  /* Require at least MIN_SPAN_MONTHS between first and last data point.
     Seasonal normalization is unreliable over shorter periods. */
  const firstMonthKey = monthlyPoints[0].monthKey;
  const lastMonthKey = monthlyPoints[monthlyPoints.length - 1].monthKey;
  const firstYear = parseInt(firstMonthKey.slice(0, 4));
  const firstMonthNum = parseInt(firstMonthKey.slice(5, 7));
  const lastYear = parseInt(lastMonthKey.slice(0, 4));
  const lastMonthNum = parseInt(lastMonthKey.slice(5, 7));
  const spanMonths = (lastYear - firstYear) * 12 + (lastMonthNum - firstMonthNum) + 1;
  if (spanMonths < MIN_SPAN_MONTHS) return null;

  /* Normalize specific yield by seasonal index to remove weather seasonality */
  const normalizedYields: { monthIndex: number; normalizedYield: number }[] = [];

  for (const point of monthlyPoints) {
    const year = parseInt(point.monthKey.slice(0, 4));
    const monthNum = parseInt(point.monthKey.slice(5, 7));
    /* Month index from start (0-based) */
    const monthIndex = (year - firstYear) * 12 + (monthNum - firstMonthNum);
    const seasonalFactor = SEASONAL_IRRADIANCE_INDEX[monthNum] || 1.0;
    /* Normalize: divide by seasonal factor so all months are comparable */
    const normalizedYield = point.specificYieldKwhPerKwp / seasonalFactor;
    normalizedYields.push({ monthIndex, normalizedYield });
  }

  /* Simple linear regression: normalizedYield = slope * monthIndex + intercept */
  const n = normalizedYields.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const { monthIndex, normalizedYield } of normalizedYields) {
    sumX += monthIndex;
    sumY += normalizedYield;
    sumXY += monthIndex * normalizedYield;
    sumXX += monthIndex * monthIndex;
  }

  const denominator = n * sumXX - sumX * sumX;
  /* Prevent division by zero when all points share the same month index */
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = (sumY - slope * sumX) / n;

  /* Convert monthly slope to annual degradation rate as percentage of initial yield */
  const initialYield = intercept > 0 ? intercept : normalizedYields[0].normalizedYield;
  const annualDegradationRatePercent = initialYield > 0
    ? -(slope * 12 / initialYield) * 100
    : 0;

  return {
    monthlyPoints,
    annualDegradationRatePercent,
    isReliable: monthlyPoints.length >= MIN_MONTHS_FOR_RELIABLE_TREND,
    expectedDegradationRatePercent: EXPECTED_DEGRADATION_RATE_PERCENT,
    trendSlopePerMonth: slope,
    trendIntercept: intercept,
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

/**
 * Seasonal solar production weights relative to annual average.
 * Based on typical Croatian solar irradiance distribution.
 * Index 0 = January, 11 = December. Weights sum to 12.0.
 */
const SEASONAL_WEIGHTS = [0.4, 0.55, 0.85, 1.1, 1.35, 1.5, 1.55, 1.4, 1.15, 0.85, 0.5, 0.3];
const MONTHS_IN_YEAR = 12;
const MAX_PROJECTION_YEARS = 25;
const MAX_PROJECTION_MONTHS = MAX_PROJECTION_YEARS * MONTHS_IN_YEAR;

/**
 * Calculate ROI and payback projections based on measured monthly savings
 * and seasonal weighting for Croatian solar conditions.
 */
export function calculateRoi(
  measuredMonthlySavingsEur: number,
  selectedMonth: MonthSelection,
  systemCostEur: number,
  installationDate: string
): RoiAnalysis {
  /* Derive base monthly savings (seasonally normalized) */
  const monthIndex = selectedMonth.month - 1;
  const currentSeasonalWeight = SEASONAL_WEIGHTS[monthIndex];
  /* Normalize measured savings to an "average month" baseline */
  const normalizedMonthlySavings = currentSeasonalWeight > 0
    ? measuredMonthlySavingsEur / currentSeasonalWeight
    : measuredMonthlySavingsEur;

  /* Estimated annual savings using seasonal distribution */
  let estimatedAnnualSavingsEur = 0;
  for (let i = 0; i < MONTHS_IN_YEAR; i++) {
    estimatedAnnualSavingsEur += normalizedMonthlySavings * SEASONAL_WEIGHTS[i];
  }

  /* Average monthly savings for payback calculation */
  const averageMonthlySavings = estimatedAnnualSavingsEur / MONTHS_IN_YEAR;
  const paybackMonths = averageMonthlySavings > 0
    ? Math.ceil(systemCostEur / averageMonthlySavings)
    : 0;

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

    /* Estimate cumulative savings from installation to now using seasonal weights */
    for (let i = 0; i < monthsElapsed; i++) {
      const projectedMonth = new Date(installDate.getFullYear(), installDate.getMonth() + i, 1);
      const weight = SEASONAL_WEIGHTS[projectedMonth.getMonth()];
      estimatedCumulativeSavingsEur += normalizedMonthlySavings * weight;
    }
  }

  /* Build projection series: from installation month until payback (or max 25 years) */
  const projections: RoiMonthProjection[] = [];
  const startDate = installationDate
    ? new Date(installationDate)
    : new Date(selectedMonth.year, selectedMonth.month - 1, 1);
  const projectionLength = Math.min(
    Math.max(paybackMonths + MONTHS_IN_YEAR, monthsElapsed + MONTHS_IN_YEAR * 2),
    MAX_PROJECTION_MONTHS
  );

  let cumulative = 0;
  for (let i = 0; i < projectionLength; i++) {
    const projectedDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const weight = SEASONAL_WEIGHTS[projectedDate.getMonth()];
    const monthlySavings = normalizedMonthlySavings * weight;
    cumulative += monthlySavings;

    const label = `${projectedDate.getFullYear()}-${String(projectedDate.getMonth() + 1).padStart(2, "0")}`;
    projections.push({
      label,
      monthlySavingsEur: monthlySavings,
      cumulativeSavingsEur: cumulative,
    });
  }

  return {
    measuredMonthlySavingsEur,
    estimatedAnnualSavingsEur,
    paybackMonths,
    annualRoiPercent,
    monthsElapsed,
    estimatedCumulativeSavingsEur,
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
  const historicalTotal = historicalDays.reduce((sum, day) => sum + day.dailyGhiWh, 0);
  const historicalAvg = historicalDays.length > 0 ? historicalTotal / historicalDays.length : 0;

  if (historicalAvg <= 0) return {};

  const scaleFactors: Record<string, number> = {};
  for (const day of forecastDays) {
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
  bill: BillBreakdown | null,
  billWithoutSolar: number | null,
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
  const averageDailyConsumedKwh = forecastBasis.reduce((sum, day) => sum + day.consumed, 0) / basisCount;
  const averageDailySelfConsumedKwh = hasFusionSolar
    ? forecastBasis.reduce((sum, day) => sum + day.selfConsumed, 0) / basisCount
    : 0;

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

  /* Project bill — scale only the consumption-driven part; fixed monthly fees
     (supply + metering) don't grow with days */
  let projectedBillEur = 0;
  let projectedSavingsEur = 0;
  if (bill && billWithoutSolar !== null) {
    const scaleFactor = totalDaysInMonth / analyzedDays;
    const vatFactor = bill.subtotal > 0 ? 1 + bill.vatAmount / bill.subtotal : 1;
    const fixedCostsWithVat = bill.fixedCosts * vatFactor;
    const variableCostWithVat = bill.total - fixedCostsWithVat;
    projectedBillEur = fixedCostsWithVat + variableCostWithVat * scaleFactor;
    /* Fixed fees cancel in the savings difference; use real cost incl. surplus payout */
    projectedSavingsEur = (billWithoutSolar - bill.effectiveCostEur) * scaleFactor;
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

/** Grid energy flows split by tariff band */
interface GridFlows {
  importHighTariffKwh: number;
  importLowTariffKwh: number;
  exportHighTariffKwh: number;
  exportLowTariffKwh: number;
}

/**
 * Real monthly cost for given grid flows under samoopskrba net metering:
 * netted per-kWh items + fixed fees + VAT, minus the surplus payout (otkup)
 * at the energy tariff. Mirrors calculateBill, but works on arbitrary flows
 * so battery scenarios can be priced consistently.
 */
function computeNetBillingCost(flows: GridFlows, tariff: TariffPrices): number {
  const importTotalKwh = flows.importHighTariffKwh + flows.importLowTariffKwh;
  const exportTotalKwh = flows.exportHighTariffKwh + flows.exportLowTariffKwh;

  let energyCost: number;
  let networkCost: number;
  let netTotalKwh: number;
  let surplusCreditEur: number;

  if (tariff.tariffModel === "single") {
    netTotalKwh = Math.max(importTotalKwh - exportTotalKwh, 0);
    energyCost = netTotalKwh * tariff.energyPriceSingleTariff;
    networkCost = netTotalKwh * (tariff.distributionSingleTariff + tariff.transmissionSingleTariff);
    surplusCreditEur = Math.max(exportTotalKwh - importTotalKwh, 0) * tariff.energyPriceSingleTariff;
  } else {
    const netHighKwh = Math.max(flows.importHighTariffKwh - flows.exportHighTariffKwh, 0);
    const netLowKwh = Math.max(flows.importLowTariffKwh - flows.exportLowTariffKwh, 0);
    netTotalKwh = netHighKwh + netLowKwh;
    energyCost = netHighKwh * tariff.energyPriceHighTariff + netLowKwh * tariff.energyPriceLowTariff;
    networkCost =
      netHighKwh * (tariff.distributionHighTariff + tariff.transmissionHighTariff) +
      netLowKwh * (tariff.distributionLowTariff + tariff.transmissionLowTariff);
    const surplusHighKwh = Math.max(flows.exportHighTariffKwh - flows.importHighTariffKwh, 0);
    const surplusLowKwh = Math.max(flows.exportLowTariffKwh - flows.importLowTariffKwh, 0);
    surplusCreditEur =
      surplusHighKwh * tariff.energyPriceHighTariff + surplusLowKwh * tariff.energyPriceLowTariff;
  }

  const solidarityCost = tariff.solidarityDiscount ? 0 : netTotalKwh * tariff.solidarityRate;
  const renewableCost = netTotalKwh * tariff.renewableEnergyRate;
  const subtotal = energyCost + networkCost + solidarityCost + renewableCost + tariff.supplyFee + tariff.meteringFee;
  return subtotal * (1 + tariff.vatRate) - surplusCreditEur;
}

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
  let totalSelfConsumedWithBatteryKwh = 0;
  let totalGenerationKwh = 0;
  let totalConsumptionKwh = 0;

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

      totalGenerationKwh += genKwh;
      totalConsumptionKwh += conKwh;

      /* Net surplus or deficit this hour */
      const surplus = genKwh - conKwh;
      let chargedKwh = 0;
      let dischargedKwh = 0;
      let gridImportKwh = 0;
      let gridExportKwh = 0;

      if (surplus > 0) {
        /* Excess solar — charge battery first, export remainder */
        const availableCapacity = battery.capacityKwh - stateOfChargeKwh;
        const maxCharge = Math.min(surplus * chargeEfficiency, battery.maxChargeRateKw * chargeEfficiency, availableCapacity);
        chargedKwh = Math.max(maxCharge, 0);
        stateOfChargeKwh += chargedKwh;
        totalEnergyStoredKwh += chargedKwh;

        /* Remaining surplus goes to grid */
        const usedForCharging = chargedKwh / chargeEfficiency;
        gridExportKwh = surplus - usedForCharging;
      } else {
        /* Deficit — discharge battery first, import remainder from grid */
        const deficit = -surplus;
        const maxDischarge = Math.min(stateOfChargeKwh, battery.maxDischargeRateKw, deficit / dischargeEfficiency);
        dischargedKwh = Math.max(maxDischarge, 0);
        stateOfChargeKwh -= dischargedKwh;
        totalEnergyDischargedKwh += dischargedKwh;

        const coveredByBattery = dischargedKwh * dischargeEfficiency;
        gridImportKwh = Math.max(deficit - coveredByBattery, 0);
      }

      totalGridImportWithBatteryKwh += gridImportKwh;
      totalGridExportWithBatteryKwh += gridExportKwh;

      /* Self-consumed = generation used directly + battery discharge covering consumption */
      const directSelfConsumed = Math.min(genKwh, conKwh);
      const batteryContribution = dischargedKwh * dischargeEfficiency;
      totalSelfConsumedWithBatteryKwh += directSelfConsumed + batteryContribution;

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
  const billWithBatteryEur = computeNetBillingCost(flowsWithBattery, tariff);
  const billWithoutBatteryEur = totalConsumptionKwh > 0 || totalGenerationKwh > 0
    ? computeNetBillingCost(flowsWithoutBattery, tariff)
    : 0;
  const totalGridImportWithoutBatteryKwh = derived.totalConsumed;

  const monthlySavingsEur = billWithoutBatteryEur - billWithBatteryEur;

  /* Self-consumption and self-sufficiency rates */
  const selfConsumptionWithoutBatteryPercent = totalGenerationKwh > 0
    ? (derived.totalSelfConsumed / totalGenerationKwh) * 100
    : 0;
  const selfConsumptionWithBatteryPercent = totalGenerationKwh > 0
    ? Math.min((totalSelfConsumedWithBatteryKwh / totalGenerationKwh) * 100, 100)
    : 0;
  const selfSufficiencyWithBatteryPercent = totalConsumptionKwh > 0
    ? Math.min(((totalConsumptionKwh - totalGridImportWithBatteryKwh) / totalConsumptionKwh) * 100, 100)
    : 0;

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
    totalEnergyStoredKwh,
    totalEnergyDischargedKwh,
    totalGridImportWithBatteryKwh,
    totalGridExportWithBatteryKwh,
    totalGridImportWithoutBatteryKwh,
    estimatedAnnualSavingsEur,
    paybackYears,
  };
}
