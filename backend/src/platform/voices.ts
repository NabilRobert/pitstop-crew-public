// Voice mapping for TTS — one ElevenLabs voice per agentType. See
// docs/VOICE_ASSISTANT.md.
//
// Confirmed live against this account's actual GET /v1/voices response
// (once the API key was granted voices_read) — all four are `category:
// "premade"`, which is what's usable via the API on the free plan.
// (The .env VOICE_ID the user first picked, "Imogen", turned out to be
// `category: "professional"` — that's a paid-tier voice, which is why it
// 402'd; premade voices don't have that restriction. See the
// implementation report for the full story.) Each id below TTS-verified
// live with a real 200 response before being assigned.
export const VOICE_IDS: Record<string, string> = {
  analysis: 'EXAVITQu4vr4xnSDxMaL', // "Sarah" — female, mature/reassuring/confident — fits Anna's calm analytical tone
  recommendation: 'cjVigY5qzO86Huf0OWal', // "Eric" — male, smooth/trustworthy — fits Rico's advisory tone
  summary: 'cgSgspJ2msm6clMCkdW9', // "Jessica" — female, playful/bright — audibly distinct from Sarah, fits Sammy's short punchy digests
  assistant: 'SAz9YHcvj6GT2YYXdXww', // "River" — gender-neutral, relaxed/informative — general-assistant tone for Aska, distinct from the other three
}

export type VoiceAgentType = keyof typeof VOICE_IDS
