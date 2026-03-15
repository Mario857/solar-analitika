import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Legend,
  Tooltip,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Legend,
  Tooltip
);

export const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      labels: {
        color: "#516274",
        font: { family: "'IBM Plex Mono'", size: 10 },
      },
    },
  },
  scales: {
    x: {
      ticks: { color: "#516274", font: { family: "'IBM Plex Mono'", size: 9 } },
      grid: { color: "#1c2a3c40" },
    },
    y: {
      ticks: { color: "#516274", font: { family: "'IBM Plex Mono'", size: 9 } },
      grid: { color: "#1c2a3c40" },
    },
  },
};
