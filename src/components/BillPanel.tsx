"use client";

import { Config, DailyEnergyData, BillBreakdown } from "@/lib/types";

interface BillPanelProps {
  sortedDays: string[];
  dailyData: Record<string, DailyEnergyData>;
  bill: BillBreakdown;
  billWithoutSolar: number;
  config: Config;
}

const SAVINGS_DISPLAY_THRESHOLD = 1;

const billRow = "flex justify-between py-1.5 font-mono text-xs sm:text-sm";
const billTotalRow = "flex justify-between py-1.5 font-mono text-xs sm:text-sm border-t border-border-accent mt-1.5 pt-2 font-bold";

export default function BillPanel({ sortedDays, dailyData, bill, billWithoutSolar, config }: BillPanelProps) {
  const isSingleTariff = config.tariffModel === "single";
  const savings = billWithoutSolar - bill.total;

  let energyCostBreakdown: React.ReactNode;
  let networkCostBreakdown: React.ReactNode;

  if (isSingleTariff) {
    energyCostBreakdown = (
      <div className={billRow}>
        <span className="text-text-dim">{bill.netBilledKwh.toFixed(0)} kWh × {config.energyPriceSingleTariff}</span>
        <span className="text-text font-medium">{bill.energyCost.toFixed(2)} €</span>
      </div>
    );
    networkCostBreakdown = (
      <>
        <div className={billRow}>
          <span className="text-text-dim">Dist × {config.distributionSingleTariff}</span>
          <span className="text-text font-medium">{(bill.netBilledKwh * config.distributionSingleTariff).toFixed(2)} €</span>
        </div>
        <div className={billRow}>
          <span className="text-text-dim">Prij × {config.transmissionSingleTariff}</span>
          <span className="text-text font-medium">{(bill.netBilledKwh * config.transmissionSingleTariff).toFixed(2)} €</span>
        </div>
      </>
    );
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

    energyCostBreakdown = (
      <>
        <div className={billRow}>
          <span className="text-text-dim">VT {netHighTariff.toFixed(0)} × {config.energyPriceHighTariff}</span>
          <span className="text-text font-medium">{(netHighTariff * config.energyPriceHighTariff).toFixed(2)} €</span>
        </div>
        <div className={billRow}>
          <span className="text-text-dim">NT {netLowTariff.toFixed(0)} × {config.energyPriceLowTariff}</span>
          <span className="text-text font-medium">{(netLowTariff * config.energyPriceLowTariff).toFixed(2)} €</span>
        </div>
      </>
    );
    networkCostBreakdown = (
      <>
        <div className={billRow}>
          <span className="text-text-dim">Dist VT</span>
          <span className="text-text font-medium">{(netHighTariff * config.distributionHighTariff).toFixed(2)} €</span>
        </div>
        <div className={billRow}>
          <span className="text-text-dim">Dist NT</span>
          <span className="text-text font-medium">{(netLowTariff * config.distributionLowTariff).toFixed(2)} €</span>
        </div>
        <div className={billRow}>
          <span className="text-text-dim">Prij VT</span>
          <span className="text-text font-medium">{(netHighTariff * config.transmissionHighTariff).toFixed(2)} €</span>
        </div>
        <div className={billRow}>
          <span className="text-text-dim">Prij NT</span>
          <span className="text-text font-medium">{(netLowTariff * config.transmissionLowTariff).toFixed(2)} €</span>
        </div>
      </>
    );
  }

  const solidarityLabel = bill.solidarityCost > 0 ? "Solidarna" : "Solidarna (popust)";
  const totalSupplyCost = bill.energyCost + bill.solidarityCost + bill.renewableEnergyCost + config.supplyFee;
  const totalNetworkCost = bill.networkCost + config.meteringFee;

  const savingsRow = savings > SAVINGS_DISPLAY_THRESHOLD ? (
    <div className={billRow}>
      <span className="text-text-dim">Ušteda solara</span>
      <span className="text-green font-medium">~{savings.toFixed(2)} €</span>
    </div>
  ) : null;

  return (
    <div className="bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8">
      <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4">Račun — {isSingleTariff ? "Plavi JT" : "Bijeli VT/NT"} — Net billing</h3>

      <div
        className="flex justify-between py-2 font-mono text-xs sm:text-sm mb-3 border border-border-accent p-2 rounded-sm bg-surface-2"
      >
        <span className="text-text-dim">
          Preuz. {bill.totalConsumedKwh.toFixed(0)} − Pred. {bill.totalFeedInKwh.toFixed(0)} ={" "}
          <b>{bill.netBilledKwh.toFixed(0)} kWh</b>
        </span>
        <span className="text-green font-medium">neto</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wide text-text-dim mb-3 pb-2 border-b border-border">Opskrba</h4>
          {energyCostBreakdown}
          <div className={billRow}>
            <span className="text-text-dim">{solidarityLabel}</span>
            <span className="text-text font-medium">{bill.solidarityCost.toFixed(2)} €</span>
          </div>
          <div className={billRow}>
            <span className="text-text-dim">OIE</span>
            <span className="text-text font-medium">{bill.renewableEnergyCost.toFixed(2)} €</span>
          </div>
          <div className={billRow}>
            <span className="text-text-dim">Opskrbna</span>
            <span className="text-text font-medium">{config.supplyFee.toFixed(2)} €</span>
          </div>
          <div className={billTotalRow}>
            <span className="text-text-dim">Σ Opskrba</span>
            <span className="text-amber">{totalSupplyCost.toFixed(2)} €</span>
          </div>
        </div>

        <div>
          <h4 className="font-mono text-xs uppercase tracking-wide text-text-dim mb-3 pb-2 border-b border-border">Mreža</h4>
          {networkCostBreakdown}
          <div className={billRow}>
            <span className="text-text-dim">Mjerna</span>
            <span className="text-text font-medium">{config.meteringFee.toFixed(2)} €</span>
          </div>
          <div className={billTotalRow}>
            <span className="text-text-dim">Σ Mreža</span>
            <span className="text-amber">{totalNetworkCost.toFixed(2)} €</span>
          </div>
        </div>
      </div>

      <div className="mt-4 sm:mt-6 border-t border-border pt-4">
        <div className={billRow}>
          <span className="text-text-dim">Osnovica</span>
          <span className="text-text font-medium">{bill.subtotal.toFixed(2)} €</span>
        </div>
        <div className={billRow}>
          <span className="text-text-dim">PDV {(config.vatRate * 100).toFixed(0)}%</span>
          <span className="text-text font-medium">{bill.vatAmount.toFixed(2)} €</span>
        </div>
        <div className={billTotalRow}>
          <span className="text-text-dim">UKUPNO</span>
          <span className="text-text-bright text-base">{bill.total.toFixed(2)} €</span>
        </div>
        {savingsRow}
      </div>
    </div>
  );
}
