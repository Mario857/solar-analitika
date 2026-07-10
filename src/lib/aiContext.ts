import {
  BillBreakdown,
  Config,
  DerivedMonthlyData,
  LoadShiftAnalysis,
  MonthSummary,
  TariffPrices,
} from "@/lib/types";

/** Everything the assistant needs to answer questions about the user's solar data */
export interface AiContextData {
  config: Config;
  /** Selected month key "YYYY-MM" */
  monthKey: string;
  derived: DerivedMonthlyData | null;
  bill: BillBreakdown | null;
  billWithoutSolar: number | null;
  tariff: TariffPrices;
  loadShift: LoadShiftAnalysis | null;
  /** Summaries of all months available in the local cache */
  monthSummaries: MonthSummary[];
  hasFusionSolar: boolean;
  hasConsumption: boolean;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildTariffSection(tariff: TariffPrices): string {
  const isSingleTariff = tariff.tariffModel === "single";
  const energyPrices = isSingleTariff
    ? `energy price (JT): ${tariff.energyPriceSingleTariff} EUR/kWh; distribution: ${tariff.distributionSingleTariff} EUR/kWh; transmission: ${tariff.transmissionSingleTariff} EUR/kWh`
    : `energy price VT: ${tariff.energyPriceHighTariff} EUR/kWh, NT: ${tariff.energyPriceLowTariff} EUR/kWh; distribution VT: ${tariff.distributionHighTariff}, NT: ${tariff.distributionLowTariff} EUR/kWh; transmission VT: ${tariff.transmissionHighTariff}, NT: ${tariff.transmissionLowTariff} EUR/kWh`;

  return [
    `Tariff model: ${isSingleTariff ? "single (jednotarifni, JT)" : "dual (dvotarifni, VT/NT)"}`,
    energyPrices,
    `supply fee: ${tariff.supplyFee} EUR/month; metering fee: ${tariff.meteringFee} EUR/month`,
    `solidarity surcharge: ${tariff.solidarityRate} EUR/kWh (discount active: ${tariff.solidarityDiscount}); OIE renewable surcharge: ${tariff.renewableEnergyRate} EUR/kWh; VAT: ${tariff.vatRate * 100}%`,
  ].join("\n");
}

function buildDailyTableSection(derived: DerivedMonthlyData): string {
  const header = "date,feedInKwh,consumedFromGridKwh,solarProductionKwh,selfConsumedKwh";
  const rows = derived.days.map((day) =>
    [
      day.date,
      round(day.feedIn),
      round(day.consumed),
      round(day.solarProduction),
      round(day.selfConsumed),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

function buildMonthTotalsSection(derived: DerivedMonthlyData): string {
  return [
    `total feed-in to grid: ${round(derived.totalFeedIn)} kWh`,
    `total consumed from grid: ${round(derived.totalConsumed)} kWh`,
    `total solar production: ${round(derived.totalSolarProduction)} kWh`,
    `total self-consumed solar: ${round(derived.totalSelfConsumed)} kWh`,
    `total household consumption (grid + self-consumed): ${round(derived.totalHousehold)} kWh`,
    `self-consumption rate: ${round(derived.selfConsumptionRate, 1)} %`,
    `self-sufficiency: ${round(derived.selfSufficiency, 1)} %`,
  ].join("\n");
}

function buildBillSection(bill: BillBreakdown, billWithoutSolar: number | null): string {
  const lines = [
    `energy cost: ${round(bill.energyCost)} EUR`,
    `network cost (distribution + transmission): ${round(bill.networkCost)} EUR`,
    `solidarity surcharge: ${round(bill.solidarityCost)} EUR`,
    `OIE renewable surcharge: ${round(bill.renewableEnergyCost)} EUR`,
    `fixed costs (supply + metering): ${round(bill.fixedCosts)} EUR`,
    `subtotal: ${round(bill.subtotal)} EUR; VAT: ${round(bill.vatAmount)} EUR; invoice total: ${round(bill.total)} EUR`,
    `net billed energy after feed-in offset: ${round(bill.netBilledKwh)} kWh (consumed ${round(bill.totalConsumedKwh)} kWh, feed-in ${round(bill.totalFeedInKwh)} kWh)`,
    `surplus sold to HEP (otkup): ${round(bill.surplusKwh)} kWh = ${round(bill.surplusCreditEur)} EUR credit`,
    `effective monthly cost (invoice minus surplus credit): ${round(bill.effectiveCostEur)} EUR`,
  ];
  if (billWithoutSolar !== null) {
    lines.push(`estimated bill WITHOUT solar: ${round(billWithoutSolar)} EUR`);
    lines.push(`estimated savings from solar this month: ${round(billWithoutSolar - bill.effectiveCostEur)} EUR`);
  }
  return lines.join("\n");
}

function buildLoadShiftSection(loadShift: LoadShiftAnalysis): string {
  const header = "hour,avgGenerationKw,avgConsumptionKw,shiftableConsumptionKw,excessGenerationKw";
  const rows = loadShift.hourlyProfiles.map((profile) =>
    [
      profile.hour,
      round(profile.averageGenerationKw, 3),
      round(profile.averageConsumptionKw, 3),
      round(profile.shiftableConsumptionKw, 3),
      round(profile.excessGenerationKw, 3),
    ].join(",")
  );
  return [
    `avg grid consumption during solar hours: ${round(loadShift.gridConsumptionDuringSolarKwh)} kWh/day`,
    `avg excess solar exported: ${round(loadShift.excessSolarExportKwh)} kWh/day`,
    `estimated shiftable consumption: ${round(loadShift.shiftableDailyKwh)} kWh/day`,
    `best hours to run heavy appliances: ${loadShift.bestHoursForLoad.join(", ")}`,
    "Average hourly profile (CSV):",
    header,
    ...rows,
  ].join("\n");
}

function buildMonthSummariesSection(summaries: MonthSummary[]): string {
  const header =
    "month,feedInKwh,consumedKwh,productionKwh,selfConsumedKwh,householdKwh,selfConsumptionPct,selfSufficiencyPct,billEur,billWithoutSolarEur,savingsEur";
  const rows = summaries.map((summary) =>
    [
      summary.monthKey,
      round(summary.totalFeedInKwh),
      round(summary.totalConsumedKwh),
      round(summary.totalSolarProductionKwh),
      round(summary.totalSelfConsumedKwh),
      round(summary.totalHouseholdKwh),
      round(summary.selfConsumptionRatePercent, 1),
      round(summary.selfSufficiencyPercent, 1),
      round(summary.billTotalEur),
      round(summary.billWithoutSolarEur),
      round(summary.savingsEur),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

/**
 * Build the system prompt that gives the model the user's full solar dataset.
 * Data is serialized as compact CSV blocks to keep token usage low.
 */
export function buildAiSystemPrompt(context: AiContextData): string {
  const sections: string[] = [
    `You are an expert assistant for a Croatian household solar PV system analytics dashboard ("Solar Analitika").
The household is on the Croatian net-billing model with HEP (Hrvatska elektroprivreda): monthly feed-in offsets consumption kWh-for-kWh on the energy component; surplus feed-in beyond consumption is purchased by HEP at the energy tariff (otkup) without VAT.
Data sources: HEP smart meter readings (feed-in and grid consumption) and Huawei FusionSolar (solar production).
Key terms: VT = high tariff, NT = low tariff, JT = single tariff, OIE = renewable energy surcharge, PDV = VAT.

Rules for answering:
- Answer in the same language the user writes in (default to Croatian).
- You may perform any calculations the user asks for using the data below. Show the key steps of a calculation briefly, then the result.
- Round money to 2 decimals (EUR) and energy to 1-2 decimals (kWh).
- If the question needs data that is not present below (e.g. a month that is not cached, or per-15-minute readings), say so explicitly instead of guessing.
- Use plain text only: no markdown headers or tables. Use simple lists and short paragraphs.`,
  ];

  sections.push(`## System configuration
installed capacity: ${context.config.installedKwp} kWp
system cost: ${context.config.systemCostEur} EUR
installation date: ${context.config.installationDate || "not set"}
location: lat ${context.config.latitude}, lon ${context.config.longitude}
today's date: ${new Date().toISOString().slice(0, 10)}`);

  sections.push(`## Active tariff prices for ${context.monthKey} (all prices without VAT)
${buildTariffSection(context.tariff)}`);

  const hasSelectedMonthData = context.derived !== null;
  if (hasSelectedMonthData && context.derived) {
    const productionNote = context.hasFusionSolar
      ? ""
      : "\nNote: FusionSolar production data is NOT available for this month — solarProduction and selfConsumed are 0/unknown.";
    const consumptionNote = context.hasConsumption
      ? ""
      : "\nNote: grid consumption data is NOT available for this month.";
    sections.push(`## Selected month ${context.monthKey} — totals${productionNote}${consumptionNote}
${buildMonthTotalsSection(context.derived)}`);
    sections.push(`## Selected month ${context.monthKey} — daily data (CSV)
${buildDailyTableSection(context.derived)}`);
  } else {
    sections.push(`## Selected month ${context.monthKey}
No data loaded for the selected month. Tell the user to run the analysis ("Analiziraj") on the Dashboard tab first if they ask about it.`);
  }

  if (context.bill) {
    sections.push(`## Calculated bill for ${context.monthKey}
${buildBillSection(context.bill, context.billWithoutSolar)}`);
  }

  if (context.loadShift) {
    sections.push(`## Load shifting analysis for ${context.monthKey}
${buildLoadShiftSection(context.loadShift)}`);
  }

  if (context.monthSummaries.length > 0) {
    sections.push(`## All cached months — summaries (CSV)
${buildMonthSummariesSection(context.monthSummaries)}`);
  }

  return sections.join("\n\n");
}
