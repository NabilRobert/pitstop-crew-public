<script setup lang="ts">
// One labelled text-like input with optional help text: the look every settings field shares.
defineProps<{
  id: string
  label: string
  help?: string
  type?: string
  inputmode?: 'numeric' | 'decimal' | 'tel' | 'text'
  placeholder?: string
  maxlength?: number
  /** Extra width classes for the input, e.g. `max-w-md`. */
  widthClass?: string
}>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div>
    <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" :for="id">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      :type="type ?? 'text'"
      :inputmode="inputmode"
      :placeholder="placeholder"
      :maxlength="maxlength"
      class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none"
      :class="widthClass"
    />
    <p v-if="help" class="mt-1 text-xs text-ink-faint">{{ help }}</p>
  </div>
</template>
