// demoReadOnly must refuse every spelling of a private path that Express would
// still route to its handler. The two match paths differently, so these tests
// run real Express routing rather than a hand-made request object.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { demoReadOnly } from './authMiddleware.js'

const PRIVATE_ROUTES = ['/trace/events/:id/payloads', '/assistant/conversations', '/outputs/:id/ask-conversations', '/ask-conversations/:id/messages']

let server: Server
let baseUrl: string

beforeAll(async () => {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.role = 'demo'
    next()
  })
  app.use(demoReadOnly)
  for (const route of PRIVATE_ROUTES) app.get(route, (_req, res) => void res.json({ reached: true }))
  app.get('/reports', (_req, res) => void res.json({ reached: true }))
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

describe('demoReadOnly', () => {
  it.each([
    '/trace/events/1/payloads',
    '/TRACE/EVENTS/1/PAYLOADS',
    '/Trace/Events/1/Payloads',
    '/trace/events/1/payloads/',
    '/TRACE/events/1/payloads/',
    '/ASSISTANT/conversations',
    '/Outputs/1/Ask-Conversations',
    '/ASK-CONVERSATIONS/1/messages',
  ])('refuses a demo token on %s', async (path) => {
    const response = await fetch(baseUrl + path)
    expect(response.status).toBe(403)
  })

  it.each(['/%74race/events/1/payloads', '/trace/events/1/%70ayloads', '//trace/events/1/payloads'])(
    'never lets %s reach a private route',
    async (path) => {
      const response = await fetch(baseUrl + path)
      expect(response.status).not.toBe(200)
    }
  )

  it('refuses HEAD on a private path in any case', async () => {
    const response = await fetch(`${baseUrl}/TRACE/events/1/payloads`, { method: 'HEAD' })
    expect(response.status).toBe(403)
  })

  it('still lets a demo token read dashboard data', async () => {
    const response = await fetch(`${baseUrl}/reports`)
    expect(response.status).toBe(200)
  })
})
