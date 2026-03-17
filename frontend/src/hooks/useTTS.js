import { useState, useRef, useCallback } from 'react'
import axios from 'axios'

// ── Autoplay unlock ────────────────────────────────────────────────────────
// Browsers block audio.play() until a user gesture has occurred.
// We store a Promise that resolves once unlock succeeds.
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
    .catch(() => {
      // Gesture not yet received — reset so next gesture retries
      _unlockPromise = null
    })

  return _unlockPromise
}

// Call on any user gesture — fires the unlock and returns a Promise
export function unlockAudio() {
  return _getUnlockPromise()
}

// Auto-attach to all gesture events so unlock happens on first interaction
if (typeof window !== 'undefined') {
  const h = () => _getUnlockPromise()
  window.addEventListener('keydown',    h, { capture: true })
  window.addEventListener('click',      h, { capture: true })
  window.addEventListener('touchstart', h, { capture: true })
  window.addEventListener('pointerdown', h, { capture: true })
}
// ──────────────────────────────────────────────────────────────────────────

// Module-level speaking flag — readable anywhere without React state
let _isSpeakingNow = false
export function isSpeakingNow() { return _isSpeakingNow }

// Wait until audio finishes — polls every 200ms
export function waitUntilDone(maxWaitMs = 60000) {
  return new Promise(resolve => {
    if (!_isSpeakingNow) { resolve(); return }
    const start = Date.now()
    const check = setInterval(() => {
      if (!_isSpeakingNow || Date.now() - start > maxWaitMs) {
        clearInterval(check)
        resolve()
      }
    }, 200)
  })
}

export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [rate, setRate] = useState(1.0)
  const audioRef  = useRef(null)
  const abortRef  = useRef(null)

  const _setSpeaking = useCallback((val) => {
    _isSpeakingNow = val
    setIsSpeaking(val)
  }, [])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    _isSpeakingNow = false
    setIsSpeaking(false)
  }, [])

  const speak = useCallback(async (text) => {
    if (!text?.trim()) return
    stop()

    const controller = new AbortController()
    abortRef.current = controller
    _setSpeaking(true)

    console.log('[TTS] speak() called, text length:', text.length)

    try {
      // Fetch audio bytes from backend
      const response = await axios.post(
        '/api/tts',
        { text, speed: rate },
        { responseType: 'blob', signal: controller.signal }
      )

      if (controller.signal.aborted) return

      const blob = response.data
      console.log('[TTS] blob received, size:', blob?.size, 'type:', blob?.type)

      if (!blob || blob.size < 100) throw new Error(`TTS blob too small: ${blob?.size}b`)

      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.playbackRate = Math.max(0.5, Math.min(2.0, rate))
      audioRef.current = audio

      audio.onended = () => {
        console.log('[TTS] audio ended')
        _isSpeakingNow = false
        setIsSpeaking(false)
        URL.revokeObjectURL(url)
        audioRef.current = null
      }
      audio.onerror = (e) => {
        console.error('[TTS] audio element error:', audio.error)
        _isSpeakingNow = false
        setIsSpeaking(false)
        URL.revokeObjectURL(url)
        audioRef.current = null
      }

      // ── Wait for unlock to complete BEFORE calling play() ─────────────────
      // This is the key fix: we await the unlock promise so play() is called
      // only after the browser has confirmed audio is permitted.
      try {
        await _getUnlockPromise()
      } catch {
        // unlock failed — attempt play anyway, may work if user already interacted
      }

      if (controller.signal.aborted) return

      console.log('[TTS] calling audio.play()...')
      try {
        await audio.play()
        console.log('[TTS] audio.play() succeeded')
        // speak() resolves here — audio IS playing
      } catch (playErr) {
        console.error('[TTS] play() failed:', playErr.name, playErr.message)
        _isSpeakingNow = false
        setIsSpeaking(false)

        if (playErr.name === 'NotAllowedError') {
          // One final retry after a short wait
          console.log('[TTS] retrying after 200ms...')
          await new Promise(r => setTimeout(r, 200))
          if (!controller.signal.aborted) {
            try {
              await audio.play()
              _isSpeakingNow = true
              setIsSpeaking(true)
              console.log('[TTS] retry succeeded')
            } catch (e2) {
              console.error('[TTS] retry also failed:', e2.message)
              _setSpeaking(false)
              URL.revokeObjectURL(url)
            }
          }
        } else {
          throw playErr
        }
      }

    } catch (err) {
      const cancelled = err.name === 'AbortError'
                     || err.name === 'CanceledError'
                     || axios.isCancel(err)
      if (!cancelled) console.error('[TTS] error:', err.message)
      else console.log('[TTS] cancelled (intentional stop)')
      _isSpeakingNow = false
      setIsSpeaking(false)
    }
  }, [rate, stop, _setSpeaking])

  return { speak, stop, isSpeaking, rate, setRate }
}