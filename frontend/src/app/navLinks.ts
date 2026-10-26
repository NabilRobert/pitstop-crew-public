export const navLinks = [
  { to: '/', labelKey: 'nav.dashboard' },
  { to: '/campaigns', labelKey: 'nav.campaigns' },
  { to: '/keyword-optimizer', labelKey: 'nav.keywordOptimizer' },
  { to: '/inventory', labelKey: 'nav.inventory' },
  { to: '/reports', labelKey: 'nav.reports' },
  { to: '/system-health', labelKey: 'nav.systemHealth' },
  { to: '/learning', labelKey: 'nav.learning' },
  { to: '/settings', labelKey: 'nav.settings' },
  { to: '/how-it-works', labelKey: 'nav.howItWorks' },
  { to: '/engineering-notes', labelKey: 'nav.engineeringNotes' },
  { to: '/api-reference', labelKey: 'nav.apiReference' },
  { to: '/aska', labelKey: 'nav.aska' },
]

/** Pages the read-only demo account never sees: hidden from the menu and redirected to the dashboard if typed in.
 * The private ones (Aska, the Time Machine) and the three documentation pages. Settings stays visible, read-only. */
export const DEMO_HIDDEN_PATHS = ['/aska', '/time-machine', '/how-it-works', '/engineering-notes', '/api-reference']

export const isDemoHidden = (path: string): boolean => DEMO_HIDDEN_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
