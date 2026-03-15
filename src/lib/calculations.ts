import {
  Config,
  DailyEnergyData,
  FusionSolarDay,
  DerivedMonthlyData,
  BillBreakdown,
  HEPMeterRecord,
  HourlySample,
  MonthSelection,
  LoadShiftAnalysis,
  HourlyLoadShiftProfile,
  RoiAnalysis,
  RoiMonthProjection,
} from "@/lib/types";

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
  config: Config
): BillBreakdown {
  const isSingleTariff = config.tariffModel === "single";

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
    energyCost = netBilledKwh * config.energyPriceSingleTariff;
    networkCost = netBilledKwh * (config.distributionSingleTariff + config.transmissionSingleTariff);
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
    energyCost = netHighTariff * config.energyPriceHighTariff + netLowTariff * config.energyPriceLowTariff;
    networkCost =
      netHighTariff * (config.distributionHighTariff + config.transmissionHighTariff) +
      netLowTariff * (config.distributionLowTariff + config.transmissionLowTariff);
  }

  const solidarityCost = config.solidarityDiscount ? 0 : netBilledKwh * config.solidarityRate;
  const renewableEnergyCost = netBilledKwh * config.renewableEnergyRate;
  const fixedCosts = config.supplyFee + config.meteringFee;
  const subtotal = energyCost + networkCost + solidarityCost + renewableEnergyCost + fixedCosts;
  const vatAmount = subtotal * config.vatRate;

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
  config: Config
): number {
  const isSingleTariff = config.tariffModel === "single";
  let totalKwh = 0;
  for (const dateKey of sortedDays) {
    totalKwh += dailyData[dateKey].consumedKwh + dailyData[dateKey].feedInKwh;
  }

  let energyCost: number;
  let networkCost: number;

  if (isSingleTariff) {
    energyCost = totalKwh * config.energyPriceSingleTariff;
    networkCost = totalKwh * (config.distributionSingleTariff + config.transmissionSingleTariff);
  } else {
    let highTariffKwh = 0;
    let lowTariffKwh = 0;
    for (const dateKey of sortedDays) {
      highTariffKwh += dailyData[dateKey].consumedHighTariffKwh + dailyData[dateKey].feedInHighTariffKwh;
      lowTariffKwh += dailyData[dateKey].consumedLowTariffKwh + dailyData[dateKey].feedInLowTariffKwh;
    }
    energyCost = highTariffKwh * config.energyPriceHighTariff + lowTariffKwh * config.energyPriceLowTariff;
    networkCost =
      highTariffKwh * (config.distributionHighTariff + config.transmissionHighTariff) +
      lowTariffKwh * (config.distributionLowTariff + config.transmissionLowTariff);
  }

  const solidarityCost = config.solidarityDiscount ? 0 : totalKwh * config.solidarityRate;
  const subtotal = energyCost + networkCost + solidarityCost + totalKwh * config.renewableEnergyRate + config.supplyFee + config.meteringFee;
  return subtotal + subtotal * config.vatRate;
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
  config: Config
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
  const isSingleTariff = config.tariffModel === "single";
  const effectiveRate = isSingleTariff
    ? config.energyPriceSingleTariff + config.distributionSingleTariff + config.transmissionSingleTariff
    : config.energyPriceHighTariff + config.distributionHighTariff + config.transmissionHighTariff;
  const rateWithSurcharges = effectiveRate + config.renewableEnergyRate +
    (config.solidarityDiscount ? 0 : config.solidarityRate);
  const rateWithVat = rateWithSurcharges * (1 + config.vatRate);
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
