// JSON with object keys sorted at every level: jsonb reorders keys, so a
// stored row and a fresh candidate only compare equal this way. Used by
// the change check (3.5) and the ad fingerprints (3.6).

export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
    : v
  return JSON.stringify(sort(JSON.parse(JSON.stringify(value ?? null))))
}
