// How a campaign name is compared (contract 3.3): a planned proposal is
// linked to the real campaign of the same name, and a new proposal's name
// must not collide with either. Its own module so the pure engine can use
// it without importing the DB code in suggestions.ts.

/** Trimmed, inner whitespace collapsed, case-insensitive. */
export function normalizeCampaignName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}
