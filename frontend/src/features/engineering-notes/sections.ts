export interface Section {
  id: string
  labelKey: string
}

export const SECTIONS: Section[] = [
  { id: 'overview', labelKey: 'engineeringNotes.nav.overview' },
  { id: 'quality-control', labelKey: 'engineeringNotes.nav.qualityControl' },
  { id: 'keyword-optimizer', labelKey: 'engineeringNotes.nav.keywordOptimizer' },
  { id: 'observability', labelKey: 'engineeringNotes.nav.observability' },
  { id: 'cost', labelKey: 'engineeringNotes.nav.cost' },
  { id: 'operations', labelKey: 'engineeringNotes.nav.operations' },
  { id: 'access', labelKey: 'engineeringNotes.nav.access' },
  { id: 'data-model', labelKey: 'engineeringNotes.nav.dataModel' },
  { id: 'testing', labelKey: 'engineeringNotes.nav.testing' },
]
