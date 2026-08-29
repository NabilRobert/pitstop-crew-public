// ElevenLabs STT/TTS client — direct integration, not routed through
// Sumopod (STT/TTS support there was unconfirmed at decision time; see
// docs/VOICE_ASSISTANT.md). The API key never reaches the frontend —
// every call here runs server-side, same trust boundary as every other
// credential in this app.

import { ELEVENLABS_API_KEY } from './config.js'

const BASE_URL = 'https://api.elevenlabs.io/v1'

// eleven_multilingual_v2 (not an English-only model) — reports can be
// English or Indonesian per the existing report_language setting, and
// the assistant/ask answers follow the same setting.
const TTS_MODEL = 'eleven_multilingual_v2'
// 'scribe_v1' confirmed live with a real 200 response (the doc that
// specced this said 'scribe_v2', which doesn't appear to be a real model
// id — models_read still isn't granted on this key so the full model
// list couldn't be listed, but scribe_v1 itself works).
const STT_MODEL = 'scribe_v1'

function requireApiKey(): string {
  if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set — add it to .env')
  return ELEVENLABS_API_KEY
}

// Returns the raw Response instead of a fully-buffered Buffer — routes/
// voice.ts pipes response.body straight through to the client instead of
// waiting for the whole thing first. Buffering here made the two legs
// (ElevenLabs -> this backend, this backend -> frontend) strictly
// sequential instead of overlapped; streaming collapses them into one.
export async function textToSpeech(text: string, voiceId: string): Promise<Response> {
  const key = requireApiKey()
  const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: TTS_MODEL }),
  })
  if (!response.ok) {
    throw new Error(`ElevenLabs TTS failed: ${response.status} ${await response.text()}`)
  }
  return response
}

export async function speechToText(
  audio: Buffer,
  filename: string,
  mimeType: string,
  languageCode?: string
): Promise<string> {
  const key = requireApiKey()
  const form = new FormData()
  form.append('model_id', STT_MODEL)
  // Pinning this (our own 'en'/'id' work directly — ElevenLabs normalizes
  // to ISO-639-3 itself, confirmed live) avoids relying on auto-detection,
  // which is unreliable on short or noisy audio (confirmed live: a plain
  // tone auto-detected as Serbo-Croatian at 40% confidence). Without this,
  // real mic audio has a real chance of a bad language guess corrupting
  // the transcript itself, on top of the separate languageInstruction()
  // issue this was found alongside — see prompts.ts.
  if (languageCode) form.append('language_code', languageCode)
  // Buffer satisfies BlobPart at runtime (it's a Uint8Array), but its type
  // declares a SharedArrayBuffer-compatible backing store that BlobPart's
  // stricter ArrayBuffer-only signature rejects — hence the cast.
  form.append('file', new Blob([audio as unknown as ArrayBuffer], { type: mimeType }), filename)
  const response = await fetch(`${BASE_URL}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
  })
  if (!response.ok) {
    throw new Error(`ElevenLabs STT failed: ${response.status} ${await response.text()}`)
  }
  const data = (await response.json()) as { text: string }
  return data.text
}
