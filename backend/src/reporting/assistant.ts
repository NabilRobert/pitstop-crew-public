// Ask Aska feature — general Q&A not scoped to one report output, backing
// the dedicated assistant page. Mirrors reporting/ask.ts's conversation
// threading as closely as possible: a question belongs to a conversation
// thread (assistant_conversations/assistant_ask_log.conversation_id), and
// within a thread prior Q&A is folded back into the prompt so a follow-up
// has an antecedent. The one structural difference from ask.ts is that
// there's no output_id to scope conversations by — Aska isn't tied to a
// single report, so there's just one flat list of threads, not one list
// per output.

import * as aska from '../agents/assistant.js'
import { buildPerformanceContext } from '../data/context.js'
import * as pipelineRuns from '../pipeline/pipelineRuns.js'
import { listReportDates } from './reporting.js'
import { getSettings, isValidLanguage } from '../platform/settings.js'
import { query, queryOne } from '../data/db.js'

const RECENT_REPORTS_LIMIT = 5
const PERFORMANCE_WINDOW_DAYS = 30

// How many of the conversation's most recent exchanges get folded into the
// prompt as history — same rationale and value as ask.ts's HISTORY_LIMIT.
const HISTORY_LIMIT = 10

export interface AssistantConversation {
  id: number
  title: string | null
  created_at: string
  updated_at: string
}

export async function listConversations() {
  return query<Pick<AssistantConversation, 'id' | 'title' | 'created_at' | 'updated_at'>>(
    'SELECT id, title, created_at, updated_at FROM assistant_conversations ORDER BY updated_at DESC'
  )
}

export async function startConversation(): Promise<number> {
  const rows = await query<{ id: number }>('INSERT INTO assistant_conversations DEFAULT VALUES RETURNING id')
  return rows[0].id
}

export async function getConversationMessages(conversationId: number) {
  return query(
    'SELECT id, question, answer, created_at FROM assistant_ask_log WHERE conversation_id = $1 ORDER BY created_at',
    [conversationId]
  )
}

/** Returns null if the conversation doesn't exist (the route maps that to
 * 404), rather than throwing like askAssistant() does for the same
 * situation — that one folds into a generic 400 catch-all, but a rename's
 * "no such thread" is unambiguously a 404 case. Bumps updated_at on
 * rename, same as asking a question in the thread does — a "touch," so a
 * just-renamed thread surfaces at the top under the sidebar's default
 * most-recent sort. */
export async function renameConversation(conversationId: number, title: string): Promise<AssistantConversation | null> {
  const rows = await query<AssistantConversation>(
    'UPDATE assistant_conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, title, created_at, updated_at',
    [title, conversationId]
  )
  return rows[0] ?? null
}

/** Returns whether a conversation actually existed to delete (the route
 * maps false to 404), same shape as renameConversation's null-on-missing.
 * assistant_ask_log.conversation_id has no ON DELETE CASCADE, so its rows
 * for this thread are deleted first — unconditionally, since a DELETE
 * matching zero rows (an empty, never-asked thread) is a harmless no-op —
 * before the conversation row itself. */
export async function deleteConversation(conversationId: number): Promise<boolean> {
  await query('DELETE FROM assistant_ask_log WHERE conversation_id = $1', [conversationId])
  const rows = await query<{ id: number }>('DELETE FROM assistant_conversations WHERE id = $1 RETURNING id', [
    conversationId,
  ])
  return rows.length > 0
}

async function buildAssistantContext(): Promise<string> {
  const performanceData = await buildPerformanceContext({ days: PERFORMANCE_WINDOW_DAYS })

  const lastDaily = await pipelineRuns.getLastSuccessfulRun('daily')
  const recentRuns = await pipelineRuns.getRecentRuns(undefined, 10)
  const systemHealth = `Last successful daily run: ${JSON.stringify(lastDaily)}\nRecent pipeline runs: ${JSON.stringify(recentRuns)}`

  const recentDaily = (await listReportDates('daily')).slice(0, RECENT_REPORTS_LIMIT)
  const recentWeekly = (await listReportDates('weekly')).slice(0, RECENT_REPORTS_LIMIT)
  const reportHistory = `Recent daily reports:\n${JSON.stringify(recentDaily)}\n\nRecent weekly reports:\n${JSON.stringify(recentWeekly)}`

  return `Campaign/segment performance (last ${PERFORMANCE_WINDOW_DAYS} days):\n${performanceData}\n\nSystem/pipeline health:\n${systemHealth}\n\nRecent report history:\n${reportHistory}`
}

/** Folds the conversation's own recent history into the prompt as a plain
 * transcript — same pattern as ask.ts's buildConversationTranscript, so
 * this needed no changes to agents/assistant.ts's answerQuestion signature. */
async function buildConversationTranscript(conversationId: number): Promise<string> {
  const rows = await query<{ question: string; answer: string }>(
    'SELECT question, answer FROM assistant_ask_log WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2',
    [conversationId, HISTORY_LIMIT]
  )
  if (rows.length === 0) return ''
  const chronological = rows.reverse()
  const transcript = chronological.map((r, i) => `Q${i + 1}: ${r.question}\nA${i + 1}: ${r.answer}`).join('\n\n')
  return `Conversation so far (most recent ${chronological.length} exchange(s) in this thread):\n${transcript}\n\n`
}

// language is the live UI's current locale, same rationale as ask.ts's
// ask() — falls back to the report_language Settings value only when the
// caller doesn't provide one.
export async function askAssistant(conversationId: number, question: string, language?: string): Promise<number> {
  const conversation = await queryOne<AssistantConversation>('SELECT * FROM assistant_conversations WHERE id = $1', [
    conversationId,
  ])
  if (conversation === null) throw new Error(`No assistant_conversations row with id=${conversationId}`)

  const conversationTranscript = await buildConversationTranscript(conversationId)
  const context = `${conversationTranscript}${await buildAssistantContext()}`

  const validLanguage = language !== undefined && isValidLanguage(language) ? language : undefined
  const resolvedLanguage = validLanguage ?? (await getSettings()).report_language
  const answer = await aska.answerQuestion(context, question, resolvedLanguage)
  const askId = await logAsk(conversationId, question, answer)

  // First message in the thread sets its title; later ones just bump
  // updated_at so the conversation list can sort by most-recently-active.
  if (conversation.title === null) {
    await query('UPDATE assistant_conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
      question,
      conversationId,
    ])
  } else {
    await query('UPDATE assistant_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [conversationId])
  }

  return askId
}

async function logAsk(conversationId: number, question: string, answer: string): Promise<number> {
  const rows = await query<{ id: number }>(
    'INSERT INTO assistant_ask_log (conversation_id, question, answer) VALUES ($1, $2, $3) RETURNING id',
    [conversationId, question, answer]
  )
  return rows[0].id
}
