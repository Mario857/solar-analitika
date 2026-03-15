import { Config } from "@/lib/types";

export const DEFAULTS: Config = {
  token: "",
  meter: "0600171220",
  tariffModel: "single",
  fusionSolarCookie: "",
  fusionSolarStation: "NE=193510122",
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

export function saveConfig(config: Config): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetConfig(): Config {
  const config = { ...DEFAULTS };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  return config;
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
