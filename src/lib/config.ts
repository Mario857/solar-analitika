import { Config, TariffPrices } from "@/lib/types";

export const DEFAULTS: Config = {
  token: "",
  meter: "0600171220",
  tariffModel: "single",
  fusionSolarCookie: "",
  fusionSolarStation: "NE=193510122",
  fusionSolarSubdomain: "uni004eu5",
  energyPriceSingleTariff: 0.123287,
  energyPriceHighTariff: 0.097189,
  energyPriceLowTariff: 0.047688,
  supplyFee: 0.982,
  distributionSingleTariff: 0.037608,
  distributionHighTariff: 0.042249,
  distributionLowTariff: 0.020727,
  transmissionSingleTariff: 0.014716,
  transmissionHighTariff: 0.016531,
  transmissionLowTariff: 0.008108,
  meteringFee: 1.983,
  solidarityRate: 0.003982,
  solidarityDiscount: true,
  renewableEnergyRate: 0.013239,
  vatRate: 0.13,
  installedKwp: 10.8,
  systemCostEur: 0,
  installationDate: "",
  latitude: 45.815,
  longitude: 15.982,
  tariffHistory: [],
};

const STORAGE_KEY = "solar4";

export function loadConfig(): Config {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Credential keys that must never be persisted */
const SENSITIVE_KEYS = ["hepUsername", "hepPassword", "fusionSolarUsername", "fusionSolarPassword"];

export function saveConfig(config: Config): void {
  const safeConfig = { ...config };
  for (const key of SENSITIVE_KEYS) {
    delete (safeConfig as Record<string, unknown>)[key];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeConfig));
}

export function resetConfig(): Config {
  const config = { ...DEFAULTS };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  return config;
}

/**
 * Resolve the active tariff prices for a given month.
 * Finds the latest TariffPeriod whose validFrom <= month start.
 * Falls back to the default Config prices if no period matches.
 */
export function resolveTariff(config: Config, monthKey: string): TariffPrices {
  /* monthKey is "YYYY-MM" — compare as first day of the month */
  const monthStart = `${monthKey}-01`;

  const applicablePeriods = config.tariffHistory
    .filter((period) => period.validFrom <= monthStart)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));

  if (applicablePeriods.length > 0) {
    const period = applicablePeriods[0];
    return {
      tariffModel: period.tariffModel,
      energyPriceSingleTariff: period.energyPriceSingleTariff,
      energyPriceHighTariff: period.energyPriceHighTariff,
      energyPriceLowTariff: period.energyPriceLowTariff,
      supplyFee: period.supplyFee,
      distributionSingleTariff: period.distributionSingleTariff,
      distributionHighTariff: period.distributionHighTariff,
      distributionLowTariff: period.distributionLowTariff,
      transmissionSingleTariff: period.transmissionSingleTariff,
      transmissionHighTariff: period.transmissionHighTariff,
      transmissionLowTariff: period.transmissionLowTariff,
      meteringFee: period.meteringFee,
      solidarityRate: period.solidarityRate,
      solidarityDiscount: period.solidarityDiscount,
      renewableEnergyRate: period.renewableEnergyRate,
      vatRate: period.vatRate,
    };
  }

  /* No matching period — use default config prices */
  return {
    tariffModel: config.tariffModel,
    energyPriceSingleTariff: config.energyPriceSingleTariff,
    energyPriceHighTariff: config.energyPriceHighTariff,
    energyPriceLowTariff: config.energyPriceLowTariff,
    supplyFee: config.supplyFee,
    distributionSingleTariff: config.distributionSingleTariff,
    distributionHighTariff: config.distributionHighTariff,
    distributionLowTariff: config.distributionLowTariff,
    transmissionSingleTariff: config.transmissionSingleTariff,
    transmissionHighTariff: config.transmissionHighTariff,
    transmissionLowTariff: config.transmissionLowTariff,
    meteringFee: config.meteringFee,
    solidarityRate: config.solidarityRate,
    solidarityDiscount: config.solidarityDiscount,
    renewableEnergyRate: config.renewableEnergyRate,
    vatRate: config.vatRate,
  };
}

export const HEP_API_BASE = "https://mjerenje.hep.hr/mjerenja/v1/api/data/omm";
export const FUSION_SOLAR_API =
  "https://uni004eu5.fusionsolar.huawei.com/rest/pvms/web/station/v3/overview/energy-balance";

export const MONTH_NAMES = [
  "",
  "Sij",
  "Velj",
  "Ožu",
  "Tra",
  "Svi",
  "Lip",
  "Srp",
  "Kol",
  "Ruj",
  "Lis",
  "Stu",
  "Pro",
];
