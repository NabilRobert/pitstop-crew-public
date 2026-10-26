<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NewAdPayload } from '../../shared/api/types'
import { formatDate } from '../../shared/utils/format'
import { formatIdr } from './suggestionView'

// A new-ad suggestion (contract 3.6): what the ad would look like, WHY it was written (the facts it may use and
// the winning keywords that shaped it), and the three code-computed checks. Read-only: to change an ad, dismiss
// it and let the next run write another. All text is rendered as text, never HTML.
const props = defineProps<{ payload: NewAdPayload }>()
const { t } = useI18n()

const LIMITS = { headline: 30, description: 90, path: 15 } as const
const preview = computed(() => ({
  headline: props.payload.headlines.slice(0, 3).map((h) => h.text).join(' | '),
  description: props.payload.descriptions[0]?.text ?? '',
  path: [props.payload.path1, props.payload.path2].filter(Boolean).join(' › '),
}))
const f = computed(() => props.payload.facts)
const years = computed(() =>
  f.value.year_from === null ? null : f.value.year_to === null || f.value.year_to === f.value.year_from ? String(f.value.year_from) : `${f.value.year_from}-${f.value.year_to}`
)
const checks = computed(() => [
  { key: 'limits', ok: props.payload.checks.limits_ok },
  { key: 'numbers', ok: props.payload.checks.numbers_from_facts },
  { key: 'claims', ok: props.payload.checks.claims_allowed },
])
const over = (text: string, max: number) => text.length > max
</script>

<template>
  <div class="ad mt-3 space-y-3">
    <!-- The ad as Google would roughly show it. Fixed paper and ink, like the board notes. -->
    <div class="ad__paper" :aria-label="t('keywordOptimizer.ad.previewLabel')">
      <div class="ad__label">{{ t('keywordOptimizer.ad.adLabel') }} · {{ f.dealer }}<span v-if="preview.path"> · /{{ preview.path.replace(/ › /g, '/') }}</span></div>
      <div class="ad__headline">{{ preview.headline }}</div>
      <div class="ad__description">{{ preview.description }}</div>
    </div>

    <ul class="flex flex-wrap gap-1.5" :aria-label="t('keywordOptimizer.ad.checksLabel')">
      <li
        v-for="c in checks"
        :key="c.key"
        class="border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
        :class="c.ok ? 'border-flag-good/40 bg-flag-good-soft text-flag-good' : 'border-flag-critical/40 bg-flag-critical-soft text-flag-critical'"
      >
        {{ c.ok ? '✓' : '✗' }} {{ t(`keywordOptimizer.ad.checks.${c.key}.${c.ok ? 'ok' : 'bad'}`) }}
      </li>
      <li class="border border-border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-soft">
        {{ payload.polished ? t('keywordOptimizer.ad.polished') : t('keywordOptimizer.ad.template') }}
      </li>
    </ul>

    <p class="text-sm text-ink-soft">{{ t(`keywordOptimizer.ad.basis.${payload.basis}`) }}</p>
    <p v-if="payload.replaces_ad" class="text-sm text-ink">
      {{ t('keywordOptimizer.ad.replaces', { label: payload.replaces_ad.label }) }}
      <span v-if="payload.replaces_ad.ad_strength" class="font-bold">{{ t(`keywordOptimizer.ad.strength.${payload.replaces_ad.ad_strength}`) }}</span>
    </p>

    <!-- What the copy was allowed to say: the facts and the winners behind the wording. -->
    <section>
      <h4 class="mb-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.ad.factsTitle') }}</h4>
      <p class="text-sm text-ink">
        {{ t('keywordOptimizer.ad.facts', { units: f.units }, f.units) }}
        <span v-if="f.make || f.model"> · {{ [f.make, f.model].filter(Boolean).join(' ') }}</span>
        <span v-if="years"> · {{ years }}</span>
        <span v-if="f.price_from_idr !== null"> · {{ t('keywordOptimizer.ad.fromPrice', { amount: formatIdr(f.price_from_idr) }) }}</span>
        <span v-if="f.mileage_from_km !== null"> · {{ t('keywordOptimizer.ad.mileage', { km: f.mileage_from_km.toLocaleString('en-US') }) }}</span>
        <span class="ml-1 font-mono text-[10px] text-ink-faint">· {{ t('keywordOptimizer.card.stockAsOf', { date: formatDate(f.snapshot_on) }) }}</span>
      </p>
      <ul v-if="f.claims_used.length" class="mt-1 flex flex-wrap gap-1.5">
        <li v-for="c in f.claims_used" :key="c" class="border border-border px-1.5 py-0.5 text-xs text-ink">{{ t(`keywordOptimizer.ad.claims.${c}`) }}</li>
      </ul>
      <p v-if="payload.winner_keywords.length" class="mt-2 text-sm text-ink-soft">
        {{ t('keywordOptimizer.ad.winners') }}
        <span v-for="(w, i) in payload.winner_keywords" :key="w.text" class="font-bold text-ink">{{ w.text }}<span v-if="i < payload.winner_keywords.length - 1">, </span></span>
      </p>
      <p v-else class="mt-2 text-sm text-ink-faint">{{ t('keywordOptimizer.ad.noWinners') }}</p>
      <p v-if="payload.final_url === null" class="mt-1 text-xs text-ink-faint">{{ t('keywordOptimizer.ad.noLanding') }}</p>
    </section>

    <details class="text-sm">
      <summary class="cursor-pointer font-mono text-[11px] font-bold uppercase tracking-wide text-link underline">
        {{ t('keywordOptimizer.ad.allCopy', { h: payload.headlines.length, d: payload.descriptions.length }) }}
      </summary>
      <h4 class="mb-1 mt-2 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.ad.headlines') }}</h4>
      <ul class="space-y-0.5">
        <li v-for="(h, i) in payload.headlines" :key="i" class="flex justify-between gap-3 border border-border bg-surface-raised px-2 py-1">
          <span class="text-ink">{{ h.text }}</span>
          <span class="font-mono text-[10px]" :class="over(h.text, LIMITS.headline) ? 'font-bold text-flag-critical' : 'text-ink-faint'">{{ h.text.length }}/{{ LIMITS.headline }}</span>
        </li>
      </ul>
      <h4 class="mb-1 mt-2 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.ad.descriptions') }}</h4>
      <ul class="space-y-0.5">
        <li v-for="(d, i) in payload.descriptions" :key="i" class="flex justify-between gap-3 border border-border bg-surface-raised px-2 py-1">
          <span class="text-ink">{{ d.text }}</span>
          <span class="shrink-0 font-mono text-[10px]" :class="over(d.text, LIMITS.description) ? 'font-bold text-flag-critical' : 'text-ink-faint'">{{ d.text.length }}/{{ LIMITS.description }}</span>
        </li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.ad__paper { padding: 10px 12px; background: #ffffff; color: #202124; border: 1.5px solid #000; }
.ad__label { font-size: 12px; color: #3c4043; }
.ad__headline { margin-top: 2px; font-size: 1.05rem; line-height: 1.3; color: #1a0dab; }
.ad__description { margin-top: 2px; font-size: 0.9rem; line-height: 1.4; color: #4d5156; }
</style>
