import { useState, useRef, useCallback } from 'react'
import axios from 'axios'

// ── Autoplay unlock ────────────────────────────────────────────────────────
let _unlockPromise = null
let _unlocked = false

function _getUnlockPromise() {
  if (_unlocked) return Promise.resolve()
  if (_unlockPromise) return _unlockPromise
  const audio = new Audio()
  audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
  audio.volume = 0
  _unlockPromise = audio.play()
    .then(() => { audio.pause(); _unlocked = true })
    .catch(() => { _unlockPromise = null })
  return _unlockPromise
}

export function unlockAudio() { return _getUnlockPromise() }

if (typeof window !== 'undefined') {
  const h = () => _getUnlockPromise()
  window.addEventListener('keydown',    h, { capture: true })
  window.addEventListener('click',      h, { capture: true })
  window.addEventListener('touchstart', h, { capture: true })
  window.addEventListener('pointerdown', h, { capture: true })
}
// ──────────────────────────────────────────────────────────────────────────

let _isSpeakingNow = false
export function isSpeakingNow() { return _isSpeakingNow }

export function waitUntilDone(maxWaitMs = 60000) {
  return new Promise(resolve => {
    if (!_isSpeakingNow) { resolve(); return }
    const start = Date.now()
    const check = setInterval(() => {
      if (!_isSpeakingNow || Date.now() - start > maxWaitMs) {
        clearInterval(check); resolve()
      }
    }, 200)
  })
}

function splitChunks(text, maxLen = 800) {
  if (text.length <= maxLen) return [text]
  const sentences = text.split(/(?<=[।.!?])\s+/)
  const chunks = []
  let cur = ''
  for (const s of sentences) {
    if ((cur + ' ' + s).trim().length <= maxLen) {
      cur = (cur + ' ' + s).trim()
    } else {
      if (cur) chunks.push(cur)
      cur = s
    }
  }
  if (cur) chunks.push(cur)
  return chunks.length ? chunks : [text.slice(0, maxLen)]
}

export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [rate, setRate] = useState(1.0)
  const audioRef     = useRef(null)
  const abortRef     = useRef(null)
  const cancelledRef = useRef(false)

  const _setSpeaking = useCallback((val) => {
    _isSpeakingNow = val
    setIsSpeaking(val)
  }, [])

  const stop = useCallback(() => {
    cancelledRef.current = true
    // Pause and fully detach current audio element
    if (audioRef.current) {
      const a = audioRef.current
      audioRef.current = null  // clear ref FIRST so onerror/onended don't fire
      a.pause()
      a.src = ''
      a.load()                 // forces browser to release the media resource
    }
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    _isSpeakingNow = false
    setIsSpeaking(false)
  }, [])

  // Play a single blob — creates a fresh Audio element every time
  const _playBlob = useCallback((blob, currentRate) => new Promise((resolve) => {
    // Don't start if cancelled
    if (cancelledRef.current) { resolve(); return }

    const url   = URL.createObjectURL(blob)
    const audio = new Audio()  // fresh element — no src='' contamination

    audio.playbackRate = Math.max(0.5, Math.min(2.0, currentRate))
    audioRef.current   = audio

    const cleanup = () => {
      URL.revokeObjectURL(url)
      if (audioRef.current === audio) audioRef.current = null
    }

    audio.onended = () => { cleanup(); resolve() }
    audio.onerror = () => {
      const code = audio.error?.code
      // Code 4 = MEDIA_ELEMENT_ERROR: Empty src — happens on stop(), ignore completely
      // Code 3 = MEDIA_ERR_DECODE — bad audio data
      // Code 2 = MEDIA_ERR_NETWORK — network issue
      if (code && code !== 4) {
        console.error('[TTS] audio error:', code, audio.error?.message)
      }
      cleanup(); resolve()
    }

    // Set src AFTER attaching listeners
    audio.src = url
    audio.load()

    // play() called synchronously here — audio context already unlocked
    audio.play()
      .then(() => console.log('[TTS] playing chunk'))
      .catch(e => {
        console.error('[TTS] play() failed:', e.name)
        if (e.name === 'NotAllowedError') {
          // One retry after short delay
          setTimeout(() => {
            if (!cancelledRef.current) {
              audio.play()
                .then(() => console.log('[TTS] retry ok'))
                .catch(() => { cleanup(); resolve() })
            } else {
              cleanup(); resolve()
            }
          }, 150)
        } else {
          cleanup(); resolve()
        }
      })
  }), [])

  const speak = useCallback(async (text) => {
    if (!text?.trim()) return
    stop()
    cancelledRef.current = false

    const chunks      = splitChunks(text)
    const currentRate = rate
    console.log(`[TTS] speaking ${chunks.length} chunk(s), total ${text.length} chars`)

    _setSpeaking(true)

    for (let i = 0; i < chunks.length; i++) {
      if (cancelledRef.current) break

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const response = await axios.post(
          '/api/tts',
          { text: chunks[i], speed: currentRate },
          { responseType: 'blob', signal: controller.signal }
        )

        if (cancelledRef.current) break

        const blob = response.data
        if (!blob || blob.size < 100) {
          console.warn(`[TTS] chunk ${i + 1} blob too small, skipping`)
          continue
        }

        await _playBlob(blob, currentRate)

      } catch (err) {
        const cancelled = err.name === 'AbortError'
                       || err.name === 'CanceledError'
                       || axios.isCancel(err)
        if (cancelled || cancelledRef.current) break
        console.error(`[TTS] chunk ${i + 1} fetch failed:`, err.message)
      }
    }

    if (!cancelledRef.current) {
      _isSpeakingNow = false
      setIsSpeaking(false)
    }
  }, [rate, stop, _setSpeaking, _playBlob])

  return { speak, stop, isSpeaking, rate, setRate }
}