<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTime, formatNumber } from '../../shared/utils/format'
import RunStatusPill from '../system-health/RunStatusPill.vue'
import TraceKindBadge from './TraceKindBadge.vue'
import { useRunInspector } from './useRunInspector'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const { loading, error, trace, rows, collapsed, expanded, payloads, toggleChildren, toggleDetails } = useRunInspector(
  toRef(props, 'id')
)

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  return `${Math.floor(s / 60)} m ${Math.round(s % 60)} s`
}

// Null means "no price configured", not free — shown as a dash, never $0.
function formatCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(usd)
}

const run = computed(() => trace.value?.run ?? null)
const stats = computed(() => {
  const r = run.value
  if (!r) return []
  return [
    { label: t('runInspector.stats.duration'), value: formatDuration(r.duration_ms) },
    { label: t('runInspector.stats.llmCalls'), value: r.llm_calls === null ? '—' : formatNumber(r.llm_calls) },
    { label: t('runInspector.stats.tokensIn'), value: r.tokens_in === null ? '—' : formatNumber(r.tokens_in) },
    { label: t('runInspector.stats.tokensOut'), value: r.tokens_out === null ? '—' : formatNumber(r.tokens_out) },
    { label: t('runInspector.stats.cost'), value: formatCost(r.cost_usd), hint: r.cost_usd === null ? t('runInspector.costUnknown') : '' },
    { label: t('runInspector.stats.steps'), value: formatNumber(r.trace_event_count) },
  ]
})

function metaText(meta: Record<string, unknown> | null): string {
  return meta && Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <router-link to="/system-health" class="mb-4 inline-block font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-ink">
      ← {{ t('runInspector.back') }}
    </router-link>

    <div v-if="loading" class="py-24 text-center text-ink-faint">{{ t('common.loading') }}</div>
    <div v-else-if="error && !trace" class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical">
      {{ t('common.couldNotReachBackend', { error }) }}
    </div>

    <template v-else-if="run">
      <div class="mb-6 flex flex-wrap items-center gap-3">
        <h1 class="font-display text-2xl font-bold capitalize text-ink">
          {{ t('runInspector.title', { id: run.id, type: run.run_type.replace('_', ' ') }) }}
        </h1>
        <RunStatusPill :status="run.status" />
        <span v-if="run.status === 'running'" class="font-mono text-[11px] uppercase tracking-wide text-ink-faint">{{ t('runInspector.live') }}</span>
      </div>
      <p class="mb-6 text-sm text-ink-faint">{{ t('runInspector.description') }} · {{ formatDateTime(run.started_at) }}</p>

      <div class="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
        <div v-for="s in stats" :key="s.label" class="rounded-lg border border-border bg-surface px-4 py-3" :title="s.hint">
          <div class="font-mono text-[10px] uppercase tracking-wide text-ink-faint">{{ s.label }}</div>
          <div class="mt-1 font-display text-lg font-bold tabular-nums text-ink">{{ s.value }}</div>
        </div>
      </div>

      <div v-if="run.error_message" class="mb-6 rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-3 text-sm text-flag-critical">
        {{ run.error_message }}
      </div>

      <div v-if="!rows.length" class="rounded-lg border border-border bg-surface px-5 py-10 text-center text-ink-faint">
        {{ t('runInspector.noTrace') }}
      </div>

      <div v-else class="overflow-hidden rounded-lg border border-border bg-surface">
        <div class="hidden border-b border-border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint md:flex">
          <span class="flex-1">{{ t('runInspector.columns.step') }}</span>
          <span class="w-56">{{ t('runInspector.columns.timeline') }}</span>
          <span class="w-20 text-right">{{ t('runInspector.columns.time') }}</span>
          <span class="w-28 text-right">{{ t('runInspector.columns.tokens') }}</span>
          <span class="w-20 text-right">{{ t('runInspector.columns.cost') }}</span>
        </div>

        <template v-for="row in rows" :key="row.event.id">
          <div
            class="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-4 py-2 hover:bg-surface-raised md:flex-nowrap"
            @click="toggleDetails(row.event)"
          >
            <div class="flex min-w-0 flex-1 items-center gap-2" :style="{ paddingLeft: `${row.depth * 20}px` }">
              <button
                v-if="row.hasChildren"
                type="button"
                class="w-4 shrink-0 font-mono text-xs text-ink-faint hover:text-ink"
                :aria-label="collapsed.has(row.event.id) ? t('runInspector.expand') : t('runInspector.collapse')"
                @click.stop="toggleChildren(row.event.id)"
              >
                {{ collapsed.has(row.event.id) ? '▸' : '▾' }}
              </button>
              <span v-else class="w-4 shrink-0" />
              <TraceKindBadge :kind="row.event.kind" />
              <span
                class="h-1.5 w-1.5 shrink-0 rounded-full"
                :style="{
                  backgroundColor:
                    row.event.status === 'error' ? 'var(--color-flag-critical)' : row.event.status === 'skipped' ? 'var(--color-flag-caution)' : 'var(--color-flag-good)',
                }"
                :title="row.event.status"
              />
              <div class="min-w-0">
                <div class="truncate text-sm font-medium text-ink">{{ row.event.name }}</div>
                <div v-if="row.event.summary" class="truncate text-xs text-ink-faint">{{ row.event.summary }}</div>
              </div>
            </div>
            <div class="relative hidden h-2 w-56 shrink-0 rounded bg-border/40 md:block">
              <div
                class="absolute top-0 h-2 rounded"
                :style="{
                  left: `${Math.min(row.left, 99.6)}%`,
                  width: `${Math.min(row.width, 100 - Math.min(row.left, 99.6))}%`,
                  backgroundColor: row.event.status === 'error' ? 'var(--color-flag-critical)' : 'var(--color-rosso)',
                }"
              />
            </div>
            <span class="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-ink-soft">{{ formatDuration(row.event.duration_ms) }}</span>
            <span class="w-28 shrink-0 text-right font-mono text-xs tabular-nums text-ink-soft">
              {{ row.event.tokens_in === null && row.event.tokens_out === null ? '' : `${formatNumber(row.event.tokens_in)} → ${formatNumber(row.event.tokens_out)}` }}
            </span>
            <span class="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-ink-soft">
              {{ row.event.kind === 'llm_call' || row.event.kind === 'run' ? formatCost(row.event.cost_usd) : '' }}
            </span>
          </div>

          <div v-if="expanded.has(row.event.id)" class="space-y-3 border-b border-border/60 bg-surface-raised px-4 py-4 text-sm">
            <p v-if="row.event.summary" class="text-ink-soft">{{ row.event.summary }}</p>
            <p v-if="row.event.error_message" class="text-flag-critical">{{ row.event.error_message }}</p>
            <div v-if="row.event.model" class="font-mono text-xs text-ink-faint">{{ t('runInspector.model') }}: {{ row.event.model }}</div>
            <pre v-if="metaText(row.event.meta)" class="max-h-72 overflow-auto rounded border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink-soft">{{ metaText(row.event.meta) }}</pre>

            <template v-if="row.event.payload_count > 0">
              <div v-if="payloads.get(row.event.id) === 'loading'" class="text-ink-faint">{{ t('common.loading') }}</div>
              <div v-else-if="payloads.get(row.event.id) === 'error'" class="text-flag-critical">{{ t('runInspector.payloadError') }}</div>
              <template v-else-if="payloads.get(row.event.id)">
                <div v-for="p in (payloads.get(row.event.id) as any).payloads" :key="p.id">
                  <div class="mb-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                    {{ t(`runInspector.payloadRoles.${p.role}`) }} · {{ formatNumber(p.chars) }} {{ t('runInspector.chars') }}
                  </div>
                  <pre class="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink-soft">{{ p.content }}</pre>
                </div>
              </template>
            </template>
            <p v-else-if="row.event.kind === 'llm_call' || row.event.kind === 'context'" class="text-xs text-ink-faint">
              {{ t('runInspector.payloadExpired') }}
            </p>
          </div>
        </template>
      </div>
    </template>
  </main>
</template>
