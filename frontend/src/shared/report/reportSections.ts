export interface ReportSectionDef {
  key: 'analysis' | 'recommendation' | 'summary'
  titleKey: string
  askable: boolean
  hasWhyTrail: boolean
}

// Which report section shows which actions — shared by ReportTabs and
// ReportColumns so the two layouts can't drift out of sync with each other.
// Matches the causal generation order in orchestrator.ts: Anna -> Rico -> Sammy.
export const REPORT_SECTIONS: ReportSectionDef[] = [
  { key: 'analysis', titleKey: 'report.sections.analysis', askable: false, hasWhyTrail: true },
  { key: 'recommendation', titleKey: 'report.sections.recommendation', askable: true, hasWhyTrail: true },
  { key: 'summary', titleKey: 'report.sections.summary', askable: true, hasWhyTrail: false },
]
