// Shared by every route module — Express doesn't await async handlers on
// its own, so an unhandled rejection would otherwise crash silently
// instead of reaching the error-handling middleware in main.ts.
import type { Request, Response, NextFunction } from 'express'

export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next)
}
