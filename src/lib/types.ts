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

/** User configuration for API credentials and tariff settings */
export interface Config {
  token: string;
  meter: string;
  tariffModel: "single" | "dual";
  fusionSolarCookie: string;
  fusionSolarStation: string;
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

/** Raw HEP API meter reading record */
export interface HEPMeterRecord {
  Datum: string;
  Value: string;
  Status?: string;
}
