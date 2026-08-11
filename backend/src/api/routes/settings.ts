import { Router } from 'express'
import * as settings from '../../platform/settings.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Pipeline run-time config — polled by runDaily.ts instead of the run
 * time being baked into the crontab line. */
router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json(await settings.getSettings())
  })
)

/** Generic over settings.SETTING_KEYS so adding a new setting only ever
 * means touching settings.ts, never this route too — the previous
 * version required both, and drifted (report_recipient_email was added
 * to settings.ts and the frontend but silently never wired in here). */
router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    try {
      for (const [key, value] of Object.entries(req.body ?? {})) {
        if (!settings.isSettingKey(key)) continue
        await settings.setSetting(key, String(value))
      }
    } catch (err) {
      res.status(400).json({ detail: err instanceof Error ? err.message : String(err) })
      return
    }
    res.json(await settings.getSettings())
  })
)
