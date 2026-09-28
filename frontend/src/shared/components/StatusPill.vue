<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  status: { type: String, required: true }, // 'approved' | 'flagged' | 'draft' | 'revised'
  // An approved output can still carry medium/low-severity critic notes —
  // approval only means "no high-severity issue and grade A-C", not "no
  // issues". Marking it keeps an approval from hiding those notes.
  notes: { type: Boolean, default: false },
})

const { t } = useI18n()

const config = computed(() => {
  switch (props.status) {
    case 'approved':
      return {
        label: props.notes ? t('runStatusPill.approvedWithNotes') : t('runStatusPill.approved'),
        color: 'flag-good',
        dot: true,
      }
    case 'flagged':
      return { label: t('runStatusPill.flagged'), color: 'flag-caution', dot: true }
    case 'revised':
      return { label: t('runStatusPill.revised'), color: 'ink-soft', dot: false }
    default:
      return { label: t('runStatusPill.draft'), color: 'ink-faint', dot: false }
  }
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
    :style="{
      color: `var(--color-${config.color})`,
      borderColor: `color-mix(in srgb, var(--color-${config.color}) 40%, transparent)`,
      backgroundColor: `color-mix(in srgb, var(--color-${config.color}) 12%, transparent)`,
    }"
  >
    <span
      v-if="config.dot"
      class="h-1.5 w-1.5 rounded-full"
      :style="{ backgroundColor: `var(--color-${config.color})` }"
    />
    {{ config.label }}
  </span>
</template>
