// Shared Chart.js setup for the dashboard's charts. Chart.js needs raw
// color strings, not CSS custom properties, so these mirror the Ferrari
// palette hex values in style.css directly — keep the two in sync if the
// palette changes.
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

export const CHART_COLORS = {
  rosso: '#e42528',
  giallo: '#f8e823',
  verde: '#039b4e',
  bianco: '#ffffff',
  inkSoft: '#a3a0a8',
  inkFaint: '#6f6c74',
  border: '#2c2a30',
}

const GRID_COLOR = 'rgba(255, 255, 255, 0.06)'

export const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#201f24',
      titleColor: CHART_COLORS.bianco,
      bodyColor: CHART_COLORS.inkSoft,
      borderColor: CHART_COLORS.border,
      borderWidth: 1,
      padding: 10,
    },
  },
  scales: {
    x: {
      grid: { color: GRID_COLOR },
      ticks: { color: CHART_COLORS.inkFaint, font: { family: 'ui-monospace, monospace', size: 10 } },
    },
    y: {
      grid: { color: GRID_COLOR },
      ticks: { color: CHART_COLORS.inkFaint, font: { family: 'ui-monospace, monospace', size: 10 } },
      beginAtZero: true,
    },
  },
}
