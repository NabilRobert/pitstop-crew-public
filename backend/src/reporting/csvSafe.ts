// Spreadsheet-safe text for every file the API exports (the negatives
// export and the 3.3 campaign brief). Every field is untrusted: keyword,
// search-term and campaign text comes from the ad account.

/** Spreadsheet formula injection: a cell starting with = + - @ tab or CR is
 * prefixed with an apostrophe. */
export function neutralizeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/** One CSV field: neutralized, then quoted when it holds a quote, comma or
 * line break. */
export function csvCell(value: string): string {
  const v = neutralizeCell(value)
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
