// Gates every route mounted after it in main.ts. Reads the token from the
// Authorization header, falling back to a ?token= query param — the only
// way EventSource (used by /console/stream) can carry auth, since it can't
// set custom headers. Puts the token's role on res.locals.role.
import type { Request, Response, NextFunction } from 'express'
import { getRole } from '../platform/auth.js'

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.header('Authorization')
  const bearerToken = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
  const token = bearerToken || (req.query.token as string | undefined)

  const role = getRole(token)
  if (!role) {
    res.status(401).json({ detail: 'Unauthorized' })
    return
  }
  res.locals.role = role
  next()
}

// GET routes that return the owner's private state rather than dashboard
// data. Demo tokens can't read them (the rest of the GETs are read-only views
// of the same data the demo shows).
const DEMO_BLOCKED_GET = [/^\/assistant(\/|$)/, /^\/outputs\/[^/]+\/ask-conversations(\/|$)/, /^\/ask-conversations(\/|$)/]

/** Mounted right after authMiddleware. A demo token is read-only: anything
 * other than GET/HEAD is refused (deny-by-default, so a write endpoint added
 * later is protected without touching this), plus the GET routes above. */
export function demoReadOnly(req: Request, res: Response, next: NextFunction) {
  if (res.locals.role !== 'demo') return next()
  const readOnlyMethod = req.method === 'GET' || req.method === 'HEAD'
  if (!readOnlyMethod || DEMO_BLOCKED_GET.some((re) => re.test(req.path))) {
    res.status(403).json({ detail: 'This demo account is read-only.' })
    return
  }
  next()
}
