// Unit tests for the settings validators added for the keyword optimizer
// (docs/overhaul-v3-backend.md section 6). A value these accept is stored
// as-is and later fed into the engine's formulas (n_min takes ln(p); target
// CPA multiplies the shares), so the boundaries matter.

import { describe, it, expect } from 'vitest'
import { isValidShare, isValidPValue, isValidCostCap, isValidSettingValue, type SettingKey } from './settings.js'

describe('isValidShare', () => {
  it('accepts the closed range [0, 1]', () => {
    for (const v of ['0', '1', '0.2', '0.02', '1.0']) expect(isValidShare(v)).toBe(true)
  })

  it('rejects values outside [0, 1]', () => {
    for (const v of ['-0.01', '1.01', '20']) expect(isValidShare(v)).toBe(false)
  })

  it('rejects empty, whitespace and non-numeric input (no "off" meaning, unlike the cost cap)', () => {
    for (const v of ['', ' ', 'abc', 'NaN', 'Infinity', '0.2x']) expect(isValidShare(v)).toBe(false)
  })
})

describe('isValidPValue', () => {
  it('accepts (0, 1]', () => {
    for (const v of ['0.05', '0.01', '1']) expect(isValidPValue(v)).toBe(true)
  })

  it('rejects 0 (ln(0) is undefined in the n_min formula) and anything outside the range', () => {
    for (const v of ['0', '0.0', '-0.05', '1.5', '']) expect(isValidPValue(v)).toBe(false)
  })
})

describe('isValidCostCap (unchanged behaviour)', () => {
  it('still treats empty as "no cap" and rejects 0', () => {
    expect(isValidCostCap('')).toBe(true)
    expect(isValidCostCap('0')).toBe(false)
  })
})

// Contract 3.5 — Kai's automatic run time uses the same HH:MM check as
// daily_run_time; keyword_optimizer_enabled stays a strict boolean.
describe('keyword_optimizer_run_time and keyword_optimizer_enabled', () => {
  it('accepts HH:MM from 00:00 to 23:59, like daily_run_time', () => {
    for (const v of ['00:00', '06:00', '09:30', '23:59']) {
      expect(isValidSettingValue('keyword_optimizer_run_time', v), v).toBe(true)
      expect(isValidSettingValue('daily_run_time', v), v).toBe(true)
    }
  })

  it('rejects 25:00 and every other malformed time', () => {
    for (const v of ['25:00', '24:00', '6:00', '06:0', '06:60', '0600', '', ' 06:00', 'noon']) {
      expect(isValidSettingValue('keyword_optimizer_run_time', v), v).toBe(false)
    }
  })

  it('takes only "true" or "false" as the switch', () => {
    expect(isValidSettingValue('keyword_optimizer_enabled', 'true')).toBe(true)
    expect(isValidSettingValue('keyword_optimizer_enabled', 'false')).toBe(true)
    for (const v of ['TRUE', 'yes', '1', '']) expect(isValidSettingValue('keyword_optimizer_enabled', v), v).toBe(false)
  })
})

// Contract 3.6 — the dealer facts and ad settings, the kill switch and the
// writer mode.
describe('3.6 ad settings', () => {
  it('takes the seeded defaults', () => {
    const defaults: [string, string][] = [
      ['dealer_name', 'Pitstop Used Cars'],
      ['dealer_city', 'Tangerang'],
      ['dealer_area', 'Gading Serpong'],
      ['dealer_whatsapp', '0812-5550-0123'],
      ['dealer_landing_url', ''],
      ['ads_claim_installments', 'true'],
      ['ads_claim_trade_in', 'true'],
      ['ads_claim_test_drive', 'true'],
      ['ads_claim_inspection', 'true'],
      ['ads_inspection_wording', 'Unit sudah melalui pemeriksaan'],
      ['ads_write_enabled', 'false'],
      ['ads_write_mode', 'simulated'],
    ]
    for (const [k, v] of defaults) expect(isValidSettingValue(k as SettingKey, v), k).toBe(true)
  })

  it('keeps the dealer profile to the contract lengths, one line, no "!"', () => {
    expect(isValidSettingValue('dealer_name', 'x'.repeat(40))).toBe(true)
    for (const v of ['', ' ', 'x'.repeat(41), 'Pitstop!', 'Pitstop\nUsed']) expect(isValidSettingValue('dealer_name', v), v).toBe(false)
    for (const key of ['dealer_city', 'dealer_area'] as const) {
      expect(isValidSettingValue(key, '')).toBe(true)
      expect(isValidSettingValue(key, 'x'.repeat(40))).toBe(true)
      expect(isValidSettingValue(key, 'x'.repeat(41))).toBe(false)
    }
    expect(isValidSettingValue('ads_inspection_wording', 'x'.repeat(60))).toBe(true)
    expect(isValidSettingValue('ads_inspection_wording', 'x'.repeat(61))).toBe(false)
  })

  it('takes a WhatsApp number of digits, spaces, "-" and "+", at most 20 characters, or empty', () => {
    for (const v of ['', '0812-5550-0123', '+62 812 5550 0123', '081255500123', '0812']) expect(isValidSettingValue('dealer_whatsapp', v), v).toBe(true)
    for (const v of ['+62 812-5550-0123 456', 'call me', '0812/5550', '0812.5550']) expect(isValidSettingValue('dealer_whatsapp', v), v).toBe(false)
  })

  it('takes an empty or absolute http(s) landing URL', () => {
    for (const v of ['', 'https://pitstop.example.com/', 'http://pitstop.example.com/mobil-bekas']) expect(isValidSettingValue('dealer_landing_url', v), v).toBe(true)
    for (const v of ['pitstop.example.com', 'javascript:alert(1)', 'ftp://x.example.com', 'https://x.example.com/a b']) {
      expect(isValidSettingValue('dealer_landing_url', v), v).toBe(false)
    }
  })

  it('has a strict boolean kill switch and only the simulated writer', () => {
    for (const v of ['TRUE', 'on', '']) expect(isValidSettingValue('ads_write_enabled', v), v).toBe(false)
    for (const v of ['live', 'LIVE', '', 'simulate']) expect(isValidSettingValue('ads_write_mode', v), v).toBe(false)
  })
})
