// Gates every route mounted after it in main.ts. Reads the token from the
// Authorization header, falling back to a ?token= query param — the only
// way EventSource (used by /console/stream) can carry auth, since it can't
// set custom headers.
import type { Request, Response, NextFunction } from 'express'
import { isValidToken } from '../platform/auth.js'

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.header('Authorization')
  const bearerToken = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
  const token = bearerToken || (req.query.token as string | undefined)

  if (!isValidToken(token)) {
    res.status(401).json({ detail: 'Unauthorized' })
    return
  }
  next()
}
