# Voice Assistant — implementation plan (decided, not yet built)

## Goal
A voice interface for Pitstop with two surfaces:
1. **A dedicated "Ask [name]" page** — open-ended spoken questions about the whole database (status, recent runs, campaign performance, anything), Siri-style.
2. **Voice added to the existing per-report "Ask about this" panel** — the same panel already replies as a specific agent (Anna/Rico/Sammy), scoped to one report output.

Both are being built together, not staged — this doc is the implementation brief for both.

## Architecture: text-first, TTS at the end — not speech-to-speech

Two real options exist:
- **Cascaded (decided):** STT → existing text agent (Anna/Rico/Sammy/Ciri as they are today, plus a new general-purpose agent for surface 1) → TTS on the final text.
- **Native speech-to-speech** (e.g. a realtime audio-in/audio-out model): lower latency, more conversational, but no text artifact to hand to a critic before it's spoken.

Pitstop's core value prop is Ciri's critic loop — every agent's output gets graded and revised *as text* before it's considered final (see `PROJECT.md`, `backend/src/agents/criticLoop.ts`). A speech-to-speech model bypasses that entirely: there's nothing for Ciri to review. So cascaded is required to keep the existing quality-control architecture intact. TTS only runs once text is already final/approved.

## STT/TTS provider: ElevenLabs

Decided over the Web Speech API (Chrome-only in practice, unreliable on Safari/Firefox) and over routing through Sumopod (Pitstop's existing OpenAI-compatible AI gateway — not used here because STT/TTS support there was unconfirmed; ElevenLabs is a direct, dedicated integration instead). `ELEVENLABS_API_KEY` is already in `.env`.

Endpoint shapes (pulled from `elevenlabs.io/docs/api-reference` — confirm against the real account/docs before implementing, since exact model/voice availability depends on the account behind the key):

- **TTS**: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`, header `xi-api-key: <key>`, JSON body `{text, model_id}` (default model `eleven_multilingual_v2` — matters since reports can be English or Indonesian per the existing `report_language` setting), returns raw audio bytes (default `mp3_44100_128`).
- **STT**: `POST https://api.elevenlabs.io/v1/speech-to-text`, same `xi-api-key` header, multipart form upload with the audio in a field named `file`, body also needs `model_id` (e.g. `scribe_v2`), returns transcript text (+ optional language detection/timestamps, not needed here).

The API key must never reach the frontend — everything routes through the backend, same as every other credential in this app (`.env` is the trust boundary, same pattern as `SUMOPOD_API_KEY`, `AUTH_PASSWORD`, etc.).

## Part A — TTS + STT proxy endpoints (per-report Ask panel)

1. **New endpoint `POST /tts`** — body `{ text: string, agentType: 'analysis' | 'recommendation' | 'summary' | 'assistant' }`. Looks up a voice_id per `agentType` from a small config map, calls ElevenLabs TTS server-side, returns the audio bytes with the right `Content-Type` (e.g. `audio/mpeg`). Include `'assistant'` as a fourth agentType from the start, for Part B's new agent.

2. **Voice mapping** — call `GET https://api.elevenlabs.io/v1/voices` (same `xi-api-key` header) to see what's actually available on the account, then assign:
   - `recommendation` (Rico) → a male voice
   - `analysis` (Anna) → a female voice
   - `summary` (Sammy) → implementer's call — report which gender/voice was picked and why
   - `assistant` (new agent, Part B) → implementer's call, report the choice

   Record the exact voice names + IDs chosen somewhere durable (voice libraries change over time) — either in code comments or back in this doc once decided.

3. **New endpoint `POST /stt`** — accepts the multipart audio upload, proxies to ElevenLabs STT, returns `{ text: string }`. Behind the existing `authMiddleware` (not a public route like `/health`/`/config`/`/auth/*`).

## Part B — General-purpose "Ask [assistant]" agent + endpoint (dedicated page)

New capability, not an extension of the existing `/ask` (`backend/src/reporting/ask.ts`) — today's only answers questions scoped to one specific report's `output_id`, deliberately, to keep answers grounded in exactly what that agent already wrote. This new agent needs broader access: current campaign performance, system health, recent pipeline runs, recent report history — not just one output's text.

1. **New agent module**, e.g. `backend/src/agents/assistant.ts` — name/persona consistent with Anna/Rico/Sammy/Ciri, implementer's call, report what was chosen. Reuse `SHARED_GUARDRAILS` from `agents/prompts.ts`. System prompt should state its scope explicitly: anything backed by real data reachable from this backend (campaigns, performance, system/pipeline status, past reports), same "no fabrication, cite real numbers, no write access to live campaigns" guardrails every other agent already follows.

2. **Context-gathering** — reuse existing utilities rather than rebuilding:
   - `buildPerformanceContext()` (`backend/src/data/context.ts`) for campaign/segment data.
   - Whatever backs `GET /system-health` (in `routes/pipeline.ts`) for pipeline/run status.
   - Recent report history — reuse whatever `GET /reports?period=daily` already queries, summarized over the last several days.

   Assemble into one context blob for the new agent, similar to how `ask.ts` builds `reportContext` today.

3. **New endpoint `POST /assistant/ask`** — body `{ question: string }`, no `output_id` (not scoped to one report). Behind `authMiddleware`.

4. **Logging/history** — `ask_log.output_id` is `NOT NULL REFERENCES ai_outputs(id)` (see `schema.sql`), which doesn't fit a question with no specific output. Don't force this into the existing table. Either:
   - A new table (e.g. `assistant_ask_log`) with no `output_id` dependency, or
   - Make `ask_log.output_id` nullable and add a way to distinguish general questions.

   Implementer's call which is cleaner — report which was picked. If a new table, update `schema.sql` and provide the migration SQL to run against the live DB (same pattern as the `ask_log` agent_type constraint fix already done for making Anna askable).

## Deployment

Same constraint as every other backend change so far: no git access on the VPS. Whoever implements this needs to report back:
- Confirmation of the ElevenLabs endpoint details against the real docs/account.
- The chosen voice mapping (voice name + ID per agent, including the new assistant agent) and the new agent's name/persona.
- Full contents of every new/changed file.
- Any new/changed SQL as a separate migration block.
- `npm run build` output and manual verification: real TTS audio returned for at least two different voices, a real STT call transcribing a short test clip correctly, and a real `/assistant/ask` question answered with grounded data (not hallucinated), logged correctly.

## Frontend (not started)

Once the backend above is live:
- Per-report Ask panel (`frontend/src/shared/report/AskPanel.vue`, `useAskPanel.ts`) gets a mic button (STT in) and auto-plays the TTS audio for each answer, using the section's own `agentType` for voice selection.
- New dedicated page + route for the general-purpose assistant, following the same page/composable/i18n conventions as every other page in `frontend/src/features/`.
