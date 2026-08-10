// Which report section shows which actions — shared by ReportTabs and
// ReportColumns so the two layouts can't drift out of sync with each other.
// Matches the causal generation order in orchestrator.ts: Anna -> Rico -> Sammy.
export const REPORT_SECTIONS = [
  { key: 'analysis', title: "Anna's analysis", askable: false, hasWhyTrail: true },
  { key: 'recommendation', title: "Rico's recommendation", askable: true, hasWhyTrail: true },
  { key: 'summary', title: "Sammy's summary", askable: true, hasWhyTrail: false },
]
