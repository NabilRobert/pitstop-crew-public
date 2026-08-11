// The pipeline's schedule always means Indonesia time — this app has no
// other audience — so it's pinned to WIB explicitly rather than trusting
// the VPS's own OS timezone to be configured correctly (Settings page's
// run-time fields, deploy/crontab.txt, and runDaily.ts's "is it due yet"
// check all read through here). WIB (Asia/Jakarta) is a fixed UTC+7 offset
// with no DST, so this never needs to account for a seasonal shift.
const WIB_TIMEZONE = 'Asia/Jakarta'

/** YYYY-MM-DD in WIB. */
export function wibDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: WIB_TIMEZONE }).format(d)
}

/** HH:MM in WIB, 24-hour — matches the Settings page's run-time fields. */
export function wibTime(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: WIB_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)
}

export function isWibMonday(d: Date = new Date()): boolean {
  return new Intl.DateTimeFormat('en-US', { timeZone: WIB_TIMEZONE, weekday: 'short' }).format(d) === 'Mon'
}
