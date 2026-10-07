<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  EMPTY_FILTERS, daysBand, facetCounts, isFiltered, makesOf, marginBand, priceBand,
  type InvFilters, type InvRow,
} from './inventoryModel'
import SearchBox from './SearchBox.vue'

// The inventory filter bar, built like the board's: a search box plus one chip group per column, each chip
// showing how many models it would leave. Everything is local to the loaded rows; nothing is sent anywhere.
const props = defineProps<{ rows: InvRow[]; shown: number }>()
const filters = defineModel<InvFilters>({ required: true })
const { t } = useI18n()

const STOCK = ['in', 'out', 'out_advertised'] as const
const DAYS = ['0-30', '31-60', '61-90', '90+', 'unknown'] as const
const PRICE = ['under150', '150-250', '250-400', 'over400', 'unknown'] as const
const MARGIN = ['under10', '10-15', 'over15', 'unknown'] as const
const ADS = ['yes', 'no'] as const

const makes = computed(() => makesOf(props.rows))
const counts = computed(() => ({
  make: facetCounts(props.rows, filters.value, 'make', makes.value, (r) => r.make),
  stock: facetCounts(props.rows, filters.value, 'stock', STOCK, (r) => (r.available > 0 ? 'in' : r.linked_keyword_count > 0 ? 'out_advertised' : 'out')),
  days: facetCounts(props.rows, filters.value, 'days', DAYS, (r) => daysBand(r.avg_days_listed)),
  price: facetCounts(props.rows, filters.value, 'price', PRICE, (r) => priceBand(r.avg_price_idr)),
  margin: facetCounts(props.rows, filters.value, 'margin', MARGIN, (r) => marginBand(r.avg_margin_idr)),
  ads: facetCounts(props.rows, filters.value, 'ads', ADS, (r) => (r.linked_keyword_count > 0 ? 'yes' : 'no')),
}))
// "No stock" counts out-of-stock models INCLUDING the advertised ones, so it is derived, not a facet value of its own.
const outTotal = computed(() => counts.value.stock.out + counts.value.stock.out_advertised)

function set<K extends keyof InvFilters>(key: K, value: InvFilters[K]) {
  filters.value = { ...filters.value, [key]: value }
}
function toggle<K extends 'stock' | 'days' | 'price' | 'margin' | 'ads'>(key: K, value: InvFilters[K]) {
  set(key, (filters.value[key] === value ? 'all' : value) as InvFilters[K])
}
const query = computed({ get: () => filters.value.query, set: (v: string) => set('query', v) })
const active = computed(() => isFiltered(filters.value))

const chip = (on: boolean) => (on ? 'border-rosso bg-rosso text-bianco' : 'border-border text-ink-soft hover:text-ink')
</script>

<template>
  <div class="mb-3 space-y-3">
    <SearchBox
      v-model="query"
      :label="t('keywordOptimizer.inventory.search.label')"
      :placeholder="t('keywordOptimizer.inventory.search.placeholder')"
      :clear-label="t('keywordOptimizer.board.search.clear')"
    />

    <div class="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
      <fieldset>
        <legend class="mb-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.filters.make') }}</legend>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="m in makes" :key="m" type="button" class="rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase" :class="chip(filters.make === m)" :aria-pressed="filters.make === m" @click="set('make', filters.make === m ? null : m)">
            {{ m }} ({{ counts.make[m] }})
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.columns.available') }}</legend>
        <div class="flex flex-wrap gap-1.5">
          <button type="button" class="rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase" :class="chip(filters.stock === 'in')" :aria-pressed="filters.stock === 'in'" @click="toggle('stock', 'in')">{{ t('keywordOptimizer.inventory.filters.stock.in') }} ({{ counts.stock.in }})</button>
          <button type="button" class="rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase" :class="chip(filters.stock === 'out')" :aria-pressed="filters.stock === 'out'" @click="toggle('stock', 'out')">{{ t('keywordOptimizer.inventory.filters.stock.out') }} ({{ outTotal }})</button>
          <button type="button" class="rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase" :class="chip(filters.stock === 'out_advertised')" :aria-pressed="filters.stock === 'out_advertised'" @click="toggle('stock', 'out_advertised')">{{ t('keywordOptimizer.inventory.filters.stock.out_advertised') }} ({{ counts.stock.out_advertised }})</button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.columns.daysListed') }}</legend>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="d in DAYS" :key="d" type="button" class="rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase" :class="chip(filters.days === d)" :aria-pressed="filters.days === d" @click="toggle('days', d)">
            {{ t(`keywordOptimizer.inventory.filters.days.${d}`) }} ({{ counts.days[d] }})
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.columns.price') }}</legend>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="p in PRICE" :key="p" type="button" class="rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase" :class="chip(filters.price === p)" :aria-pressed="filters.price === p" @click="toggle('price', p)">
            {{ t(`keywordOptimizer.inventory.filters.price.${p}`) }} ({{ counts.price[p] }})
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.columns.margin') }}</legend>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="g in MARGIN" :key="g" type="button" class="rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase" :class="chip(filters.margin === g)" :aria-pressed="filters.margin === g" @click="toggle('margin', g)">
            {{ t(`keywordOptimizer.inventory.filters.margin.${g}`) }} ({{ counts.margin[g] }})
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.columns.keywords') }}</legend>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="a in ADS" :key="a" type="button" class="rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase" :class="chip(filters.ads === a)" :aria-pressed="filters.ads === a" @click="toggle('ads', a)">
            {{ t(`keywordOptimizer.inventory.filters.ads.${a}`) }} ({{ counts.ads[a] }})
          </button>
        </div>
      </fieldset>
    </div>

    <p class="text-xs text-ink-soft" role="status">
      {{ t('keywordOptimizer.inventory.filters.showing', { n: shown, total: rows.length }) }}
      <button v-if="active" type="button" class="ml-2 font-mono text-[11px] font-bold uppercase text-link underline" @click="filters = { ...EMPTY_FILTERS }">
        {{ t('keywordOptimizer.inventory.filters.clear') }}
      </button>
    </p>
  </div>
</template>
