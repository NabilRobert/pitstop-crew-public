# Voice Assistant — design notes (proposal, not yet built)

## Goal
A voice interface for Pitstop with two surfaces:
1. **A dedicated "Ask [name]" page** — open-ended spoken questions about the whole database (status, recent runs, campaign performance, anything), Siri-style.
2. **Voice added to the existing per-report "Ask about this" panel** — the same panel already replies as a specific agent (Anna/Rico/Sammy), scoped to one report output.

## Architecture: text-first, TTS at the end — not speech-to-speech

Two real options exist:
- **Cascaded (recommended):** STT → existing text agent (Anna/Rico/Sammy/Ciri as they are today) → TTS on the final text.
- **Native speech-to-speech** (e.g. a realtime audio-in/audio-out model): lower latency, more conversational, but no text artifact to hand to a critic before it's spoken.

Pitstop's core value prop is Ciri's critic loop — every agent's output gets graded and revised *as text* before it's considered final (see `PROJECT.md`, `backend/src/agents/criticLoop.ts`). A speech-to-speech model bypasses that entirely: there's nothing for Ciri to review. So cascaded is not just simpler here, it's required to keep the existing quality-control architecture intact. TTS only runs once text is already final/approved.

## STT/TTS: reuse Sumopod, not the Web Speech API

The Web Speech API (`SpeechRecognition`) is Chrome-only in practice — unreliable on Safari/Firefox. Since every existing AI call in this app already routes through Sumopod (an OpenAI-compatible gateway, see `PROJECT.md` → AI layer), the better fit is:
- `MediaRecorder` (broadly supported in every browser) captures mic audio client-side.
- Uploaded audio goes to a Whisper-style transcription endpoint (via Sumopod, if it proxies one — needs confirming) for STT.
- Final agent text goes to a TTS endpoint (also via Sumopod, if available) for the spoken reply.

This avoids a new vendor/dependency and reuses infrastructure already paid for. Needs confirming Sumopod actually proxies STT/TTS endpoints before committing to this — if not, a direct OpenAI (or similar) integration is the fallback.

## Per-agent voices

Cheap once real TTS is in place — most TTS APIs ship a handful of named voices, so this is just a config map, not a custom build:
- Rico (and any other male-persona agent) → a male voice
- Anna (and any other female-persona agent) → a female voice

Since the agent identity is already known by the time TTS runs (it's whichever agent's text is being spoken), the mapping is straightforward to apply on both surfaces — the per-report panel already knows which agent it's showing, and the dedicated Ask page would need to know which agent (or a default "assistant" persona) generated each reply.

## Open questions / what's missing to build

- **The dedicated Ask page needs new backend capability.** Today `POST /ask` only answers questions scoped to one specific report's `output_id` (see `backend/src/api/routes/`). "Ask anything about the database" needs a genuinely new agent with broader query access — not a small extension of the existing endpoint.
- **Confirm Sumopod's STT/TTS support** before designing the API shape around it.
- **Scope decision for v1:** build both surfaces at once, or start with voice on the existing per-report panel (smaller lift, no new backend agent needed) and add the standalone page after?

## Recommendation

Start with voice on the existing per-report panel — it needs no new backend Q&A capability, just STT in / TTS out wrapped around the already-working `POST /ask`. Treat the dedicated "Ask [name]" page as a v2, once the broader-query backend agent it depends on is designed and built.
