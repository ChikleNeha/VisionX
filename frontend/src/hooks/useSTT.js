import { useState, useRef, useCallback, useEffect } from 'react'
import axios from 'axios'

/**
 * useSTT — records audio via MediaRecorder and transcribes via
 * Voxtral (mistral/voxtral-mini-2507) through our backend /api/stt.
 * Falls back gracefully if microphone is unavailable.
 */
export function useSTT() {
  const [transcript, setTranscript]   = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSupported]                 = useState(() => !!(navigator.mediaDevices?.getUserMedia))

  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const onResultRef      = useRef(null)
  const stoppedRef       = useRef(false)   // prevents double-submit

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsListening(false)
  }, [])

  const startListening = useCallback(async (onFinalResult) => {
    if (!isSupported) {
      console.warn('MediaRecorder not supported')
      return
    }
    onResultRef.current = onFinalResult
    stoppedRef.current  = false
    chunksRef.current   = []
    setTranscript('')

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      console.error('Microphone access denied:', err)
      return
    }

    // Pick the best supported format
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
      .find(t => MediaRecorder.isTypeSupported(t)) || ''

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      // Stop all mic tracks
      stream.getTracks().forEach(t => t.stop())
      setIsListening(false)

      if (stoppedRef.current) return   // already handled
      stoppedRef.current = true

      if (chunksRef.current.length === 0) return

      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
      if (blob.size < 500) {
        console.warn('Audio blob too small, skipping STT')
        return
      }

      console.log('[STT] Sending audio to Voxtral, size:', blob.size)

      try {
        const formData = new FormData()
        formData.append('file', blob, 'recording.webm')

        const res = await axios.post('/api/stt', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        const text = res.data.transcript?.trim()
        console.log('[STT] Voxtral transcript:', text)

        if (text) {
          setTranscript(text)
          onResultRef.current?.(text)
        }
      } catch (err) {
        console.error('[STT] Voxtral error:', err.response?.data || err.message)
      }
    }

    recorder.start()
    setIsListening(true)
    console.log('[STT] Recording started')
  }, [isSupported])

  const resetTranscript = useCallback(() => setTranscript(''), [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== 'inactive') {
        stoppedRef.current = true   // prevent submission on unmount
        mediaRecorderRef.current?.stop()
      }
    }
  }, [])

  return {
    transcript,
    isListening,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  }
}