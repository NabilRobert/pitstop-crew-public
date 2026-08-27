# Voice Assistant — implementation notes (built, live-verified)

Companion to `VOICE_ASSISTANT.md` (the original plan). That doc describes what was
*decided*; this one describes what actually happened building it — the real
ElevenLabs account gotchas, the concrete choices made where the plan said
"implementer's call," and what was verified live versus what's still open.

## What was built

- `src/platform/elevenlabs.ts` — TTS/STT client, server-side only.
- `src/platform/voices.ts` — one voice per agent type.
- `src/agents/assistant.ts` — new agent **Aska**, the general-purpose assistant.
- `src/reporting/assistant.ts` — context assembly + logging for Aska's Q&A.
- `src/api/routes/voice.ts` — `POST /tts`, `POST /stt`.
- `src/api/routes/assistant.ts` — `POST /assistant/ask`, `GET /assistant/ask-history`.
- `assistant_ask_log` table (`db/schema.sql`).
- `VOICE_ANSWER_GUARDRAIL` in `src/agents/prompts.ts`, wired into all four
  agents' `answerQuestion` (Anna, Rico, Sammy, Aska).
- Both new routers mounted in `src/api/main.ts`, behind the existing
  `authMiddleware` like every other non-public route.

Not built: the frontend (mic button, autoplay, the new Aska page) — out of
scope per the original doc, still open.

## Architecture: cascaded, not speech-to-speech

Unchanged from the plan: STT → existing text agent → TTS on the final text.
This keeps Ciri's critic loop (`src/agents/criticLoop.ts`) intact for the
per-report Ask panel — there's still a text artifact to critique before
anything is spoken. Aska isn't part of that loop (see below), but reuses the
same cascaded shape for consistency and because there's no reason a
one-shot Q&A agent needs a different architecture.

## The ElevenLabs account, and what actually blocked things

This took several real dead ends before it worked, worth recording so the
next person doesn't repeat them:

1. **`ELEVENLABS_API_KEY` wasn't in `.env` yet** when this started, despite
   the plan saying it was — added mid-implementation.
2. **The key was created with a narrow permission scope.** ElevenLabs lets
   you grant specific permissions per key in their dashboard. This key
   initially had none of `voices_read`, `user_read`, `speech_to_text`, or
   `models_read` — only enough to *attempt* a TTS call. Every read-only
   discovery call (`GET /v1/voices`, `GET /v1/models`, `GET /v1/user`)
   came back `401 missing_permissions` until the user granted `voices_read`
   from the dashboard directly.
3. **The free plan blocks non-`premade` voices via the API.** The user's
   first pick (`VOICE_ID` in `.env`, a voice named "Imogen") returned
   `402 paid_plan_required: "Free users cannot use library voices via the
   API"` — twice, with two different voice IDs, before this was understood.
   Once `voices_read` was granted, `GET /v1/voices` showed the real
   category: Imogen is `category: "professional"` (a paid-tier voice
   despite looking like a normal pick in the ElevenLabs UI). The 21 voices
   actually shipped with the account are all `category: "premade"`, and
   those work on the free plan without any restriction — confirmed with
   real `200` responses across all four final picks.

The lesson: **`category` (`premade` vs `professional`/`library`) is what the
free plan restricts on, not "did ElevenLabs mark this as a default voice in
the UI."** If voices ever need to change again, check `category` via
`GET /v1/voices` before assuming a voice id will work.

## Voice mapping (final, confirmed live)

All four IDs below are `category: "premade"` on this account, and each one
individually round-tripped a real `200 OK` TTS call before being assigned:

| Agent | Voice | Voice ID | Why |
|---|---|---|---|
| `analysis` (Anna) | Sarah — mature, reassuring, confident | `EXAVITQu4vr4xnSDxMaL` | Calm, measured — fits Anna's analytical tone |
| `recommendation` (Rico) | Eric — smooth, trustworthy | `cjVigY5qzO86Huf0OWal` | Advisory tone, distinct gender/timbre from Anna |
| `summary` (Sammy) | Jessica — playful, bright | `cgSgspJ2msm6clMCkdW9` | Brighter/quicker than Sarah — fits short headline digests |
| `assistant` (Aska) | River — relaxed, neutral, informative | `SAz9YHcvj6GT2YYXdXww` | Gender-neutral, general-assistant tone, audibly distinct from the other three |

Source of truth: `src/platform/voices.ts`. If these ever need to change,
re-run `GET /v1/voices` (needs `voices_read` on the key) rather than reusing
IDs from older ElevenLabs documentation/blog posts — the "classic" default
voice names and IDs (Rachel, Adam, Antoni, Josh, etc.) that used to ship
with every account are **not** what this account actually has; ElevenLabs'
premade voice roster has changed since those were the well-known defaults.

## STT model

`scribe_v1` — confirmed with a real `200` response (a synthesized tone
correctly transcribed as `"[tone]"`, then a real TTS'd sentence correctly
transcribed back to text — see Verification below). The original plan
named `scribe_v2`, which doesn't appear to be a real model id; `models_read`
still isn't granted on this key, so the full model catalog couldn't be
listed to double check, but `scribe_v1` itself demonstrably works.

## Aska — the new general-purpose agent

Named **Aska** (not part of the critic loop, no "write a report" step —
one-shot Q&A only). Its system prompt (`src/agents/assistant.ts`) reuses
`SHARED_GUARDRAILS` as instructed by the original plan, but that guardrail's
"(a)/(b)" scope bullet was written for Anna/Rico/Sammy and is narrower than
Aska's actual job (it also covers system/pipeline health and report
history, not just "explaining a pattern in performance data"). Rather than
leave a silent contradiction in the prompt, Aska's system prompt has an
explicit note telling the model its own Purpose section supersedes that
narrower bullet, while the guardrail's actual intent (no chit-chat, no
coding help, no scope creep) still fully applies.

Context assembled per question (`src/reporting/assistant.ts`):
account-wide campaign/segment performance (last 30 days), system/pipeline
health (last successful daily run + 10 most recent runs), and the 5 most
recent daily + weekly report summaries. Reuses `buildPerformanceContext()`,
`pipelineRuns.getLastSuccessfulRun`/`getRecentRuns`, and
`reporting.listReportDates` — nothing new built for data access.

Model: `MODEL_FULL` (gpt-5.4), matching how Rico/Sammy's existing Ask
feature reuses their main model rather than the cheaper `MODEL_MINI`.

Logging: a new `assistant_ask_log` table, not a reuse of `ask_log` —
`ask_log.output_id` is `NOT NULL`, and a general question has no single
report output to point at. A nullable FK there would've needed its own
discriminator column just to tell "general question" from "not yet
linked," so a separate table was simpler.

## `VOICE_ANSWER_GUARDRAIL` (added mid-task, not in the original plan)

Once voice was actually working end-to-end, it became clear that an answer
which reads fine on screen can be a bad *listening* experience — reciting
every number in a breakdown out loud is tedious, and ElevenLabs' free plan
meters usage. Added a shared instruction (`src/agents/prompts.ts`) appended
to all four agents' `answerQuestion` prompts: if a question is really just
a data lookup, give the one or two numbers that matter plus a short spoken
pointer ("here's the breakdown above") instead of a full recitation; go
longer only when the question needs actual explanation or reasoning. This
touches Anna/Rico/Sammy too, since their existing Ask panel now also
optionally gets spoken via the same `/tts` endpoint.

## Endpoints

- `POST /tts` — `{ text, agentType }` → raw `audio/mpeg` bytes. `agentType`
  is one of `analysis | recommendation | summary | assistant`.
- `POST /stt` — multipart, field name `audio` → `{ text }`.
- `POST /assistant/ask` — `{ question }` → `{ ask_id, history }` (history =
  all of Aska's past Q&A, most recent 50).
- `GET /assistant/ask-history` — same history array, no new question asked.

All behind the existing `authMiddleware`, same as every other non-public
route — the ElevenLabs key never reaches the frontend.

## Verified live (production, `gads.my.id`)

- TTS: all 4 voices return real `200` audio.
- STT: a synthetic tone transcribed correctly; a full TTS→STT round trip
  (`"Clicks increased sharply on the eleventh of August."` → audio → back to
  `"Clicks increased sharply on the 11th of August"`) matched.
- `/assistant/ask`: answered a real question grounded in actual pipeline
  status and campaign data (correctly identified the last successful run,
  a prior orphaned run, and the top campaign by conversions), logged
  correctly, respected the new brevity guardrail.
- Regression check: Rico's pre-existing per-report `/ask` still works
  correctly after the guardrail change.

## Open follow-ups

- Frontend: mic button + autoplay on the existing Ask panel, and the new
  dedicated Aska page — not started.
- `models_read` still isn't granted on the API key, so the STT model
  catalog was never fully listed — `scribe_v1` works but wasn't cross-checked
  against a full list of alternatives.
- The user's original `VOICE_ID` ("Imogen") is unused now — it's a
  `professional`-tier voice, usable only on a paid ElevenLabs plan. Worth
  revisiting if the account ever upgrades and a 5th distinct voice (or a
  swap-in for one of the four) is wanted.
