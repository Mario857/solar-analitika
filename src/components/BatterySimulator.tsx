"use client";

import { useState, useMemo } from "react";
import { Bar, Line } from "react-chartjs-2";
import { BatteryConfig, BatterySimulationResult, DerivedMonthlyData, HourlySample, MonthSelection, TariffPrices } from "@/lib/types";
import { simulateBattery, BATTERY_PRESETS } from "@/lib/calculations";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import ShareButton from "@/components/ShareButton";

interface BatterySimulatorProps {
  sortedDays: string[];
  hourlyData: Record<string, Record<number, HourlySample>>;
  derived: DerivedMonthlyData;
  tariff: TariffPrices;
  selectedMonth: MonthSelection;
}

const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
const cardBox = "bg-surface-2 border border-border rounded-sm p-3 sm:p-4 text-center";
const cardLabel = "font-mono text-[0.6rem] text-text-dim uppercase tracking-wider";
const cardValue = "font-mono text-sm sm:text-base font-bold mt-1";

export default function BatterySimulator({ sortedDays, hourlyData, derived, tariff, selectedMonth }: BatterySimulatorProps) {
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(1);
  const [customCapacity, setCustomCapacity] = useState<number | null>(null);

  const batteryConfig: BatteryConfig = useMemo(() => {
    if (customCapacity !== null) {
      return { capacityKwh: customCapacity, maxChargeRateKw: customCapacity / 2, maxDischargeRateKw: customCapacity / 2, roundTripEfficiency: 0.9 };
    }
    return BATTERY_PRESETS[selectedPresetIndex].config;
  }, [customCapacity, selectedPresetIndex]);

  const simulation: BatterySimulationResult = useMemo(
    () => simulateBattery(sortedDays, hourlyData, derived, tariff, batteryConfig, selectedMonth),
    [sortedDays, hourlyData, derived, tariff, batteryConfig, selectedMonth]
  );

  const hourLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

  const profileChartData = {
    labels: hourLabels,
    datasets: [
      {
        label: "Proizvodnja (kWh)",
        data: simulation.averageHourlyProfile.map((h) => h.generationKwh),
        backgroundColor: "#f0a420",
        borderRadius: 2,
        order: 3,
      },
      {
        label: "Potrošnja (kWh)",
        data: simulation.averageHourlyProfile.map((h) => -h.consumptionKwh),
        backgroundColor: "#e05252",
        borderRadius: 2,
        order: 3,
      },
      {
        label: "Punjenje bat. (kWh)",
        data: simulation.averageHourlyProfile.map((h) => h.chargedKwh > 0.001 ? -h.chargedKwh : null),
        backgroundColor: "#3b82f6",
        borderRadius: 2,
        order: 2,
      },
      {
        label: "Pražnjenje bat. (kWh)",
        data: simulation.averageHourlyProfile.map((h) => h.dischargedKwh > 0.001 ? h.dischargedKwh : null),
        backgroundColor: "#22d3ee",
        borderRadius: 2,
        order: 2,
      },
    ],
  };

  const socChartData = {
    labels: hourLabels,
    datasets: [
      {
        label: "Stanje napunjenosti (kWh)",
        data: simulation.averageHourlyProfile.map((h) => h.stateOfChargeKwh),
        backgroundColor: "#3b82f680",
        borderColor: "#3b82f6",
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };

  const socChartOptions = {
    ...CHART_OPTIONS,
    scales: {
      ...CHART_OPTIONS.scales,
      y: {
        ...CHART_OPTIONS.scales?.y,
        min: 0,
        max: batteryConfig.capacityKwh,
        title: { display: true, text: "kWh", color: "#7a8a9e", font: { size: 10 } },
      },
    },
  };

  const selfConGain = simulation.selfConsumptionWithBatteryPercent - simulation.selfConsumptionWithoutBatteryPercent;

  const presetButtons = BATTERY_PRESETS.map((preset, index) => {
    const isActive = customCapacity === null && selectedPresetIndex === index;
    return (
      <button
        key={preset.label}
        onClick={() => { setSelectedPresetIndex(index); setCustomCapacity(null); }}
        className={`font-mono text-xs px-3 py-1.5 rounded-sm border transition-all duration-150 cursor-pointer ${
          isActive
            ? "bg-amber text-background border-amber font-bold"
            : "bg-surface-2 text-text-dim border-border hover:border-border-accent hover:text-text"
        }`}
      >
        {preset.label}
      </button>
    );
  });

  return (
    <div id="share-battery" className={sectionBox}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-text-dim">Simulacija baterije</h3>
        <ShareButton targetId="share-battery" fileName="solar-baterija" />
      </div>

      {/* Battery size selector */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {presetButtons}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            placeholder="Custom kWh"
            className="font-mono text-xs bg-surface-2 border border-border rounded-sm px-2.5 py-1.5 w-28 text-text placeholder:text-text-dim focus:border-amber focus:outline-none"
            value={customCapacity ?? ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setCustomCapacity(val > 0 ? val : null);
            }}
          />
          <span className="font-mono text-[0.6rem] text-text-dim">kWh</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className={cardBox}>
          <div className={cardLabel}>Ušteda / mj.</div>
          <div className={`${cardValue} text-green`}>{simulation.monthlySavingsEur.toFixed(2)} €</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Ušteda / god.</div>
          <div className={`${cardValue} text-green`}>{simulation.estimatedAnnualSavingsEur.toFixed(0)} €</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Povrat inv.</div>
          <div className={`${cardValue} ${simulation.paybackYears < 15 ? "text-amber" : "text-red"}`}>
            {simulation.paybackYears < 99 ? `${simulation.paybackYears.toFixed(1)} god.` : "—"}
          </div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Samopotrošnja</div>
          <div className={`${cardValue} text-cyan`}>
            {simulation.selfConsumptionWithBatteryPercent.toFixed(0)}%
            <span className="text-green text-[0.6rem] ml-1">+{selfConGain.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Bill comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className={cardBox}>
          <div className={cardLabel}>Račun bez bat.</div>
          <div className={`${cardValue} text-text`}>{simulation.billWithoutBatteryEur.toFixed(2)} €</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Račun s bat.</div>
          <div className={`${cardValue} text-green`}>{simulation.billWithBatteryEur.toFixed(2)} €</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Samodostatnost</div>
          <div className={`${cardValue} text-cyan`}>{simulation.selfSufficiencyWithBatteryPercent.toFixed(0)}%</div>
        </div>
      </div>

      {/* Energy flow stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className={cardBox}>
          <div className={cardLabel}>Pohranjeno</div>
          <div className={`${cardValue} text-blue`}>{simulation.totalEnergyStoredKwh.toFixed(1)} kWh</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Ispražnjeno</div>
          <div className={`${cardValue} text-cyan`}>{simulation.totalEnergyDischargedKwh.toFixed(1)} kWh</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Uvoz iz mreže</div>
          <div className={`${cardValue} text-red`}>{simulation.totalGridImportWithBatteryKwh.toFixed(1)} kWh</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Izvoz u mrežu</div>
          <div className={`${cardValue} text-amber`}>{simulation.totalGridExportWithBatteryKwh.toFixed(1)} kWh</div>
        </div>
      </div>

      {/* Hourly profile chart */}
      <div className="mb-5">
        <h4 className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-3">Prosječni dnevni profil s baterijom</h4>
        <div className="h-[250px] sm:h-[300px]">
          <Bar data={profileChartData} options={CHART_OPTIONS} />
        </div>
      </div>

      {/* State of charge chart */}
      <div>
        <h4 className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-3">Prosječno stanje napunjenosti</h4>
        <div className="h-[180px] sm:h-[220px]">
          <Line data={socChartData} options={socChartOptions} />
        </div>
      </div>

      <p className="font-mono text-[0.55rem] text-text-dim mt-4">
        Simulacija koristi pohlepni algoritam: višak solarne energije puni bateriju, deficit prazni bateriju prije uvoza iz mreže.
        Procjena povrata investicije temelji se na ~{(batteryConfig.capacityKwh * 500).toFixed(0)} € za {batteryConfig.capacityKwh} kWh bateriju (500 €/kWh).
        Učinkovitost: {(batteryConfig.roundTripEfficiency * 100).toFixed(0)}% round-trip.
      </p>
    </div>
  );
}
