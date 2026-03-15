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

export default function BillPanel({ sortedDays, dailyData, bill, billWithoutSolar, config }: BillPanelProps) {
  const isSingleTariff = config.tariffModel === "single";
  const savings = billWithoutSolar - bill.total;

  let energyCostBreakdown: React.ReactNode;
  let networkCostBreakdown: React.ReactNode;

  if (isSingleTariff) {
    energyCostBreakdown = (
      <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
        <span className="text-text-dim">{bill.netBilledKwh.toFixed(0)} kWh × {config.energyPriceSingleTariff}</span>
        <span className="text-text font-medium">{bill.energyCost.toFixed(2)} €</span>
      </div>
    );
    networkCostBreakdown = (
      <>
        <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
          <span className="text-text-dim">Dist × {config.distributionSingleTariff}</span>
          <span className="text-text font-medium">{(bill.netBilledKwh * config.distributionSingleTariff).toFixed(2)} €</span>
        </div>
        <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
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
        <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
          <span className="text-text-dim">VT {netHighTariff.toFixed(0)} × {config.energyPriceHighTariff}</span>
          <span className="text-text font-medium">{(netHighTariff * config.energyPriceHighTariff).toFixed(2)} €</span>
        </div>
        <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
          <span className="text-text-dim">NT {netLowTariff.toFixed(0)} × {config.energyPriceLowTariff}</span>
          <span className="text-text font-medium">{(netLowTariff * config.energyPriceLowTariff).toFixed(2)} €</span>
        </div>
      </>
    );
    networkCostBreakdown = (
      <>
        <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
          <span className="text-text-dim">Dist VT</span>
          <span className="text-text font-medium">{(netHighTariff * config.distributionHighTariff).toFixed(2)} €</span>
        </div>
        <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
          <span className="text-text-dim">Dist NT</span>
          <span className="text-text font-medium">{(netLowTariff * config.distributionLowTariff).toFixed(2)} €</span>
        </div>
        <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
          <span className="text-text-dim">Prij VT</span>
          <span className="text-text font-medium">{(netHighTariff * config.transmissionHighTariff).toFixed(2)} €</span>
        </div>
        <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
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
    <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
      <span className="text-text-dim">Ušteda solara</span>
      <span className="text-green font-medium">~{savings.toFixed(2)} €</span>
    </div>
  ) : null;

  return (
    <div className="bg-surface-1 border border-border rounded-default p-8 mb-8">
      <h3 className="font-mono text-[0.8rem] font-semibold uppercase tracking-[1.5px] text-text-dim mb-5">Račun — {isSingleTariff ? "Plavi JT" : "Bijeli VT/NT"} — Net billing</h3>

      <div
        className="flex justify-between py-2.5 font-mono text-[0.85rem] mb-3 border border-border-accent p-2 rounded-sm bg-surface-2"
      >
        <span className="text-text-dim">
          Preuz. {bill.totalConsumedKwh.toFixed(0)} − Pred. {bill.totalFeedInKwh.toFixed(0)} ={" "}
          <b>{bill.netBilledKwh.toFixed(0)} kWh</b>
        </span>
        <span className="text-green font-medium">neto</span>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <h4 className="font-mono text-[0.75rem] uppercase tracking-[1px] text-text-dim mb-4 pb-2 border-b border-border">Opskrba</h4>
          {energyCostBreakdown}
          <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
            <span className="text-text-dim">{solidarityLabel}</span>
            <span className="text-text font-medium">{bill.solidarityCost.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
            <span className="text-text-dim">OIE</span>
            <span className="text-text font-medium">{bill.renewableEnergyCost.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
            <span className="text-text-dim">Opskrbna</span>
            <span className="text-text font-medium">{config.supplyFee.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0 border-t-2 border-t-border-accent pt-1.5 mt-[3px] font-bold">
            <span className="text-text-dim">Σ Opskrba</span>
            <span className="text-amber text-[0.85rem]">{totalSupplyCost.toFixed(2)} €</span>
          </div>
        </div>

        <div>
          <h4 className="font-mono text-[0.75rem] uppercase tracking-[1px] text-text-dim mb-4 pb-2 border-b border-border">Mreža</h4>
          {networkCostBreakdown}
          <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
            <span className="text-text-dim">Mjerna</span>
            <span className="text-text font-medium">{config.meteringFee.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0 border-t-2 border-t-border-accent pt-1.5 mt-[3px] font-bold">
            <span className="text-text-dim">Σ Mreža</span>
            <span className="text-amber text-[0.85rem]">{totalNetworkCost.toFixed(2)} €</span>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
          <span className="text-text-dim">Osnovica</span>
          <span className="text-text font-medium">{bill.subtotal.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0">
          <span className="text-text-dim">PDV {(config.vatRate * 100).toFixed(0)}%</span>
          <span className="text-text font-medium">{bill.vatAmount.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between py-2.5 font-mono text-[0.85rem] border-b border-border last:border-b-0 border-t-2 border-t-border-accent pt-1.5 mt-[3px] font-bold">
          <span className="text-text-dim">UKUPNO</span>
          <span className="text-text-bright text-[1rem]">{bill.total.toFixed(2)} €</span>
        </div>
        {savingsRow}
      </div>
    </div>
  );
}
