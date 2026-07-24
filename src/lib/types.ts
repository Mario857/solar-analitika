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

/** Hourly meter sample aggregation — generation/consumption are sums of 15-min kW readings */
export interface HourlySample {
  generation: number;
  consumption: number;
  /** Number of generation readings in this hour */
  sampleCount: number;
  /** Number of consumption readings in this hour — optional for cached data from older versions */
  consumptionSampleCount?: number;
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
  /**
   * Net kWh that every per-kWh item is charged on under the active tariff model.
   * Single tariff nets the whole month; dual tariff nets each band separately and
   * sums them, so this is NOT simply `consumed - feedIn` in dual mode.
   */
  netBilledKwh: number;
  /** Net kWh in the high tariff (VT) band after offsetting VT feed-in */
  netHighTariffKwh: number;
  /** Net kWh in the low tariff (NT) band after offsetting NT feed-in */
  netLowTariffKwh: number;
  totalConsumedKwh: number;
  totalFeedInKwh: number;
  /** Feed-in surplus beyond consumption (kWh) — purchased by HEP (otkup) */
  surplusKwh: number;
  /** Payout for surplus energy at the energy tariff, no VAT (€) */
  surplusCreditEur: number;
  /** Real monthly cost: invoice total minus surplus payout (€) — can be negative */
  effectiveCostEur: number;
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
  /** Installed solar panel capacity in kilo-watt peak */
  installedKwp: number;
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
  /** OpenRouter API key for the AI assistant */
  openRouterApiKey: string;
  /** OpenRouter model id (e.g. "anthropic/claude-sonnet-4.5") */
  openRouterModel: string;
}

/** Single message in the AI assistant conversation */
export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
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
}

/** ROI projection for a single month */
export interface RoiMonthProjection {
  /** Month label (e.g. "2025-03") */
  label: string;
  /** Estimated savings for this month (€) */
  monthlySavingsEur: number;
  /** Cumulative savings up to and including this month (€) */
  cumulativeSavingsEur: number;
  /** Cumulative savings discounted back to present value (€) */
  discountedCumulativeSavingsEur: number;
}

/** Savings actually measured for one cached month */
export interface MeasuredMonthSavings {
  /** Month key "YYYY-MM" */
  monthKey: string;
  savingsEur: number;
}

/** Estimated savings for one calendar month, and where the number came from */
export interface CalendarMonthSavings {
  /** Calendar month number, 1–12 */
  month: number;
  savingsEur: number;
  /** True when averaged from real cached months, false when seasonally extrapolated */
  isMeasured: boolean;
}

/** Full ROI analysis result */
export interface RoiAnalysis {
  /** Monthly savings from the analyzed month (€) */
  measuredMonthlySavingsEur: number;
  /** Estimated annual savings — measured months plus seasonal fill for the rest (€) */
  estimatedAnnualSavingsEur: number;
  /** Per-calendar-month savings used to build the projection */
  calendarMonthSavings: CalendarMonthSavings[];
  /** How many of the 12 calendar months are backed by real measurements */
  measuredMonthCount: number;
  /** Months until system cost is recovered in nominal terms */
  paybackMonths: number;
  /** Months until system cost is recovered after discounting future savings */
  discountedPaybackMonths: number;
  /** Annual return on investment (%) */
  annualRoiPercent: number;
  /** Months elapsed since installation */
  monthsElapsed: number;
  /** Estimated cumulative savings since installation (€) */
  estimatedCumulativeSavingsEur: number;
  /** Assumed annual electricity price inflation (%) */
  priceInflationPercent: number;
  /** Assumed annual panel degradation (%) */
  panelDegradationPercent: number;
  /** Discount rate used for the discounted payback (%) */
  discountRatePercent: number;
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
  /** Days of meter data behind these totals — needed to compare months fairly */
  analyzedDays: number;
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

/** System efficiency analysis comparing actual vs theoretical production */
export interface SystemEfficiency {
  /** Overall performance ratio for the month (%) */
  performanceRatioPercent: number;
  /** Total actual production (kWh) */
  actualProductionKwh: number;
  /** Total theoretical max production (kWh) based on kWp and GHI */
  theoreticalProductionKwh: number;
  /** Per-day efficiency data points */
  dailyEfficiency: DailyEfficiency[];
  /** Average daily peak sun hours for the month */
  averagePeakSunHours: number;
  /** Specific yield over the days that had irradiance data (kWh/kWp) */
  specificYieldKwhPerKwp: number;
  /** Specific yield over the whole month, irrespective of irradiance coverage (kWh/kWp) */
  monthlySpecificYieldKwhPerKwp: number;
  /** Days matched with irradiance data — the basis for PR and specific yield */
  coveredDays: number;
  /** Days in the month that have production data */
  productionDays: number;
  /** True when irradiance data did not cover every production day */
  isPartialCoverage: boolean;
  /** Health status based on PR: "excellent" | "good" | "fair" | "poor" */
  healthStatus: "excellent" | "good" | "fair" | "poor";
}

/** Per-day efficiency data point */
export interface DailyEfficiency {
  date: string;
  actualKwh: number;
  theoreticalKwh: number;
  performanceRatioPercent: number;
  peakSunHours: number;
}

/** Tariff model comparison result */
export interface TariffComparison {
  /** Bill under single tariff (JT) with solar */
  singleTariffBill: BillBreakdown;
  /** Bill under dual tariff (VT/NT) with solar */
  dualTariffBill: BillBreakdown;
  /** Bill under single tariff without solar */
  singleTariffBillWithoutSolar: number;
  /** Bill under dual tariff without solar */
  dualTariffBillWithoutSolar: number;
  /** Savings from solar under single tariff */
  singleTariffSolarSavings: number;
  /** Savings from solar under dual tariff */
  dualTariffSolarSavings: number;
  /** Which tariff model is cheaper with solar: "single" or "dual" */
  cheaperWithSolar: "single" | "dual";
  /** How much cheaper the better model is (€) */
  savingsDifference: number;
}

/** Battery simulation configuration */
export interface BatteryConfig {
  /** Battery capacity in kWh */
  capacityKwh: number;
  /** Max charge rate in kW */
  maxChargeRateKw: number;
  /** Max discharge rate in kW */
  maxDischargeRateKw: number;
  /** Round-trip efficiency (0.0–1.0, e.g. 0.9 = 90%) */
  roundTripEfficiency: number;
}

/** Hourly battery state for one time slot */
export interface BatteryHourState {
  hour: number;
  /** Solar generation this hour (kWh) */
  generationKwh: number;
  /** Household consumption this hour (kWh) */
  consumptionKwh: number;
  /** Energy charged into battery (kWh, after efficiency loss) */
  chargedKwh: number;
  /** Energy discharged from battery (kWh, before efficiency loss) */
  dischargedKwh: number;
  /** Grid import this hour (kWh) */
  gridImportKwh: number;
  /** Grid export this hour (kWh) */
  gridExportKwh: number;
  /** State of charge at end of hour (kWh) */
  stateOfChargeKwh: number;
  /** Whether this hour is high tariff */
  isHighTariff: boolean;
}

/** Full battery simulation result for a month */
export interface BatterySimulationResult {
  /** Average hourly profile across all days (24 entries) */
  averageHourlyProfile: BatteryHourState[];
  /** Monthly bill with battery (€) */
  billWithBatteryEur: number;
  /** Monthly bill without battery — current actual (€) */
  billWithoutBatteryEur: number;
  /** Monthly savings from battery (€) */
  monthlySavingsEur: number;
  /**
   * Self-consumption and self-sufficiency are shares of gross panel production,
   * which is only known when FusionSolar data is present. They are null otherwise —
   * grid feed-in alone cannot tell us how much solar the house used directly.
   */
  selfConsumptionWithBatteryPercent: number | null;
  selfConsumptionWithoutBatteryPercent: number | null;
  selfSufficiencyWithBatteryPercent: number | null;
  selfSufficiencyWithoutBatteryPercent: number | null;
  /** Round-trip energy lost in the battery over the month (kWh) */
  totalBatteryLossKwh: number;
  /** Household load — identical with and without a battery (kWh) */
  householdLoadKwh: number;
  /** Total energy stored over the month (kWh) */
  totalEnergyStoredKwh: number;
  /** Total energy discharged over the month (kWh) */
  totalEnergyDischargedKwh: number;
  /** Grid import with battery (kWh) */
  totalGridImportWithBatteryKwh: number;
  /** Grid export with battery (kWh) */
  totalGridExportWithBatteryKwh: number;
  /** Grid import without battery (kWh) — current actual */
  totalGridImportWithoutBatteryKwh: number;
  /** Estimated annual savings (€) */
  estimatedAnnualSavingsEur: number;
  /** Estimated payback in years for a given battery cost */
  paybackYears: number;
}

/** Single month data point for degradation tracking */
export interface DegradationMonthPoint {
  /** Month key "YYYY-MM" */
  monthKey: string;
  /** Total solar production for the month (kWh) */
  productionKwh: number;
  /** Specific yield: production / installed kWp (kWh/kWp) */
  specificYieldKwhPerKwp: number;
  /** Whether FusionSolar data was available */
  hasFusionSolar: boolean;
}

/**
 * One same-calendar-month comparison across two years — the unit of the
 * degradation estimate. Comparing like months needs no seasonal model at all.
 */
export interface YearOverYearComparison {
  /** Calendar month number, 1–12 */
  month: number;
  earlierMonthKey: string;
  laterMonthKey: string;
  earlierYieldKwhPerKwp: number;
  laterYieldKwhPerKwp: number;
  /** Years between the two points (usually 1) */
  yearsApart: number;
  /** Annualized change (% per year, positive = loss) */
  annualChangePercent: number;
}

/** Panel degradation analysis across all cached months */
export interface DegradationAnalysis {
  /** Monthly data points sorted chronologically */
  monthlyPoints: DegradationMonthPoint[];
  /** Same-month year-over-year comparisons backing the estimate */
  comparisons: YearOverYearComparison[];
  /** Estimated annual degradation rate (% per year, positive = loss) */
  annualDegradationRatePercent: number;
  /** Spread of the individual comparisons (± percentage points) */
  uncertaintyPercent: number;
  /** Whether enough same-month pairs exist for a trustworthy estimate */
  isReliable: boolean;
  /** Expected annual degradation for crystalline silicon (~0.5%) */
  expectedDegradationRatePercent: number;
  /** First month in dataset */
  firstMonth: string;
  /** Last month in dataset */
  lastMonth: string;
  /** Total months spanned */
  totalMonths: number;
}

/** Raw HEP API meter reading record */
export interface HEPMeterRecord {
  Datum: string;
  Value: string;
  Status?: string;
}
