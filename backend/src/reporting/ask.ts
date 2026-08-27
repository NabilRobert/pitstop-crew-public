// Ask feature — on-demand Q&A against Anna, Rico, or Sammy for a given
// report, organized into conversations: a user can continue a previous
// thread or start a new one, and within a thread prior Q&A is folded back
// into the prompt so a follow-up like "how does that compare to Brand?"
// actually has an antecedent. See agents/analysis.md, agents/
// recommendation.md, and agents/summary.md, and ask_conversations/
// ask_log in schema.sql.

import * as anna from '../agents/anna.js'
import * as rico from '../agents/rico.js'
import * as sammy from '../agents/sammy.js'
import { getOutput } from './outputs.js'
import { buildPerformanceContext } from '../data/context.js'
import { getSettings, isValidLanguage } from '../platform/settings.js'
import { query, queryOne } from '../data/db.js'

const ASKABLE_AGENTS: Record<string, { answerQuestion: (ctx: string, q: string, language?: string) => Promise<string> }> = {
  analysis: anna,
  recommendation: rico,
  summary: sammy,
}

// How many of the conversation's most recent exchanges get folded into the
// prompt as history — bounds prompt size for a long-running thread. Older
// exchanges are simply dropped from context, not summarized; still
// accessible in full via getConversationMessages.
const HISTORY_LIMIT = 10

interface AskConversation {
  id: number
  output_id: number
  title: string | null
  created_at: string
  updated_at: string
}

export async function listConversations(outputId: number) {
  return query<Pick<AskConversation, 'id' | 'title' | 'created_at' | 'updated_at'>>(
    'SELECT id, title, created_at, updated_at FROM ask_conversations WHERE output_id = $1 ORDER BY updated_at DESC',
    [outputId]
  )
}

export async function startConversation(outputId: number): Promise<number> {
  const rows = await query<{ id: number }>('INSERT INTO ask_conversations (output_id) VALUES ($1) RETURNING id', [
    outputId,
  ])
  return rows[0].id
}

export async function getConversationMessages(conversationId: number) {
  return query('SELECT id, question, answer, created_at FROM ask_log WHERE conversation_id = $1 ORDER BY created_at', [
    conversationId,
  ])
}

/** Folds the conversation's own recent history into the prompt as a plain
 * transcript — reportContext is still just one string, so this needed no
 * changes to anna.ts/rico.ts/sammy.ts's answerQuestion signature. */
async function buildConversationTranscript(conversationId: number): Promise<string> {
  const rows = await query<{ question: string; answer: string }>(
    'SELECT question, answer FROM ask_log WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2',
    [conversationId, HISTORY_LIMIT]
  )
  if (rows.length === 0) return ''
  const chronological = rows.reverse()
  const transcript = chronological.map((r, i) => `Q${i + 1}: ${r.question}\nA${i + 1}: ${r.answer}`).join('\n\n')
  return `Conversation so far (most recent ${chronological.length} exchange(s) in this thread):\n${transcript}\n\n`
}

// language is the live UI's current locale (frontend TopBar toggle), not
// the report_language Settings value — those are different things that
// happened to share a name before this param existed. report_language
// governs what language the scheduled daily/weekly reports get *written*
// in (scripts/runDaily.ts, no live UI session to ask); this is what
// language a live Q&A *answer* comes back in, which should follow
// whatever the asker is looking at right now. Falls back to
// report_language only when the caller doesn't have a UI locale to give
// (e.g. an older/other caller that never passes it) — not because the two
// settings are actually the same thing.
export async function ask(outputId: number, conversationId: number, question: string, language?: string): Promise<number> {
  const output = await getOutput(outputId)
  if (output === null) throw new Error(`No ai_outputs row with id=${outputId}`)
  const agentType = output.agent_type
  const agentModule = ASKABLE_AGENTS[agentType]
  if (!agentModule) {
    throw new Error(`Only analysis/recommendation/summary outputs are askable, got '${agentType}'`)
  }

  const conversation = await queryOne<AskConversation>('SELECT * FROM ask_conversations WHERE id = $1', [
    conversationId,
  ])
  if (conversation === null) throw new Error(`No ask_conversations row with id=${conversationId}`)
  if (conversation.output_id !== outputId) {
    throw new Error(`Conversation ${conversationId} belongs to output ${conversation.output_id}, not ${outputId}`)
  }

  // db.ts returns DATE columns as raw 'YYYY-MM-DD' strings — see db.ts.
  const endDate = output.report_date ?? new Date().toISOString().slice(0, 10)
  const supportingData = await buildPerformanceContext({
    campaignId: output.campaign_id,
    segmentId: output.segment_id,
    endDate,
  })
  const conversationTranscript = await buildConversationTranscript(conversationId)
  const reportContext = `${conversationTranscript}Report:\n${output.content}\n\nUnderlying data:\n${supportingData}`

  const validLanguage = language !== undefined && isValidLanguage(language) ? language : undefined
  const resolvedLanguage = validLanguage ?? (await getSettings()).report_language
  const answer = await agentModule.answerQuestion(reportContext, question, resolvedLanguage)
  const askId = await logAsk(outputId, conversationId, agentType, question, answer)

  // First message in the thread sets its title; later ones just bump
  // updated_at so the conversation list can sort by most-recently-active.
  if (conversation.title === null) {
    await query('UPDATE ask_conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
      question,
      conversationId,
    ])
  } else {
    await query('UPDATE ask_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [conversationId])
  }

  return askId
}

async function logAsk(
  outputId: number,
  conversationId: number,
  agentType: string,
  question: string,
  answer: string
): Promise<number> {
  const rows = await query<{ id: number }>(
    'INSERT INTO ask_log (output_id, conversation_id, agent_type, question, answer) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [outputId, conversationId, agentType, question, answer]
  )
  return rows[0].id
}
