<script setup lang="ts">
import { useId } from 'vue'

// A small search field with a clear button. Free text only: the caller decides what it matches.
const query = defineModel<string>({ required: true })
defineProps<{ label: string; placeholder: string; clearLabel: string }>()
const id = useId()
</script>

<template>
  <div class="relative w-full max-w-sm">
    <label :for="id" class="sr-only">{{ label }}</label>
    <input
      :id="id"
      v-model="query"
      type="search"
      autocomplete="off"
      :placeholder="placeholder"
      class="w-full rounded-md border border-border bg-surface-raised py-2 pl-3 pr-9 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none"
    />
    <button
      v-if="query"
      type="button"
      class="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1 font-mono text-[12px] font-bold text-ink-soft hover:text-ink"
      :aria-label="clearLabel"
      @click="query = ''"
    >
      ×
    </button>
  </div>
</template>
