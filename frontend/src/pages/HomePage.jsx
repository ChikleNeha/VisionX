import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { API } from '../utils/api'

export default function HomePage() {
  const { saveUsername, stt } = useApp()
  const [phase, setPhase]   = useState('wait')
  const [name, setName]     = useState('')
  const [typed, setTyped]   = useState('')
  const [status, setStatus] = useState('')
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const audio    = useRef(new Audio()).current

  // Pre-fetch intro audio blob on page load so it's ready when user clicks
  const preFetchedIntroRef = useRef(null)
  const INTRO_TEXT = 'Namaste! AccessCode mein swagat hai. Apna naam boliye. Main sun raha hoon.'

  useEffect(() => {
    // Start fetching in background immediately on mount
    fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: INTRO_TEXT, speed: 1.0 })
    })
      .then(r => r.blob())
      .then(blob => { preFetchedIntroRef.current = blob })
      .catch(() => {})   // silent — will fetch again on click if needed
  }, [])

  const speak = (text) => new Promise(async (resolve) => {
    try {
      // Use pre-fetched blob if text matches intro and blob is ready
      let blob = null
      if (text === INTRO_TEXT && preFetchedIntroRef.current) {
        blob = preFetchedIntroRef.current
        preFetchedIntroRef.current = null  // use once
      } else {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, speed: 1.0 })
        })
        blob = await res.blob()
      }
      const url  = URL.createObjectURL(blob)
      audio.src  = url
      audio.volume = 1
      audio.onended = () => { URL.revokeObjectURL(url); resolve() }
      audio.onerror = () => { URL.revokeObjectURL(url); resolve() }
      audio.play().catch(() => resolve())
    } catch { resolve() }
  })

  const openNameMic = () => {
    setPhase('listening')
    let timeLeft = 5
    setStatus(`${timeLeft} seconds mein naam boliye...`)

    const countdown = setInterval(() => {
      timeLeft -= 1
      if (timeLeft > 0) setStatus(`${timeLeft} seconds baaki hain...`)
      else setStatus('Processing...')
    }, 1000)

    const autoSubmit = setTimeout(() => {
      clearInterval(countdown)
      stt.stopListening()
    }, 5000)

    stt.startListening((transcript) => {
      clearTimeout(autoSubmit)
      clearInterval(countdown)
      if (!transcript.trim()) {
        setStatus('Kuch suna nahi. Naam type karo.')
        setTimeout(() => inputRef.current?.focus(), 100)
        return
      }
      const n = transcript.trim()
      stt.stopListening()
      setName(n)
      setPhase('confirm')
      speak(`Maine suna: ${n}. Sahi hai? Enter dabao confirm karne ke liye.`)
    })
  }

  const handleConfirm = async () => {
    const n = (name || typed).trim()
    if (!n) return
    audio.pause()
    setPhase('done')
    try { await API.createUser(n) } catch {}
    saveUsername(n)
    await speak(`Swagat hai ${n}! Lesson shuru ho rahi hai.`)
    sessionStorage.setItem('ac_audio_unlocked', 'true')
    navigate('/learn')
  }

  const handleRetry = async () => {
    setName('')
    setTyped('')
    await speak('Dobara boliye. Aapka naam kya hai?')
    openNameMic()
  }

  // THE gesture handler
  const handleStart = () => {
    audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
    audio.volume = 0
    const p = audio.play()
    setPhase('loading')
    setStatus('Intro load ho rahi hai...')

    p.then(() => {
      audio.volume = 1
      // Use pre-fetched blob — should play almost immediately
      speak(INTRO_TEXT).then(() => openNameMic())
    }).catch(() => {
      audio.volume = 1
      speak('Namaste! Apna naam boliye.')
        .then(() => openNameMic())
        .catch(() => openNameMic())
    })
  }

  useEffect(() => {
    const h = (e) => {
      if (phase === 'wait' && (e.code === 'Space' || e.key === 'Enter')) {
        e.preventDefault(); handleStart()
      }
      if (phase === 'confirm') {
        if (e.key === 'Enter') { e.preventDefault(); handleConfirm() }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); handleRetry() }
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [phase, name, typed])

  return (
    <main className="min-h-screen bg-ink flex flex-col items-center justify-center px-6"
      role="main" aria-live="polite">

      <div className="fixed inset-0 opacity-5 pointer-events-none" aria-hidden="true"
        style={{ backgroundImage: 'linear-gradient(#00e5a020 1px,transparent 1px),linear-gradient(90deg,#00e5a020 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative z-10 w-full max-w-sm text-center space-y-6">

        <h1 className="font-display text-5xl font-extrabold text-text mb-2">
          Access<span className="text-accent">Code</span>
        </h1>
        <p className="text-muted text-sm">Python for Everyone — voice-first</p>

        {/* WAIT */}
        {phase === 'wait' && (
          <div className="card space-y-4 animate-fade-in">
            <p className="text-text font-medium">Namaste 🙏</p>
            <p className="text-muted text-sm">
              <kbd className="bg-surface border border-border rounded px-2 font-mono text-accent">Space</kbd>{' '}
              ya button dabao shuru karne ke liye
            </p>
            <button autoFocus onClick={handleStart}
              className="btn-primary w-full text-lg py-4"
              aria-label="Shuru karo — Space ya Enter dabao">
              🔊 Shuru Karo
            </button>
          </div>
        )}

        {/* LOADING */}
        {phase === 'loading' && (
          <div className="card space-y-3 animate-fade-in" role="status">
            <div className="flex justify-center">
              <div className="flex items-end gap-0.5 h-10" aria-hidden="true">
                {[...Array(7)].map((_, i) => (
                  <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
            <p className="text-accent text-sm">{status}</p>
          </div>
        )}

        {/* LISTENING */}
        {phase === 'listening' && (
          <div className="card space-y-4 animate-fade-in">
            <div className="flex justify-center">
              <div className="relative w-24 h-24">
                <span className="absolute inset-0 rounded-full border-2 border-accent animate-ripple" aria-hidden="true" />
                <span className="absolute inset-0 rounded-full border-2 border-accent animate-ripple" style={{ animationDelay: '0.6s' }} aria-hidden="true" />
                <div className="w-full h-full rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center text-4xl listening-pulse">🎤</div>
              </div>
            </div>
            <p className="text-accent text-sm font-medium" role="status">{status}</p>
            {stt.transcript && <p className="text-text text-sm">"{stt.transcript}"</p>}
            <div className="flex gap-2">
              <input
                id="name-input"
                ref={inputRef}
                type="text"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && typed.trim()) {
                    stt.stopListening()
                    setName(typed.trim())
                    setPhase('confirm')
                    await speak(`Maine padha: ${typed.trim()}. Sahi hai?`)
                  }
                }}
                placeholder="Ya type karo..."
                aria-label="Naam type karo"
                className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-text
                           placeholder-muted focus:border-accent focus:outline-none font-body text-sm"
              />
              <button onClick={async () => {
                if (!typed.trim()) return
                stt.stopListening(); setName(typed.trim()); setPhase('confirm')
                await speak(`Maine padha: ${typed.trim()}. Sahi hai?`)
              }} className="btn-primary px-4">→</button>
            </div>
          </div>
        )}

        {/* CONFIRM */}
        {phase === 'confirm' && (
          <div className="card space-y-4 animate-fade-in">
            <p className="text-muted text-sm">Aapka naam:</p>
            <p className="font-display text-4xl font-bold text-accent">{name || typed}</p>
            <p className="text-muted text-xs">
              <kbd className="bg-surface border border-border rounded px-2 font-mono text-accent">Enter</kbd> confirm ·{' '}
              <kbd className="bg-surface border border-border rounded px-2 font-mono text-accent">R</kbd> retry
            </p>
            <div className="flex gap-3">
              <button onClick={handleRetry} className="btn-ghost flex-1">🔁 Dobara</button>
              <button onClick={handleConfirm} className="btn-primary flex-1" autoFocus>✅ Confirm</button>
            </div>
          </div>
        )}

        {/* DONE */}
        {phase === 'done' && (
          <div className="card text-center animate-fade-in" role="status">
            <div className="flex justify-center mb-3">
              <div className="flex items-end gap-0.5 h-8" aria-hidden="true">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
            <p className="text-accent font-medium">Lesson shuru ho rahi hai...</p>
          </div>
        )}

      </div>
    </main>
  )
}