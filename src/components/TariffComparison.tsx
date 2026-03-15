"use client";

import { Bar } from "react-chartjs-2";
import { TariffComparison as TariffComparisonResult, TariffPrices } from "@/lib/types";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import ShareButton from "@/components/ShareButton";

interface TariffComparisonProps {
  comparison: TariffComparisonResult;
  activeTariffModel: TariffPrices["tariffModel"];
}

const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
const cardBox = "bg-surface-2 border border-border rounded-sm p-3 sm:p-4";
const cardLabel = "font-mono text-[0.6rem] text-text-dim uppercase tracking-wider";
const cardValue = "font-mono text-sm sm:text-base font-bold mt-1";
const rowClasses = "flex justify-between py-1.5 font-mono text-xs sm:text-sm";

export default function TariffComparison({ comparison, activeTariffModel }: TariffComparisonProps) {
  const { singleTariffBill, dualTariffBill, cheaperWithSolar, savingsDifference } = comparison;

  const winnerLabel = cheaperWithSolar === "single" ? "Plavi (JT)" : "Bijeli (VT/NT)";
  const activeLabel = activeTariffModel === "single" ? "Plavi (JT)" : "Bijeli (VT/NT)";
  const isCurrentCheaper = cheaperWithSolar === activeTariffModel;

  /* Bar chart: side-by-side comparison */
  const chartData = {
    labels: ["Energija", "Mreža", "Solidarna", "OIE", "Fiksno", "PDV", "UKUPNO"],
    datasets: [
      {
        label: "Plavi JT",
        data: [
          singleTariffBill.energyCost,
          singleTariffBill.networkCost,
          singleTariffBill.solidarityCost,
          singleTariffBill.renewableEnergyCost,
          singleTariffBill.fixedCosts,
          singleTariffBill.vatAmount,
          singleTariffBill.total,
        ],
        backgroundColor: "#3b82f6",
        borderRadius: 2,
      },
      {
        label: "Bijeli VT/NT",
        data: [
          dualTariffBill.energyCost,
          dualTariffBill.networkCost,
          dualTariffBill.solidarityCost,
          dualTariffBill.renewableEnergyCost,
          dualTariffBill.fixedCosts,
          dualTariffBill.vatAmount,
          dualTariffBill.total,
        ],
        backgroundColor: "#f0a420",
        borderRadius: 2,
      },
    ],
  };

  const recommendationContent = isCurrentCheaper ? (
    <p className="font-mono text-xs text-green">
      Trenutno koristite povoljniji model ({activeLabel}).
    </p>
  ) : (
    <p className="font-mono text-xs text-amber">
      Prebacivanje na {winnerLabel} uštedilo bi vam {savingsDifference.toFixed(2)} €/mj.
    </p>
  );

  return (
    <div id="share-tariff-compare" className={sectionBox}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-text-dim">Usporedba tarifa — JT vs VT/NT</h3>
        <ShareButton targetId="share-tariff-compare" fileName="solar-usporedba-tarifa" />
      </div>

      {/* Winner banner */}
      <div className="bg-surface-2 border border-border-accent rounded-sm p-3 mb-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="font-mono text-[0.6rem] text-text-dim uppercase tracking-wider">Povoljniji model sa solarom</span>
            <div className="font-mono text-sm font-bold text-amber mt-0.5">{winnerLabel}</div>
          </div>
          <div className="text-right">
            <span className="font-mono text-[0.6rem] text-text-dim uppercase tracking-wider">Razlika</span>
            <div className="font-mono text-sm font-bold text-green mt-0.5">{savingsDifference.toFixed(2)} €/mj.</div>
          </div>
        </div>
        <div className="mt-2">{recommendationContent}</div>
      </div>

      {/* Side-by-side bill totals */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className={`${cardBox} ${cheaperWithSolar === "single" ? "border-green!" : ""}`}>
          <div className={cardLabel}>Plavi (JT) — sa solarom</div>
          <div className={`${cardValue} ${cheaperWithSolar === "single" ? "text-green" : "text-text"}`}>
            {singleTariffBill.total.toFixed(2)} €
          </div>
          <div className="font-mono text-[0.55rem] text-text-dim mt-1">
            Neto: {singleTariffBill.netBilledKwh.toFixed(0)} kWh
          </div>
        </div>
        <div className={`${cardBox} ${cheaperWithSolar === "dual" ? "border-green!" : ""}`}>
          <div className={cardLabel}>Bijeli (VT/NT) — sa solarom</div>
          <div className={`${cardValue} ${cheaperWithSolar === "dual" ? "text-green" : "text-text"}`}>
            {dualTariffBill.total.toFixed(2)} €
          </div>
          <div className="font-mono text-[0.55rem] text-text-dim mt-1">
            Neto VT+NT: {dualTariffBill.netBilledKwh.toFixed(0)} kWh
          </div>
        </div>
      </div>

      {/* Without solar comparison */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className={cardBox}>
          <div className={cardLabel}>Plavi (JT) — bez solara</div>
          <div className={`${cardValue} text-text-dim`}>{comparison.singleTariffBillWithoutSolar.toFixed(2)} €</div>
          <div className="font-mono text-[0.55rem] text-green mt-1">
            Ušteda solara: {comparison.singleTariffSolarSavings.toFixed(2)} €
          </div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Bijeli (VT/NT) — bez solara</div>
          <div className={`${cardValue} text-text-dim`}>{comparison.dualTariffBillWithoutSolar.toFixed(2)} €</div>
          <div className="font-mono text-[0.55rem] text-green mt-1">
            Ušteda solara: {comparison.dualTariffSolarSavings.toFixed(2)} €
          </div>
        </div>
      </div>

      {/* Detailed breakdown comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mb-5">
        <div>
          <h4 className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-2 pb-1.5 border-b border-border">Plavi JT — stavke</h4>
          <div className={rowClasses}>
            <span className="text-text-dim">Energija</span>
            <span className="text-text font-medium">{singleTariffBill.energyCost.toFixed(2)} €</span>
          </div>
          <div className={rowClasses}>
            <span className="text-text-dim">Mreža</span>
            <span className="text-text font-medium">{singleTariffBill.networkCost.toFixed(2)} €</span>
          </div>
          <div className={rowClasses}>
            <span className="text-text-dim">Solidarna + OIE</span>
            <span className="text-text font-medium">{(singleTariffBill.solidarityCost + singleTariffBill.renewableEnergyCost).toFixed(2)} €</span>
          </div>
          <div className={rowClasses}>
            <span className="text-text-dim">Fiksno</span>
            <span className="text-text font-medium">{singleTariffBill.fixedCosts.toFixed(2)} €</span>
          </div>
          <div className={`${rowClasses} border-t border-border-accent mt-1 pt-2 font-bold`}>
            <span className="text-text-dim">Ukupno s PDV</span>
            <span className="text-amber">{singleTariffBill.total.toFixed(2)} €</span>
          </div>
        </div>
        <div>
          <h4 className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-2 pb-1.5 border-b border-border">Bijeli VT/NT — stavke</h4>
          <div className={rowClasses}>
            <span className="text-text-dim">Energija</span>
            <span className="text-text font-medium">{dualTariffBill.energyCost.toFixed(2)} €</span>
          </div>
          <div className={rowClasses}>
            <span className="text-text-dim">Mreža</span>
            <span className="text-text font-medium">{dualTariffBill.networkCost.toFixed(2)} €</span>
          </div>
          <div className={rowClasses}>
            <span className="text-text-dim">Solidarna + OIE</span>
            <span className="text-text font-medium">{(dualTariffBill.solidarityCost + dualTariffBill.renewableEnergyCost).toFixed(2)} €</span>
          </div>
          <div className={rowClasses}>
            <span className="text-text-dim">Fiksno</span>
            <span className="text-text font-medium">{dualTariffBill.fixedCosts.toFixed(2)} €</span>
          </div>
          <div className={`${rowClasses} border-t border-border-accent mt-1 pt-2 font-bold`}>
            <span className="text-text-dim">Ukupno s PDV</span>
            <span className="text-amber">{dualTariffBill.total.toFixed(2)} €</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div>
        <h4 className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-3">Usporedba stavki računa</h4>
        <div className="h-[250px] sm:h-[300px]">
          <Bar data={chartData} options={CHART_OPTIONS} />
        </div>
      </div>

      <p className="font-mono text-[0.55rem] text-text-dim mt-4">
        Usporedba koristi iste cijene za oba modela iz vaših postavki. Promijenite cijene u Postavkama za točniju usporedbu.
        Trenutni model: {activeLabel}.
      </p>
    </div>
  );
}
