<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { SECTIONS } from './sections'

const { t } = useI18n()
</script>

<template>
  <main class="mx-auto max-w-3xl px-6 py-8">
    <h1 class="mb-2 font-display text-2xl font-bold text-ink">{{ t('engineeringNotes.title') }}</h1>
    <p class="mb-8 text-sm text-ink-faint">
      {{ t('engineeringNotes.subtitle') }}
    </p>

    <nav class="mb-10 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-surface p-4">
      <a
        v-for="s in SECTIONS"
        :key="s.id"
        :href="`#${s.id}`"
        class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-accent-ink"
      >
        {{ t(s.labelKey) }}
      </a>
    </nav>

    <div class="agent-prose space-y-10">
      <section id="overview">
        <h2 class="!mt-0">{{ t('engineeringNotes.overview.title') }}</h2>
        <p>{{ t('engineeringNotes.overview.p1') }}</p>
        <p>{{ t('engineeringNotes.overview.p2') }}</p>
      </section>

      <section id="quality-control">
        <h2>{{ t('engineeringNotes.qualityControl.title') }}</h2>
        <p>{{ t('engineeringNotes.qualityControl.p1') }}</p>
        <ul>
          <li>{{ t('engineeringNotes.qualityControl.item1') }}</li>
          <li>{{ t('engineeringNotes.qualityControl.item2') }}</li>
          <li>{{ t('engineeringNotes.qualityControl.item3') }}</li>
          <li>{{ t('engineeringNotes.qualityControl.item4') }}</li>
        </ul>
        <p>
          {{ t('engineeringNotes.qualityControl.linkBefore') }}
          <router-link to="/learning" class="text-link underline">{{ t('engineeringNotes.qualityControl.linkText') }}</router-link>
          {{ t('engineeringNotes.qualityControl.linkAfter') }}
        </p>
      </section>

      <section id="observability">
        <h2>{{ t('engineeringNotes.observability.title') }}</h2>
        <p>{{ t('engineeringNotes.observability.p1') }}</p>
        <p>
          {{ t('engineeringNotes.observability.linkBefore') }}
          <router-link to="/system-health" class="text-link underline">{{ t('engineeringNotes.observability.linkText') }}</router-link>
          {{ t('engineeringNotes.observability.linkAfter') }}
        </p>
      </section>

      <section id="cost">
        <h2>{{ t('engineeringNotes.cost.title') }}</h2>
        <p>{{ t('engineeringNotes.cost.p1') }}</p>
        <p>{{ t('engineeringNotes.cost.p2') }}</p>
      </section>

      <section id="operations">
        <h2>{{ t('engineeringNotes.operations.title') }}</h2>
        <p>{{ t('engineeringNotes.operations.p1') }}</p>
        <ul>
          <li>{{ t('engineeringNotes.operations.item1') }}</li>
          <li>{{ t('engineeringNotes.operations.item2') }}</li>
          <li>{{ t('engineeringNotes.operations.item3') }}</li>
        </ul>
      </section>

      <section id="access">
        <h2>{{ t('engineeringNotes.access.title') }}</h2>
        <p>{{ t('engineeringNotes.access.p1') }}</p>
        <ul>
          <li>{{ t('engineeringNotes.access.item1') }}</li>
          <li>{{ t('engineeringNotes.access.item2') }}</li>
          <li>{{ t('engineeringNotes.access.item3') }}</li>
        </ul>
      </section>

      <section id="data-model">
        <h2>{{ t('engineeringNotes.dataModel.title') }}</h2>
        <p>{{ t('engineeringNotes.dataModel.p1') }}</p>
        <p>{{ t('engineeringNotes.dataModel.p2') }}</p>
      </section>

      <section id="testing">
        <h2>{{ t('engineeringNotes.testing.title') }}</h2>
        <p>{{ t('engineeringNotes.testing.p1') }}</p>
      </section>

      <section id="closing">
        <p class="text-sm text-ink-faint">{{ t('engineeringNotes.closing') }}</p>
      </section>
    </div>
  </main>
</template>
