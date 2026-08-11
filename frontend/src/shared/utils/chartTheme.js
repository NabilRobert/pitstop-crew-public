// Shared Chart.js setup for the dashboard's charts. Chart.js needs raw
// color strings, not CSS custom properties, so the brand-accent entries
// here mirror style.css's --color-rosso/-giallo/-verde by hand, for BOTH
// themes — keep the two in sync if either palette changes.
import { computed } from 'vue'
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
import { theme } from '../composables/theme.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const PALETTES = {
  ferrari: {
    rosso: '#e42528',
    giallo: '#f8e823',
    verde: '#039b4e',
    inkFaint: '#6f6c74',
    gridColor: 'rgba(255, 255, 255, 0.06)',
  },
  // Blueprint is a light theme (white chart canvas), not just a recolor —
  // grid lines and axis ticks need a dark-on-light treatment here, not the
  // Ferrari theme's white-on-dark ones, or they'd render invisible.
  blueprint: {
    rosso: '#0090d1',
    giallo: '#16181c',
    verde: '#8a8d92',
    inkFaint: '#7d818a',
    gridColor: 'rgba(0, 0, 0, 0.08)',
  },
}

/** Reactive — components that read CHART_COLORS.value inside a computed
 * (chartData) automatically re-theme when the user switches themes,
 * without needing a page reload. */
export const CHART_COLORS = computed(() => ({
  ...PALETTES[theme.value],
  bianco: '#ffffff',
}))

/** The tooltip is deliberately dark in both themes — a floating overlay
 * reads fine as "always dark" regardless of the page background, and it's
 * one less thing to keep in sync per-theme. */
const TOOLTIP_BG = '#201f24'
const TOOLTIP_BODY = '#a3a0a8'
const TOOLTIP_BORDER = '#2c2a30'

/** A function, not a shared object — Chart.js mutates the options object
 * it's handed internally (attaches resolved/scriptable state onto
 * `plugins`/`scales` sub-objects), so multiple chart instances spreading
 * off one shared singleton end up with the SAME nested `legend`/`tooltip`/
 * `scales.y` objects by reference and can corrupt each other's rendering
 * (observed live: switching TrendChart's metric tab made a phantom
 * "undefined" legend leak in, because it shared its legend object with
 * every other chart on the page). Call this fresh in every component —
 * each call returns its own independently-owned nested-object tree. */
export function createBaseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: TOOLTIP_BG,
        titleColor: CHART_COLORS.value.bianco,
        bodyColor: TOOLTIP_BODY,
        borderColor: TOOLTIP_BORDER,
        borderWidth: 1,
        padding: 10,
      },
    },
    scales: {
      // Grid/tick colors are scriptable (functions, not static strings) so
      // they re-resolve from the CURRENT theme on every Chart.js redraw —
      // this object is only built once per component (see the comment
      // above), so a static value here would freeze at whatever theme was
      // active on mount instead of following a later theme switch.
      x: {
        grid: { color: () => CHART_COLORS.value.gridColor },
        ticks: { color: () => CHART_COLORS.value.inkFaint, font: { family: 'ui-monospace, monospace', size: 10 } },
      },
      y: {
        grid: { color: () => CHART_COLORS.value.gridColor },
        ticks: { color: () => CHART_COLORS.value.inkFaint, font: { family: 'ui-monospace, monospace', size: 10 } },
        beginAtZero: true,
      },
    },
  }
}
