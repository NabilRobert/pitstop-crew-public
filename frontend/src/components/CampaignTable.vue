<script setup>
import { formatMicrosAsIDR, formatNumber, formatPercent } from '../lib/format'

defineProps({
  rows: { type: Array, required: true },
})
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border bg-surface">
    <table class="w-full border-collapse text-left">
      <thead>
        <tr class="border-b border-border">
          <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Campaign
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Impressions
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Clicks
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            CTR
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Cost
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Conversions
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.campaign"
          class="border-b border-border/60 last:border-0 hover:bg-surface-raised"
        >
          <td class="px-4 py-3 font-medium text-ink">{{ row.campaign }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.impressions) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.clicks) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatPercent(row.ctr) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatMicrosAsIDR(row.cost_micros) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink">{{ row.conversions.toFixed(1) }}</td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="6" class="px-4 py-8 text-center text-ink-faint">No performance data yet.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
