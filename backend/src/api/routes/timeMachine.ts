import { Router } from 'express'
import * as timeMachine from '../../data/demo/timeMachine.js'
import { STATES } from '../../data/demo/markov.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

router.post(
  '/time-machine/override',
  asyncHandler(async (req, res) => {
    const { date, forced_state: forcedState } = req.body
    if (!STATES.includes(forcedState)) {
      res.status(400).json({ detail: `forced_state must be one of ${STATES.join(', ')}` })
      return
    }
    await timeMachine.setOverride(date, forcedState)
    res.json({ date, forced_state: forcedState })
  })
)

router.get(
  '/time-machine/overrides',
  asyncHandler(async (_req, res) => {
    const overrides = await timeMachine.getOverrides()
    res.json(Object.fromEntries(overrides))
  })
)

router.delete(
  '/time-machine/override/:date',
  asyncHandler(async (req, res) => {
    const date = req.params.date as string
    await timeMachine.clearOverride(date)
    res.json({ cleared: date })
  })
)
