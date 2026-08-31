// Shared Chart.js setup for the dashboard's charts. Chart.js needs raw
// color strings, not CSS custom properties, so the brand-accent entries
// here mirror style.css's --color-rosso/-giallo/-verde by hand, for BOTH
// themes — keep the two in sync if either palette changes.
import { computed, type ComputedRef } from 'vue'
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
  type ChartOptions,
} from 'chart.js'
import { theme, type ThemeName } from '../composables/theme.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

interface Palette {
  rosso: string
  giallo: string
  verde: string
  inkFaint: string
  gridColor: string
  // v2 Stage 4 — genuinely distinct from rosso/giallo/verde above: those
  // are Ferrari-brand accent colors (only green/yellow/red in the Ferrari
  // theme itself; Blueprint reassigns them to gray/near-black/blue for
  // its own light aesthetic). flagGood/Caution/Critical mirror
  // style.css's --color-flag-* tokens instead — the app's actual
  // semantic good/caution/critical colors, which stay green/amber/red in
  // BOTH themes (just different shades for Blueprint's light background;
  // see KeywordTable.vue's qsColorClass for the same semantic system via
  // CSS classes). Needed for the impression-share stacked bar, where the
  // 3 segments must mean "good/caution/critical" regardless of theme.
  flagGood: string
  flagCaution: string
  flagCritical: string
}

const PALETTES: Record<ThemeName, Palette> = {
  ferrari: {
    rosso: '#e42528',
    giallo: '#f8e823',
    verde: '#039b4e',
    inkFaint: '#6f6c74',
    gridColor: 'rgba(255, 255, 255, 0.06)',
    flagGood: '#039b4e',
    flagCaution: '#f8e823',
    flagCritical: '#e42528',
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
    flagGood: '#067a3f',
    flagCaution: '#9a6300',
    flagCritical: '#c81e21',
  },
}

/** Reactive — components that read CHART_COLORS.value inside a computed
 * (chartData) automatically re-theme when the user switches themes,
 * without needing a page reload. */
export const CHART_COLORS: ComputedRef<Palette & { bianco: string }> = computed(() => ({
  ...PALETTES[theme.value],
  bianco: '#ffffff',
}))

/** The tooltip is deliberately dark in both themes — a floating overlay
 * reads fine as "always dark" regardless of the page background, and it's
 * one less thing to keep in sync per-theme. */
const TOOLTIP_BG = '#201f24'
const TOOLTIP_BODY = '#a3a0a8'
const TOOLTIP_BORDER = '#2c2a30'

// A hand-picked subset of Chart.js's options that this app's chart
// components actually use — not Chart.js's real (deeply generic, per-chart-
// type) ChartOptions type. Each chart component further mutates its own
// copy after creation (adding indexAxis, tooltip.callbacks, ticks.callback,
// etc.), which is why every field below is optional.
export interface BaseChartOptions {
  responsive: boolean
  maintainAspectRatio: boolean
  indexAxis?: 'x' | 'y'
  plugins: {
    legend: { display: boolean }
    tooltip: {
      backgroundColor: string
      titleColor: string
      bodyColor: string
      borderColor: string
      borderWidth: number
      padding: number
      callbacks?: { label: (context: { parsed: { y: number } }) => string }
    }
  }
  scales: {
    x: {
      grid: { color: () => string }
      ticks: { color: () => string; font: { family: string; size: number } }
    }
    y: {
      grid: { color: () => string }
      ticks: {
        color: () => string
        font: { family: string; size: number }
        callback?: (value: number) => string
      }
      beginAtZero?: boolean
    }
  }
}

/** A function, not a shared object — Chart.js mutates the options object
 * it's handed internally (attaches resolved/scriptable state onto
 * `plugins`/`scales` sub-objects), so multiple chart instances spreading
 * off one shared singleton end up with the SAME nested `legend`/`tooltip`/
 * `scales.y` objects by reference and can corrupt each other's rendering
 * (observed live: switching TrendChart's metric tab made a phantom
 * "undefined" legend leak in, because it shared its legend object with
 * every other chart on the page). Call this fresh in every component —
 * each call returns its own independently-owned nested-object tree.
 *
 * Typed as ChartOptions<any> rather than a specific chart type — this one
 * function backs Line and Bar charts alike (see BaseChartOptions above for
 * the actual shape), and Chart.js's real per-type option types are deeply
 * generic enough that modeling them exactly here isn't worth it for what's
 * ultimately presentation config, not business logic. */
export function createBaseChartOptions(): ChartOptions<any> {
  const options: BaseChartOptions = {
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
  return options as ChartOptions<any>
}
