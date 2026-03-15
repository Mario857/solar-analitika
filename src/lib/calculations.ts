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

/** Check if a timestamp falls within high tariff (VT) hours */
export function isHighTariffHour(timestamp: Date): boolean {
  const month = timestamp.getMonth();
  const hour = timestamp.getHours();
  const isSummer = month >= 3 && month <= 9;
  // Summer (Apr-Oct): VT 08-22, Winter (Nov-Mar): VT 07-21
  return isSummer ? hour >= 8 && hour < 22 : hour >= 7 && hour < 21;
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
        hourlyData[dateKey][hour] = { generation: 0, consumption: 0, sampleCount: 0 };
      }
    }
  }

  for (const record of generationRecords) {
    const timestamp = new Date(record.Datum);
    const dateKey = timestamp.toISOString().slice(0, 10);
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
    const dateKey = timestamp.toISOString().slice(0, 10);
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

    hourlyData[dateKey][timestamp.getHours()].consumption += powerKw;
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
      const dateStr = (record.collectTime as string) || (record.date as string) || "";
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

/** Calculate monthly electricity bill with net billing (feed-in offsets consumption) */
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

  if (isSingleTariff) {
    energyCost = netBilledKwh * tariff.energyPriceSingleTariff;
    networkCost = netBilledKwh * (tariff.distributionSingleTariff + tariff.transmissionSingleTariff);
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
  }

  const solidarityCost = tariff.solidarityDiscount ? 0 : netBilledKwh * tariff.solidarityRate;
  const renewableEnergyCost = netBilledKwh * tariff.renewableEnergyRate;
  const fixedCosts = tariff.supplyFee + tariff.meteringFee;
  const subtotal = energyCost + networkCost + solidarityCost + renewableEnergyCost + fixedCosts;
  const vatAmount = subtotal * tariff.vatRate;

  return {
    energyCost,
    networkCost,
    solidarityCost,
    renewableEnergyCost,
    fixedCosts,
    subtotal,
    vatAmount,
    total: subtotal + vatAmount,
    netBilledKwh,
    totalConsumedKwh,
    totalFeedInKwh,
  };
}

/** Calculate hypothetical bill without solar (all consumption from grid) */
export function calculateBillWithoutSolar(
  sortedDays: string[],
  dailyData: Record<string, DailyEnergyData>,
  tariff: TariffPrices
): number {
  const isSingleTariff = tariff.tariffModel === "single";
  let totalKwh = 0;
  for (const dateKey of sortedDays) {
    totalKwh += dailyData[dateKey].consumedKwh + dailyData[dateKey].feedInKwh;
  }

  let energyCost: number;
  let networkCost: number;

  if (isSingleTariff) {
    energyCost = totalKwh * tariff.energyPriceSingleTariff;
    networkCost = totalKwh * (tariff.distributionSingleTariff + tariff.transmissionSingleTariff);
  } else {
    let highTariffKwh = 0;
    let lowTariffKwh = 0;
    for (const dateKey of sortedDays) {
      highTariffKwh += dailyData[dateKey].consumedHighTariffKwh + dailyData[dateKey].feedInHighTariffKwh;
      lowTariffKwh += dailyData[dateKey].consumedLowTariffKwh + dailyData[dateKey].feedInLowTariffKwh;
    }
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
  tariff: TariffPrices
): TariffComparison {
  const singleTariff: TariffPrices = { ...tariff, tariffModel: "single" };
  const dualTariff: TariffPrices = { ...tariff, tariffModel: "dual" };

  const singleTariffBill = calculateBill(sortedDays, dailyData, singleTariff);
  const dualTariffBill = calculateBill(sortedDays, dailyData, dualTariff);
  const singleTariffBillWithoutSolar = calculateBillWithoutSolar(sortedDays, dailyData, singleTariff);
  const dualTariffBillWithoutSolar = calculateBillWithoutSolar(sortedDays, dailyData, dualTariff);

  const singleTariffSolarSavings = singleTariffBillWithoutSolar - singleTariffBill.total;
  const dualTariffSolarSavings = dualTariffBillWithoutSolar - dualTariffBill.total;

  const cheaperWithSolar = singleTariffBill.total <= dualTariffBill.total ? "single" : "dual";
  const savingsDifference = Math.abs(singleTariffBill.total - dualTariffBill.total);

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
 */
export function analyzeLoadShifting(
  sortedDays: string[],
  hourlyData: Record<string, Record<number, HourlySample>>,
  tariff: TariffPrices
): LoadShiftAnalysis {
  const dayCount = sortedDays.length || 1;

  /* Build average hourly profiles across the month */
  const hourlyProfiles: HourlyLoadShiftProfile[] = [];
  for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
    let totalGeneration = 0;
    let totalConsumption = 0;

    for (const dateKey of sortedDays) {
      const sample = hourlyData[dateKey]?.[hour];
      if (sample && sample.sampleCount > 0) {
        totalGeneration += sample.generation / sample.sampleCount;
        totalConsumption += sample.consumption / sample.sampleCount;
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

  /* Monthly savings estimate: shifted kWh × effective energy rate × days */
  const isSingleTariff = tariff.tariffModel === "single";
  const effectiveRate = isSingleTariff
    ? tariff.energyPriceSingleTariff + tariff.distributionSingleTariff + tariff.transmissionSingleTariff
    : tariff.energyPriceHighTariff + tariff.distributionHighTariff + tariff.transmissionHighTariff;
  const rateWithSurcharges = effectiveRate + tariff.renewableEnergyRate +
    (tariff.solidarityDiscount ? 0 : tariff.solidarityRate);
  const rateWithVat = rateWithSurcharges * (1 + tariff.vatRate);
  const estimatedMonthlySavingsEur = shiftableDailyKwh * dayCount * rateWithVat;

  return {
    hourlyProfiles,
    gridConsumptionDuringSolarKwh,
    excessSolarExportKwh,
    shiftableDailyKwh,
    bestHoursForLoad,
    peakGridConsumptionHours,
    estimatedMonthlySavingsEur,
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
  const bill = cached.hasConsumption
    ? calculateBill(cached.sortedDays, cached.dailyData, tariff)
    : null;
  const billWithoutSolar = cached.hasConsumption
    ? calculateBillWithoutSolar(cached.sortedDays, cached.dailyData, tariff)
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
    savingsEur: bill ? billWithoutSolar - bill.total : 0,
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
  const todayStr = new Date().toISOString().slice(0, 10);
  const activeDays = derived.days.filter(
    (day) => day.date !== todayStr && (day.feedIn > 0 || day.consumed > 0 || day.solarProduction > 0)
  );
  const analyzedDays = activeDays.length;
  const remainingDays = totalDaysInMonth - analyzedDays;

  /* Only forecast partial months with enough data */
  if (remainingDays <= 0 || analyzedDays < MIN_FORECAST_DAYS) return null;

  /* Filter out near-zero production days (cloudy/rain) for a more realistic average */
  const productiveDays = hasFusionSolar
    ? activeDays.filter((day) => day.solarProduction > FORECAST_LOW_PRODUCTION_THRESHOLD)
    : activeDays.filter((day) => day.feedIn > FORECAST_LOW_PRODUCTION_THRESHOLD);
  /* Fall back to all active days if most are low-production */
  const forecastBasis = productiveDays.length >= MIN_FORECAST_DAYS ? productiveDays : activeDays;
  const basisCount = forecastBasis.length;

  const averageDailyProductionKwh = hasFusionSolar
    ? forecastBasis.reduce((sum, day) => sum + day.solarProduction, 0) / basisCount
    : 0;
  const averageDailyFeedInKwh = forecastBasis.reduce((sum, day) => sum + day.feedIn, 0) / basisCount;
  const averageDailyConsumedKwh = forecastBasis.reduce((sum, day) => sum + day.consumed, 0) / basisCount;
  const averageDailySelfConsumedKwh = hasFusionSolar
    ? forecastBasis.reduce((sum, day) => sum + day.selfConsumed, 0) / basisCount
    : 0;

  const isWeatherAdjusted = !!weatherScaleFactors && Object.keys(weatherScaleFactors).length > 0;

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
    const dayNumber = analyzedDays + dayOffset;
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

  /* Project bill — scale from analyzed portion */
  let projectedBillEur = 0;
  let projectedSavingsEur = 0;
  if (bill && billWithoutSolar !== null) {
    const scaleFactor = totalDaysInMonth / analyzedDays;
    projectedBillEur = bill.total * scaleFactor;
    projectedSavingsEur = (billWithoutSolar - bill.total) * scaleFactor;
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
 * Prefers discharging during high tariff hours for maximum savings.
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

  /* For bill recalculation with battery */
  let gridImportHighTariffKwh = 0;
  let gridImportLowTariffKwh = 0;
  let gridExportHighTariffKwh = 0;
  let gridExportLowTariffKwh = 0;

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

    const timestamp = new Date(dateKey + "T00:00:00");
    const month = timestamp.getMonth();
    const isSummer = month >= 3 && month <= 9;

    for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
      const sample = dayHourly[hour];
      /* HourlySample stores total kWh across all samples in that hour.
         generation/consumption are already in kWh for the full hour. */
      const genKwh = sample ? sample.generation : 0;
      const conKwh = sample ? sample.consumption : 0;
      const isHighTariff = isSummer ? hour >= 8 && hour < 22 : hour >= 7 && hour < 21;

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

      /* Tariff-split grid flows for bill calculation */
      if (isHighTariff) {
        gridImportHighTariffKwh += gridImportKwh;
        gridExportHighTariffKwh += gridExportKwh;
      } else {
        gridImportLowTariffKwh += gridImportKwh;
        gridExportLowTariffKwh += gridExportKwh;
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

  const sampleMonth = sortedDays[0] ? new Date(sortedDays[0] + "T00:00:00") : new Date(selectedMonth.year, selectedMonth.month - 1, 1);
  const monthIdx = sampleMonth.getMonth();
  const isSummerSample = monthIdx >= 3 && monthIdx <= 9;

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
      isHighTariff: isSummerSample ? hour >= 8 && hour < 22 : hour >= 7 && hour < 21,
    };
  });

  /* Calculate bill with battery using net billing on the battery-adjusted grid flows */
  const isSingleTariff = tariff.tariffModel === "single";
  let billWithBatteryEur: number;

  if (isSingleTariff) {
    const netKwh = Math.max(totalGridImportWithBatteryKwh - totalGridExportWithBatteryKwh, 0);
    const energyCost = netKwh * tariff.energyPriceSingleTariff;
    const networkCost = netKwh * (tariff.distributionSingleTariff + tariff.transmissionSingleTariff);
    const solidarityCost = tariff.solidarityDiscount ? 0 : netKwh * tariff.solidarityRate;
    const renewableCost = netKwh * tariff.renewableEnergyRate;
    const subtotal = energyCost + networkCost + solidarityCost + renewableCost + tariff.supplyFee + tariff.meteringFee;
    billWithBatteryEur = subtotal + subtotal * tariff.vatRate;
  } else {
    const netHighKwh = Math.max(gridImportHighTariffKwh - gridExportHighTariffKwh, 0);
    const netLowKwh = Math.max(gridImportLowTariffKwh - gridExportLowTariffKwh, 0);
    const netTotalKwh = netHighKwh + netLowKwh;
    const energyCost = netHighKwh * tariff.energyPriceHighTariff + netLowKwh * tariff.energyPriceLowTariff;
    const networkCost =
      netHighKwh * (tariff.distributionHighTariff + tariff.transmissionHighTariff) +
      netLowKwh * (tariff.distributionLowTariff + tariff.transmissionLowTariff);
    const solidarityCost = tariff.solidarityDiscount ? 0 : netTotalKwh * tariff.solidarityRate;
    const renewableCost = netTotalKwh * tariff.renewableEnergyRate;
    const subtotal = energyCost + networkCost + solidarityCost + renewableCost + tariff.supplyFee + tariff.meteringFee;
    billWithBatteryEur = subtotal + subtotal * tariff.vatRate;
  }

  /* Current bill without battery (actual measured values) */
  const totalGridImportWithoutBatteryKwh = derived.totalConsumed;
  const billWithoutBatteryEur = derived.totalConsumed > 0
    ? (() => {
        /* Reuse existing bill logic via grid import/export totals */
        if (isSingleTariff) {
          const netKwh = Math.max(derived.totalConsumed - derived.totalFeedIn, 0);
          const energyCost = netKwh * tariff.energyPriceSingleTariff;
          const networkCost = netKwh * (tariff.distributionSingleTariff + tariff.transmissionSingleTariff);
          const solidarityCost = tariff.solidarityDiscount ? 0 : netKwh * tariff.solidarityRate;
          const renewableCost = netKwh * tariff.renewableEnergyRate;
          const subtotal = energyCost + networkCost + solidarityCost + renewableCost + tariff.supplyFee + tariff.meteringFee;
          return subtotal + subtotal * tariff.vatRate;
        }
        /* Dual tariff — sum from daily data */
        let conHT = 0, conLT = 0, expHT = 0, expLT = 0;
        for (const day of derived.days) {
          const dateKey = day.date;
          const hourly = hourlyData[dateKey];
          if (!hourly) continue;
          const ts = new Date(dateKey + "T00:00:00");
          const m = ts.getMonth();
          const isSumLocal = m >= 3 && m <= 9;
          for (let h = 0; h < HOURS_IN_DAY; h++) {
            const s = hourly[h];
            if (!s) continue;
            const isHT = isSumLocal ? h >= 8 && h < 22 : h >= 7 && h < 21;
            if (isHT) { conHT += s.consumption; expHT += s.generation; }
            else { conLT += s.consumption; expLT += s.generation; }
          }
        }
        const netHT = Math.max(conHT - expHT, 0);
        const netLT = Math.max(conLT - expLT, 0);
        const netTotal = netHT + netLT;
        const energyCost = netHT * tariff.energyPriceHighTariff + netLT * tariff.energyPriceLowTariff;
        const networkCost =
          netHT * (tariff.distributionHighTariff + tariff.transmissionHighTariff) +
          netLT * (tariff.distributionLowTariff + tariff.transmissionLowTariff);
        const solidarityCost = tariff.solidarityDiscount ? 0 : netTotal * tariff.solidarityRate;
        const renewableCost = netTotal * tariff.renewableEnergyRate;
        const subtotal = energyCost + networkCost + solidarityCost + renewableCost + tariff.supplyFee + tariff.meteringFee;
        return subtotal + subtotal * tariff.vatRate;
      })()
    : 0;

  const monthlySavingsEur = Math.max(billWithoutBatteryEur - billWithBatteryEur, 0);

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

  /* Payback estimate */
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
