<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { SECTIONS } from './sections'

const { t } = useI18n()
</script>

<template>
  <main class="mx-auto max-w-3xl px-6 py-8">
    <h1 class="mb-2 font-display text-2xl font-bold text-ink">{{ t('howItWorks.title') }}</h1>
    <p class="mb-8 text-sm text-ink-faint">
      {{ t('howItWorks.subtitle') }}
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
        <h2 class="!mt-0">{{ t('howItWorks.overview.title') }}</h2>
        <p>
          {{ t('howItWorks.overview.p1') }}
        </p>
        <p>
          {{ t('howItWorks.overview.p2') }}
        </p>
      </section>

      <section id="pit-crew">
        <h2>{{ t('howItWorks.pitCrew.title') }}</h2>
        <p>{{ t('howItWorks.pitCrew.intro') }}</p>
        <ul>
          <li><strong>Orca</strong> {{ t('howItWorks.pitCrew.orca') }}</li>
          <li><strong>Damon</strong> {{ t('howItWorks.pitCrew.damon') }}</li>
          <li><strong>Anna</strong> {{ t('howItWorks.pitCrew.anna') }}</li>
          <li><strong>Rico</strong> {{ t('howItWorks.pitCrew.rico') }}</li>
          <li><strong>Ciri</strong> {{ t('howItWorks.pitCrew.ciri') }}</li>
          <li><strong>Sammy</strong> {{ t('howItWorks.pitCrew.sammy') }}</li>
          <li><strong>Emil</strong> {{ t('howItWorks.pitCrew.emil') }}</li>
        </ul>
      </section>

      <section id="pipeline">
        <h2>{{ t('howItWorks.pipeline.title') }}</h2>
        <p>{{ t('howItWorks.pipeline.intro') }}</p>
        <ol>
          <li>{{ t('howItWorks.pipeline.step1') }}</li>
          <li>{{ t('howItWorks.pipeline.step2') }}</li>
          <li>{{ t('howItWorks.pipeline.step3') }}</li>
          <li>{{ t('howItWorks.pipeline.step4') }}</li>
          <li>{{ t('howItWorks.pipeline.step5') }}</li>
        </ol>
        <p>
          {{ t('howItWorks.pipeline.consoleNoteBefore') }}
          <router-link to="/" class="text-link underline">{{ t('howItWorks.pipeline.consoleNoteLink') }}</router-link>
          {{ t('howItWorks.pipeline.consoleNoteAfter') }}
        </p>
      </section>

      <section id="ciri">
        <h2>{{ t('howItWorks.ciri.title') }}</h2>
        <p>
          {{ t('howItWorks.ciri.intro') }}
        </p>
        <ul>
          <li>
            <strong>{{ t('howItWorks.ciri.verdictLabel') }}</strong> {{ t('howItWorks.ciri.verdictDesc') }}
          </li>
          <li>
            <strong>{{ t('howItWorks.ciri.gradeLabel') }}</strong>
            {{ t('howItWorks.ciri.gradeDescBefore') }}
            <router-link to="/learning" class="text-link underline">{{ t('howItWorks.ciri.gradeDescLink') }}</router-link>
            {{ t('howItWorks.ciri.gradeDescAfter') }}
          </li>
        </ul>
        <p>
          {{ t('howItWorks.ciri.extra') }}
        </p>
        <p class="text-sm text-ink-faint">
          {{ t('howItWorks.ciri.caveat') }}
        </p>
      </section>

      <section id="demo-live">
        <h2>{{ t('howItWorks.demoLive.title') }}</h2>
        <p>
          {{ t('howItWorks.demoLive.body') }}
        </p>
      </section>

      <section id="time-machine">
        <h2>{{ t('howItWorks.timeMachine.title') }}</h2>
        <p>
          {{ t('howItWorks.timeMachine.body') }}
        </p>
      </section>

      <section id="reports">
        <h2>{{ t('howItWorks.reports.title') }}</h2>
        <p>
          {{ t('howItWorks.reports.p1') }}
        </p>
        <p>
          {{ t('howItWorks.reports.p2') }}
        </p>
      </section>

      <section id="ask">
        <h2>{{ t('howItWorks.ask.title') }}</h2>
        <p>
          {{ t('howItWorks.ask.body') }}
        </p>
      </section>

      <section id="learning">
        <h2>{{ t('howItWorks.learning.title') }}</h2>
        <p>
          {{ t('howItWorks.learning.body') }}
        </p>
      </section>

      <section id="keyword-optimizer">
        <h2>{{ t('howItWorks.keywordOptimizer.title') }}</h2>
        <p>{{ t('howItWorks.keywordOptimizer.body') }}</p>
        <ul>
          <li>{{ t('howItWorks.keywordOptimizer.item1') }}</li>
          <li>{{ t('howItWorks.keywordOptimizer.item2') }}</li>
          <li>{{ t('howItWorks.keywordOptimizer.item3') }}</li>
          <li>{{ t('howItWorks.keywordOptimizer.item4') }}</li>
          <li>{{ t('howItWorks.keywordOptimizer.item5') }}</li>
        </ul>
      </section>

      <section id="health">
        <h2>{{ t('howItWorks.health.title') }}</h2>
        <p>
          {{ t('howItWorks.health.body') }}
        </p>
      </section>

      <section id="console">
        <h2>{{ t('howItWorks.console.title') }}</h2>
        <p>
          {{ t('howItWorks.console.body') }}
        </p>
      </section>

      <section id="settings">
        <h2>{{ t('howItWorks.settings.title') }}</h2>
        <p>
          {{ t('howItWorks.settings.body') }}
        </p>
      </section>

      <section id="principles">
        <h2>{{ t('howItWorks.principles.title') }}</h2>
        <ul>
          <li>{{ t('howItWorks.principles.item1') }}</li>
          <li>{{ t('howItWorks.principles.item2') }}</li>
          <li>{{ t('howItWorks.principles.item3') }}</li>
          <li>{{ t('howItWorks.principles.item4') }}</li>
        </ul>
      </section>
    </div>
  </main>
</template>
