// TTS/STT proxy endpoints for the voice assistant (docs/VOICE_ASSISTANT.md).
// Both routes sit behind the existing authMiddleware (mounted in main.ts
// after these routers) — the ElevenLabs key never reaches the frontend.

import { Router } from 'express'
import multer from 'multer'
import { textToSpeech, speechToText } from '../../platform/elevenlabs.js'
import { VOICE_IDS } from '../../platform/voices.js'
import { isValidLanguage } from '../../platform/settings.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

router.post(
  '/tts',
  asyncHandler(async (req, res) => {
    const { text, agentType } = req.body ?? {}
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ detail: 'text is required' })
      return
    }
    const voiceId = VOICE_IDS[agentType]
    if (!voiceId) {
      res.status(400).json({ detail: `agentType must be one of ${Object.keys(VOICE_IDS).join(', ')}, got '${agentType}'` })
      return
    }
    const audio = await textToSpeech(text, voiceId)
    res.set('Content-Type', 'audio/mpeg')
    res.send(audio)
  })
)

router.post(
  '/stt',
  upload.single('audio'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ detail: 'audio file is required (multipart field "audio")' })
      return
    }
    // Optional multipart field 'language' — the caller's current UI locale
    // ('en'/'id'), pinning ElevenLabs' STT to that language instead of
    // relying on auto-detection, which is unreliable on short/noisy real
    // mic audio (confirmed live: a plain tone auto-detected as
    // Serbo-Croatian at 40% confidence). Omitted or invalid falls back to
    // ElevenLabs' own auto-detect, same as before this existed.
    const { language } = req.body ?? {}
    const languageCode = typeof language === 'string' && isValidLanguage(language) ? language : undefined
    const text = await speechToText(
      req.file.buffer,
      req.file.originalname || 'audio',
      req.file.mimetype || 'audio/webm',
      languageCode
    )
    res.json({ text })
  })
)
