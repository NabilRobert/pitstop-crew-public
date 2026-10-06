export interface Section {
  id: string
  labelKey: string
}

export const SECTIONS: Section[] = [
  { id: 'overview', labelKey: 'howItWorks.nav.overview' },
  { id: 'pit-crew', labelKey: 'howItWorks.nav.pitCrew' },
  { id: 'pipeline', labelKey: 'howItWorks.nav.pipeline' },
  { id: 'ciri', labelKey: 'howItWorks.nav.ciri' },
  { id: 'demo-live', labelKey: 'howItWorks.nav.demoLive' },
  { id: 'time-machine', labelKey: 'howItWorks.nav.timeMachine' },
  { id: 'reports', labelKey: 'howItWorks.nav.reports' },
  { id: 'ask', labelKey: 'howItWorks.nav.ask' },
  { id: 'learning', labelKey: 'howItWorks.nav.learning' },
  { id: 'keyword-optimizer', labelKey: 'howItWorks.nav.keywordOptimizer' },
  { id: 'health', labelKey: 'howItWorks.nav.health' },
  { id: 'console', labelKey: 'howItWorks.nav.console' },
  { id: 'settings', labelKey: 'howItWorks.nav.settings' },
  { id: 'principles', labelKey: 'howItWorks.nav.principles' },
]
