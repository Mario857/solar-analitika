"use client";

import { Bar, Line } from "react-chartjs-2";
import { SystemEfficiency } from "@/lib/types";
import { CHART_OPTIONS } from "@/components/ChartSetup";
import ShareButton from "@/components/ShareButton";

interface SystemEfficiencyPanelProps {
  efficiency: SystemEfficiency;
  installedKwp: number;
}

const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
const cardBox = "bg-surface-2 border border-border rounded-sm p-3 sm:p-4 text-center";
const cardLabel = "font-mono text-[0.6rem] text-text-dim uppercase tracking-wider";
const cardValue = "font-mono text-sm sm:text-base font-bold mt-1";

const HEALTH_CONFIG: Record<SystemEfficiency["healthStatus"], { label: string; color: string; description: string }> = {
  excellent: { label: "Odlično", color: "text-green", description: "Sustav radi iznad očekivanja" },
  good: { label: "Dobro", color: "text-cyan", description: "Sustav radi u normalnom rasponu" },
  fair: { label: "Umjereno", color: "text-amber", description: "Mogući gubici — provjerite sjenu, prljavštinu panela ili inverter" },
  poor: { label: "Slabo", color: "text-red", description: "Značajni gubici — preporuča se inspekcija sustava" },
};

export default function SystemEfficiencyPanel({ efficiency, installedKwp }: SystemEfficiencyPanelProps) {
  const health = HEALTH_CONFIG[efficiency.healthStatus];

  const dayLabels = efficiency.dailyEfficiency.map((d) => d.date.slice(8));

  /* Daily Performance Ratio line chart */
  const prChartData = {
    labels: dayLabels,
    datasets: [
      {
        label: "PR (%)",
        data: efficiency.dailyEfficiency.map((d) => d.performanceRatioPercent),
        borderColor: "#f0a420",
        backgroundColor: "#f0a42030",
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointBackgroundColor: "#f0a420",
      },
      {
        label: "Cilj 80%",
        data: efficiency.dailyEfficiency.map(() => 80),
        borderColor: "#22d3ee40",
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  const prChartOptions = {
    ...CHART_OPTIONS,
    scales: {
      ...CHART_OPTIONS.scales,
      y: {
        ...CHART_OPTIONS.scales?.y,
        min: 0,
        max: 120,
        title: { display: true, text: "%", color: "#7a8a9e", font: { size: 10 } },
      },
    },
  };

  /* Actual vs Theoretical bar chart */
  const productionChartData = {
    labels: dayLabels,
    datasets: [
      {
        label: "Stvarna (kWh)",
        data: efficiency.dailyEfficiency.map((d) => d.actualKwh),
        backgroundColor: "#f0a420",
        borderRadius: 2,
      },
      {
        label: "Teoretska (kWh)",
        data: efficiency.dailyEfficiency.map((d) => d.theoreticalKwh),
        backgroundColor: "#3b82f640",
        borderColor: "#3b82f6",
        borderWidth: 1,
        borderRadius: 2,
      },
    ],
  };

  return (
    <div id="share-efficiency" className={sectionBox}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-text-dim">Učinkovitost sustava</h3>
        <ShareButton targetId="share-efficiency" fileName="solar-ucinkovitost" />
      </div>

      {/* Health status banner */}
      <div className="bg-surface-2 border border-border-accent rounded-sm p-3 mb-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="font-mono text-[0.6rem] text-text-dim uppercase tracking-wider">Performance Ratio</span>
            <div className={`font-mono text-xl font-bold mt-0.5 ${health.color}`}>
              {efficiency.performanceRatioPercent.toFixed(1)}%
            </div>
          </div>
          <div className="text-right">
            <span className={`font-mono text-xs font-bold ${health.color}`}>{health.label}</span>
            <div className="font-mono text-[0.55rem] text-text-dim mt-0.5 max-w-[200px]">{health.description}</div>
          </div>
        </div>
        {/* PR gauge bar */}
        <div className="mt-3 h-2 bg-surface-1 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(efficiency.performanceRatioPercent, 100)}%`,
              background: efficiency.performanceRatioPercent >= 85 ? "#00c896" : efficiency.performanceRatioPercent >= 75 ? "#22d3ee" : efficiency.performanceRatioPercent >= 60 ? "#f0a420" : "#e05252",
            }}
          />
        </div>
        <div className="flex justify-between mt-1 font-mono text-[0.5rem] text-text-dim">
          <span>0%</span>
          <span>60% slabo</span>
          <span>75% dobro</span>
          <span>85%+ odlično</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className={cardBox}>
          <div className={cardLabel}>Stvarna prod.</div>
          <div className={`${cardValue} text-amber`}>{efficiency.actualProductionKwh.toFixed(1)} kWh</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Teoretska maks.</div>
          <div className={`${cardValue} text-blue`}>{efficiency.theoreticalProductionKwh.toFixed(1)} kWh</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Spec. prinos</div>
          <div className={`${cardValue} text-cyan`}>{efficiency.specificYieldKwhPerKwp.toFixed(1)} kWh/kWp</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Prosj. sunčani sati</div>
          <div className={`${cardValue} text-amber`}>{efficiency.averagePeakSunHours.toFixed(1)} h/dan</div>
        </div>
      </div>

      {/* System info */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <div className={cardBox}>
          <div className={cardLabel}>Instalirana snaga</div>
          <div className={`${cardValue} text-text`}>{installedKwp} kWp</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Analiziranih dana</div>
          <div className={`${cardValue} text-text`}>{efficiency.dailyEfficiency.length}</div>
        </div>
        <div className={cardBox}>
          <div className={cardLabel}>Gubici</div>
          <div className={`${cardValue} text-red`}>
            {(efficiency.theoreticalProductionKwh - efficiency.actualProductionKwh).toFixed(1)} kWh
          </div>
        </div>
      </div>

      {/* Daily PR chart */}
      <div className="mb-5">
        <h4 className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-3">Dnevni Performance Ratio</h4>
        <div className="h-[220px] sm:h-[260px]">
          <Line data={prChartData} options={prChartOptions} />
        </div>
      </div>

      {/* Actual vs Theoretical chart */}
      <div>
        <h4 className="font-mono text-[0.6rem] uppercase tracking-wider text-text-dim mb-3">Stvarna vs teoretska proizvodnja</h4>
        <div className="h-[220px] sm:h-[260px]">
          <Bar data={productionChartData} options={CHART_OPTIONS} />
        </div>
      </div>

      <p className="font-mono text-[0.55rem] text-text-dim mt-4">
        Performance Ratio (PR) uspoređuje stvarnu proizvodnju s teoretskim maksimumom na temelju instalirane snage ({installedKwp} kWp) i solarne iradijancije (GHI) s Open-Meteo.
        Tipičan zdrav sustav: 75–85%. Gubici uključuju temperaturu, sjenu, prljavštinu, kablove i inverter.
      </p>
    </div>
  );
}
