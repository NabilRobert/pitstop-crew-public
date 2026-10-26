import { Router } from 'express'
import * as auth from '../../platform/auth.js'
import { authMiddleware } from '../authMiddleware.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body ?? {}
    try {
      const { token, role } = auth.login(String(username ?? ''), String(password ?? ''), req.ip ?? 'unknown')
      res.json({ token, role })
    } catch (err) {
      res.status(401).json({ detail: err instanceof Error ? err.message : String(err) })
    }
  })
)

router.post('/auth/logout', authMiddleware, (req, res) => {
  const header = req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
  auth.logout(token)
  res.json({ ok: true })
})

router.get('/auth/verify', authMiddleware, (_req, res) => {
  res.json({ ok: true, role: res.locals.role })
})
