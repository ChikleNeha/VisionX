import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { API } from '../utils/api'

// Phases:
// wait       → big Space button
// asking     → "Naya user ya purana?" playing
// choice     → waiting for voice/key: N=new, P/E=existing
// new_listen → mic open for new name
// new_confirm→ confirm spoken name
// done       → navigating

export default function HomePage() {
  const { username, saveUsername, stt } = useApp()
  const [phase, setPhase]   = useState('wait')
  const [name, setName]     = useState('')
  const [typed, setTyped]   = useState('')
  const [status, setStatus] = useState('')
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const audio    = useRef(new Audio()).current

  // ── speak: fetch TTS blob and play it, returns promise ────────────────────
  const speak = (text) => new Promise(async (resolve) => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speed: 1.0 })
      })
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      audio.src  = url
      audio.volume = 1
      audio.onended = () => { URL.revokeObjectURL(url); resolve() }
      audio.onerror = () => { URL.revokeObjectURL(url); resolve() }
      audio.play().catch(() => resolve())
    } catch { resolve() }
  })

  // ── After asking "naya ya purana", listen for voice choice ────────────────
  const listenForChoice = () => {
    setPhase('choice')
    setStatus(username
      ? '"Naya" bolo naye account ke liye, ya "Purana" bolo apne account se continue karne ke liye'
      : 'Apna naam boliye — naye account ke liye')

    if (!username) {
      // No existing user — skip choice, go straight to name input
      openNameMic()
      return
    }

    // Has existing user — listen for "naya" or "purana/continue/haan"
    stt.startListening((transcript) => {
      if (!transcript.trim()) return
      stt.stopListening()
      const t = transcript.toLowerCase()
      const isNew = t.includes('naya') || t.includes('new') || t.includes('nahi') || t.includes('no')
      if (isNew) {
        handleNewUser()
      } else {
        handleExistingUser()
      }
    })
  }

  const handleExistingUser = async () => {
    stt.stopListening()
    setPhase('done')
    await speak(`Wapas swagat hai ${username}! Lesson abhi shuru hoti hai.`)
    sessionStorage.setItem('ac_audio_unlocked', 'true')
    sessionStorage.setItem('ac_audio_unlocked', 'true')
    navigate('/learn')
  }

  const handleNewUser = async () => {
    stt.stopListening()
    await speak('Theek hai! Apna naya naam boliye.')
    openNameMic()
  }

  const openNameMic = () => {
    setPhase('new_listen')
    setStatus('5 seconds mein naam boliye...')

    // Countdown display
    let timeLeft = 5
    const countdown = setInterval(() => {
      timeLeft -= 1
      if (timeLeft > 0) {
        setStatus(`${timeLeft} seconds baaki hain...`)
      }
    }, 1000)

    // After 5 seconds, stop recording — Voxtral will transcribe and fire the callback
    const autoSubmit = setTimeout(() => {
      clearInterval(countdown)
      setStatus('Processing...')
      stt.stopListening()  // triggers Voxtral → callback fires with transcript
    }, 5000)

    stt.startListening((transcript) => {
      // Fires either from early speech detection or after 5s auto-stop
      clearTimeout(autoSubmit)
      clearInterval(countdown)
      if (!transcript.trim()) {
        // Nothing heard even after Voxtral — ask to type
        setStatus('Kuch suna nahi. Naam type karo.')
        setTimeout(() => document.getElementById('name-input')?.focus(), 100)
        return
      }
      const n = transcript.trim()
      stt.stopListening()
      setName(n)
      setPhase('new_confirm')
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
    await speak('Dobara boliye. Aapka naam kya hai?')
    openNameMic()
  }

  // ── THE gesture handler — play() called synchronously ─────────────────────
  const handleStart = () => {
    // Unlock audio synchronously
    audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
    audio.volume = 0
    const p = audio.play()
    setPhase('asking')
    setStatus('Intro aa raha hai...')

    p.then(() => {
      audio.volume = 1
      const introText = username
        ? `Namaste ${username}! Kya aap apne purane account se continue karna chahte hain, ya naya account banana chahte hain? "Purana" ya "Naya" boliye.`
        : 'Namaste! AccessCode mein swagat hai. Yeh ek Python learning platform hai jo visually impaired learners ke liye banaya gaya hai. Shuru karte hain — apna naam boliye.'
      speak(introText).then(() => listenForChoice())
    }).catch(() => {
      audio.volume = 1
      speak(username
        ? `Namaste ${username}! Purana ya Naya account?`
        : 'Namaste! Apna naam boliye.'
      ).then(() => listenForChoice())
    })
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      // Wait screen
      if (phase === 'wait' && (e.code === 'Space' || e.key === 'Enter')) {
        e.preventDefault(); handleStart()
      }
      // Choice screen — N for new, P/E/Enter for existing
      if (phase === 'choice' && username) {
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); stt.stopListening(); handleNewUser() }
        if (e.key === 'p' || e.key === 'P' || e.key === 'Enter') { e.preventDefault(); stt.stopListening(); handleExistingUser() }
      }
      // Confirm screen
      if (phase === 'new_confirm') {
        if (e.key === 'Enter') { e.preventDefault(); handleConfirm() }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); handleRetry() }
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [phase, name, typed, username])

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

        {/* ASKING / LOADING */}
        {(phase === 'asking') && (
          <div className="card space-y-3 animate-fade-in" role="status">
            <div className="flex justify-center">
              <div className="flex items-end gap-0.5 h-10" aria-hidden="true">
                {[...Array(7)].map((_, i) => (
                  <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
            <p className="text-accent text-sm">{status || 'Intro aa raha hai...'}</p>
          </div>
        )}

        {/* CHOICE — only shown for returning users */}
        {phase === 'choice' && username && (
          <div className="card space-y-4 animate-fade-in">
            <p className="text-text font-medium">Wapas aaye! 👋</p>
            <p className="text-accent text-sm font-medium">{username}</p>
            <p className="text-muted text-sm">Kya karna chahte ho?</p>
            <div className="flex gap-3">
              <button
                onClick={() => { stt.stopListening(); handleExistingUser() }}
                className="btn-primary flex-1"
                autoFocus
                aria-label="Purane account se continue karo — P dabao"
              >
                ▶ Continue ({username})
              </button>
              <button
                onClick={() => { stt.stopListening(); handleNewUser() }}
                className="btn-ghost flex-1"
                aria-label="Naya account banao — N dabao"
              >
                ✨ Naya User
              </button>
            </div>
            <p className="text-muted text-xs">
              <kbd className="bg-surface border border-border rounded px-1.5 font-mono text-accent">P</kbd> purana ·{' '}
              <kbd className="bg-surface border border-border rounded px-1.5 font-mono text-accent">N</kbd> naya ·{' '}
              ya boliye
            </p>
          </div>
        )}

        {/* NEW USER — MIC OPEN */}
        {phase === 'new_listen' && (
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
              <input id="name-input" ref={inputRef} type="text" value={typed}
                onChange={e => setTyped(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && typed.trim()) {
                    stt.stopListening(); setName(typed.trim()); setPhase('new_confirm')
                    await speak(`Maine padha: ${typed.trim()}. Sahi hai?`)
                  }
                }}
                placeholder="Ya type karo..."
                aria-label="Naam type karo"
                className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-text
                           placeholder-muted focus:border-accent focus:outline-none font-body text-sm" />
              <button onClick={async () => {
                if (!typed.trim()) return
                stt.stopListening(); setName(typed.trim()); setPhase('new_confirm')
                await speak(`Maine padha: ${typed.trim()}. Sahi hai?`)
              }} className="btn-primary px-4">→</button>
            </div>
          </div>
        )}

        {/* CONFIRM NAME */}
        {phase === 'new_confirm' && (
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