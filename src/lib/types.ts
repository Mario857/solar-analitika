export interface MonthSelection {
  month: number;
  year: number;
}

/** Per-day aggregated energy data from HEP meter readings */
export interface DailyEnergyData {
  feedInKwh: number;
  consumedKwh: number;
  peakGenerationKw: number;
  peakGenerationTime: string;
  peakConsumptionKw: number;
  peakConsumptionTime: string;
  /** Feed-in during high tariff (VT) hours */
  feedInHighTariffKwh: number;
  /** Feed-in during low tariff (NT) hours */
  feedInLowTariffKwh: number;
  /** Consumption during high tariff (VT) hours */
  consumedHighTariffKwh: number;
  /** Consumption during low tariff (NT) hours */
  consumedLowTariffKwh: number;
  statusIndicators: number[];
}

/** Hourly meter sample aggregation */
export interface HourlySample {
  generation: number;
  consumption: number;
  sampleCount: number;
}

/** Per-day production data from FusionSolar */
export interface FusionSolarDay {
  production: number;
}

/** Computed daily metrics combining HEP + FusionSolar data */
export interface DerivedDayMetrics {
  date: string;
  feedIn: number;
  consumed: number;
  solarProduction: number;
  selfConsumed: number;
  householdTotal: number;
  /** Self-consumption rate: % of solar used directly */
  selfConsumptionRate: number;
  /** Self-sufficiency: % of household covered by solar */
  selfSufficiency: number;
}

/** Monthly aggregate derived metrics */
export interface DerivedMonthlyData {
  days: DerivedDayMetrics[];
  totalFeedIn: number;
  totalConsumed: number;
  totalSolarProduction: number;
  totalSelfConsumed: number;
  totalHousehold: number;
  selfConsumptionRate: number;
  selfSufficiency: number;
}

/** Calculated electricity bill breakdown */
export interface BillBreakdown {
  energyCost: number;
  networkCost: number;
  solidarityCost: number;
  renewableEnergyCost: number;
  fixedCosts: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  /** Net kWh billed after offsetting feed-in */
  netBilledKwh: number;
  totalConsumedKwh: number;
  totalFeedInKwh: number;
}

/** All tariff/price fields that can vary by date period */
export interface TariffPrices {
  tariffModel: "single" | "dual";
  /** Single tariff energy price (€/kWh) */
  energyPriceSingleTariff: number;
  /** High tariff energy price (€/kWh) */
  energyPriceHighTariff: number;
  /** Low tariff energy price (€/kWh) */
  energyPriceLowTariff: number;
  /** Monthly supply fee (€) */
  supplyFee: number;
  /** Distribution fee — single tariff (€/kWh) */
  distributionSingleTariff: number;
  /** Distribution fee — high tariff (€/kWh) */
  distributionHighTariff: number;
  /** Distribution fee — low tariff (€/kWh) */
  distributionLowTariff: number;
  /** Transmission fee — single tariff (€/kWh) */
  transmissionSingleTariff: number;
  /** Transmission fee — high tariff (€/kWh) */
  transmissionHighTariff: number;
  /** Transmission fee — low tariff (€/kWh) */
  transmissionLowTariff: number;
  /** Monthly metering fee (€) */
  meteringFee: number;
  /** Solidarity surcharge rate (€/kWh) */
  solidarityRate: number;
  /** Whether solidarity discount is active */
  solidarityDiscount: boolean;
  /** Renewable energy (OIE) surcharge (€/kWh) */
  renewableEnergyRate: number;
  /** VAT rate (e.g., 0.13 = 13%) */
  vatRate: number;
}

/** A tariff period with a start date — prices apply from this date until the next period */
export interface TariffPeriod extends TariffPrices {
  /** Start date in ISO format (YYYY-MM-DD). Prices apply from this date forward. */
  validFrom: string;
  /** Optional label for display (e.g. "HEPI Plavi 2025") */
  label: string;
}

/** User configuration for API credentials and tariff settings */
export interface Config extends TariffPrices {
  token: string;
  meter: string;
  fusionSolarCookie: string;
  fusionSolarStation: string;
  /** FusionSolar portal subdomain (e.g. "uni004eu5") */
  fusionSolarSubdomain: string;
  /** Total solar system cost including installation (€) */
  systemCostEur: number;
  /** Installation date in ISO format (YYYY-MM-DD) */
  installationDate: string;
  /** Location latitude for weather forecast (default: Zagreb area) */
  latitude: number;
  /** Location longitude for weather forecast (default: Zagreb area) */
  longitude: number;
  /** Historical tariff periods — sorted by validFrom ascending */
  tariffHistory: TariffPeriod[];
}

/** Session-only credentials — never persisted to localStorage */
export interface SessionCredentials {
  hepUsername: string;
  hepPassword: string;
  fusionSolarUsername: string;
  fusionSolarPassword: string;
}

/** Hourly load shift analysis for a single hour slot */
export interface HourlyLoadShiftProfile {
  hour: number;
  averageGenerationKw: number;
  averageConsumptionKw: number;
  /** Grid consumption that overlaps with solar production hours — potential to self-consume */
  shiftableConsumptionKw: number;
  /** Excess solar going to grid instead of being used */
  excessGenerationKw: number;
}

/** Monthly load shift analysis summary */
export interface LoadShiftAnalysis {
  hourlyProfiles: HourlyLoadShiftProfile[];
  /** Total grid consumption during solar production hours (kWh/day average) */
  gridConsumptionDuringSolarKwh: number;
  /** Total excess generation exported during peak solar (kWh/day average) */
  excessSolarExportKwh: number;
  /** Estimated daily kWh that could be shifted from evening to solar hours */
  shiftableDailyKwh: number;
  /** Best hours to run heavy appliances (sorted by excess generation) */
  bestHoursForLoad: number[];
  /** Hours with highest grid consumption that could be shifted */
  peakGridConsumptionHours: number[];
  /** Estimated monthly savings if shiftable load is moved to solar hours (€) */
  estimatedMonthlySavingsEur: number;
}

/** ROI projection for a single month */
export interface RoiMonthProjection {
  /** Month label (e.g. "2025-03") */
  label: string;
  /** Estimated savings for this month (€) */
  monthlySavingsEur: number;
  /** Cumulative savings up to and including this month (€) */
  cumulativeSavingsEur: number;
}

/** Full ROI analysis result */
export interface RoiAnalysis {
  /** Monthly savings from the analyzed month (€) */
  measuredMonthlySavingsEur: number;
  /** Estimated annual savings based on seasonal weighting (€) */
  estimatedAnnualSavingsEur: number;
  /** Months until system cost is recovered */
  paybackMonths: number;
  /** Annual return on investment (%) */
  annualRoiPercent: number;
  /** Months elapsed since installation */
  monthsElapsed: number;
  /** Estimated cumulative savings since installation (€) */
  estimatedCumulativeSavingsEur: number;
  /** Monthly projection series for chart (past + future until payback or 25 years) */
  projections: RoiMonthProjection[];
}

/** Production forecast for a partial month */
/** Daily solar radiation data from Open-Meteo */
export interface WeatherDayRadiation {
  date: string;
  /** Sum of hourly shortwave radiation (W/m² · h) */
  dailyGhiWh: number;
}

export interface MonthForecast {
  /** Whether weather forecast data was used for scaling */
  isWeatherAdjusted: boolean;
  /** Number of days with actual data */
  analyzedDays: number;
  /** Total days in the month */
  totalDaysInMonth: number;
  /** Remaining days to project */
  remainingDays: number;
  /** Average daily production from analyzed days (kWh) */
  averageDailyProductionKwh: number;
  /** Average daily feed-in from analyzed days (kWh) */
  averageDailyFeedInKwh: number;
  /** Average daily consumption from analyzed days (kWh) */
  averageDailyConsumedKwh: number;
  /** Average daily self-consumption from analyzed days (kWh) */
  averageDailySelfConsumedKwh: number;
  /** Projected month-end total production (kWh) */
  projectedProductionKwh: number;
  /** Projected month-end total feed-in (kWh) */
  projectedFeedInKwh: number;
  /** Projected month-end total consumption (kWh) */
  projectedConsumedKwh: number;
  /** Projected month-end total self-consumption (kWh) */
  projectedSelfConsumedKwh: number;
  /** Projected month-end self-sufficiency (%) */
  projectedSelfSufficiencyPercent: number;
  /** Projected month-end bill (€) — estimated using daily average rate */
  projectedBillEur: number;
  /** Projected month-end savings (€) */
  projectedSavingsEur: number;
  /** Per-day values for chart: actual days + projected days */
  dailySeries: ForecastDayEntry[];
}

/** Single day entry in the forecast chart series */
export interface ForecastDayEntry {
  dayLabel: string;
  actualProductionKwh: number | null;
  actualFeedInKwh: number | null;
  actualConsumedKwh: number | null;
  projectedProductionKwh: number | null;
  projectedFeedInKwh: number | null;
  projectedConsumedKwh: number | null;
}

/** Cached monthly analysis result stored in IndexedDB */
export interface CachedMonthData {
  /** Cache key: "YYYY-MM" */
  monthKey: string;
  /** When this data was cached (ISO string) */
  cachedAt: string;
  dailyData: Record<string, DailyEnergyData>;
  fusionSolarDaily: Record<string, FusionSolarDay>;
  hourlyData: Record<string, Record<number, HourlySample>>;
  sortedDays: string[];
  hasConsumption: boolean;
  hasFusionSolar: boolean;
}

/** Summary for one month used in the yearly overview */
export interface MonthSummary {
  monthKey: string;
  totalFeedInKwh: number;
  totalConsumedKwh: number;
  totalSolarProductionKwh: number;
  totalSelfConsumedKwh: number;
  totalHouseholdKwh: number;
  selfConsumptionRatePercent: number;
  selfSufficiencyPercent: number;
  billTotalEur: number;
  billWithoutSolarEur: number;
  savingsEur: number;
}

/** Raw HEP API meter reading record */
export interface HEPMeterRecord {
  Datum: string;
  Value: string;
  Status?: string;
}
