import {
  Config,
  DailyEnergyData,
  FusionSolarDay,
  DerivedMonthlyData,
  BillBreakdown,
  HEPMeterRecord,
  HourlySample,
  MonthSelection,
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
