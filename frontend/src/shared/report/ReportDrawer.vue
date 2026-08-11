<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
})

const emit = defineEmits(['close'])

const { t } = useI18n()

function onKeydown(e) {
  if (e.key === 'Escape' && props.open) emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-40 bg-black/60 transition-opacity duration-200"
      :class="open ? 'opacity-100' : 'pointer-events-none opacity-0'"
      @click="$emit('close')"
    />
    <aside
      class="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200 sm:max-w-lg"
      :class="open ? 'translate-x-0' : 'pointer-events-none translate-x-full'"
    >
      <div class="flex items-center justify-between border-b border-border px-5 py-4">
        <span class="font-display text-base font-bold text-ink">{{ title }}</span>
        <button
          type="button"
          class="font-mono text-lg text-ink-faint hover:text-ink"
          :aria-label="t('reportDrawer.close')"
          @click="$emit('close')"
        >
          ×
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-5 py-5">
        <slot />
      </div>
    </aside>
  </Teleport>
</template>
