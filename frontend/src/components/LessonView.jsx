import { useState, useEffect, useRef, useCallback } from 'react'
import { waitUntilDone } from '../hooks/useTTS'
import { useApp } from '../context/AppContext'
import { MODULES } from '../data/curriculum'
import { API } from '../utils/api'

const STATES = {
  LOADING_LESSON: 'loading_lesson',
  TEACHING: 'teaching',
  INTERRUPTED: 'interrupted',
  ANSWERING: 'answering',
}

export default function LessonView({ onStartQuiz }) {
  const { currentModule, sessionId, difficultyLevel, setDifficultyLevel,
          speakAndStore, tts, stt, setLessonState } = useApp()

  const [state, setState]               = useState(STATES.LOADING_LESSON)
  const [statusMsg, setStatusMsg]       = useState('') // spoken loading status
  const [streamedText, setStreamedText] = useState('') // lesson text building up chunk by chunk
  const [chatHistory, setChatHistory]   = useState([])
  const [interruptInput, setInterruptInput] = useState('')
  const [announcement, setAnnouncement] = useState('')

  const chatEndRef      = useRef(null)
  const lessonContextRef = useRef('')
  const cancelStreamRef  = useRef(null)  // cancel SSE stream
  const lastStatusRef    = useRef('')    // avoid repeating same status aloud

  const mod = MODULES.find(m => m.id === currentModule)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, streamedText])

  useEffect(() => { setLessonState(state) }, [state])

  // ── Speak a status message — but only if it changed ───────────────────────
  const announceStatus = useCallback((msg) => {
    if (!msg || msg === lastStatusRef.current) return
    lastStatusRef.current = msg
    setStatusMsg(msg)
    setAnnouncement(msg)
    // Speak short status messages without stopping current audio
    // Use browser TTS for these (instant, no latency) — they are short UI hints
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
      const utt = new SpeechSynthesisUtterance(msg)
      utt.rate = 1.15
      utt.volume = 0.8
      window.speechSynthesis.speak(utt)
    }
  }, [])

  // ── Auto-start lesson on mount and on module change ────────────────────────
  useEffect(() => {
    stt.stopListening()
    tts.stop()
    setChatHistory([])
    setStreamedText('')
    setStatusMsg('')
    lessonContextRef.current = ''
    setState(STATES.LOADING_LESSON)
    lastStatusRef.current = ''

    // Cancel any previous stream
    if (cancelStreamRef.current) {
      cancelStreamRef.current()
      cancelStreamRef.current = null
    }

    let unmounted = false
    let fullContent = ''

    const cancel = API.streamLesson(
      sessionId,
      currentModule,
      difficultyLevel,
      async (type, text) => {
        if (unmounted) return

        if (type === 'status') {
          // Announce status aloud + show it visually
          announceStatus(text)

        } else if (type === 'chunk') {
          // Append chunk to the building lesson text — shows word by word
          fullContent += (fullContent ? ' ' : '') + text
          setStreamedText(fullContent)

        } else if (type === 'done') {
          // Full lesson received — display and play immediately
          fullContent = text
          lessonContextRef.current = text
          setStreamedText('')
          setChatHistory([{ role: 'assistant', content: text, type: 'lesson', id: Date.now() }])
          setState(STATES.TEACHING)
          setStatusMsg('')
          setAnnouncement('')
          lastStatusRef.current = ''

          // Kill any status speech immediately
          if (window.speechSynthesis) window.speechSynthesis.cancel()

          // Save progress (non-blocking)
          API.updateProgress(sessionId, currentModule, { status: 'in_progress' }).catch(() => {})
          API.prewarmLessons(sessionId, currentModule, difficultyLevel)

          // Small buffer only if something was actually speaking (fresh lesson status TTS)
          // For cached lessons this resolves instantly since nothing is playing
          await waitUntilDone(3000)
          if (!unmounted) {
            speakAndStore(`Lesson shuru hoti hai. J ya F dabao koi bhi sawaal poochne ke liye. ${text}`)
          }

        } else if (type === 'error') {
          if (!unmounted) {
            setStatusMsg(`Error: ${text}`)
            speakAndStore(`Kuch problem aayi: ${text}. Dobara try karo.`)
            setState(STATES.TEACHING)
          }
        }
      }
    )

    cancelStreamRef.current = cancel

    return () => {
      unmounted = true
      cancel()
      cancelStreamRef.current = null
    }
  }, [currentModule])

  // ── Global keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA'

      if ((e.key === 'j' || e.key === 'J' || e.key === 'f' || e.key === 'F')
          && state === STATES.TEACHING && !inInput) {
        e.preventDefault(); handleInterrupt(); return
      }
      if (!inInput) {
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault()
          if (lessonContextRef.current) { tts.stop(); tts.speak(lessonContextRef.current) }
        }
        if (e.key === 'Escape') { tts.stop(); if (window.speechSynthesis) window.speechSynthesis.cancel() }
        if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); onStartQuiz() }
        if (e.key === 'h' || e.key === 'H') {
          e.preventDefault()
          speakAndStore('Shortcuts: J ya F lesson rok ke sawaal, R repeat, Q quiz, Escape audio band.')
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state])

  // ── Interrupt ──────────────────────────────────────────────────────────────
  const handleInterrupt = useCallback(async () => {
    tts.stop()
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    setState(STATES.INTERRUPTED)
    setInterruptInput('')
    setAnnouncement('Lesson ruka. Sawaal bolo.')

    await tts.speak('Haan bolo, kya poochna hai?')
    await waitUntilDone(8000)
    await new Promise(r => setTimeout(r, 400))

    stt.startListening((transcript) => {
      if (transcript.trim()) {
        setInterruptInput(transcript)
        submitQuestion(transcript)
      }
    })
  }, [tts, stt])

  // ── Submit question ────────────────────────────────────────────────────────
  const submitQuestion = async (question) => {
    if (!question?.trim()) return
    stt.stopListening()
    setChatHistory(prev => [...prev, { role: 'user', content: question, type: 'question', id: Date.now() }])
    setInterruptInput('')
    setState(STATES.ANSWERING)
    announceStatus('Sawaal AI ko bheja ja raha hai...')

    try {
      const res = await API.chat(sessionId, currentModule, question, difficultyLevel, lessonContextRef.current)
      const { response, updated_difficulty, lesson_adjustment } = res.data

      if (updated_difficulty && updated_difficulty !== difficultyLevel) setDifficultyLevel(updated_difficulty)

      announceStatus('Jawab aa gaya! Audio ban rahi hai...')
      await waitUntilDone(4000)

      setChatHistory(prev => [...prev, {
        role: 'assistant', content: response, type: 'answer', id: Date.now(),
        difficultyChanged: updated_difficulty !== difficultyLevel ? updated_difficulty : null,
      }])
      setStatusMsg('')
      setAnnouncement('')
      speakAndStore(response)

      if (lesson_adjustment) {
        setTimeout(async () => {
          announceStatus('Lesson update ho rahi hai...')
          const newLesson = await API.getLesson(sessionId, currentModule, updated_difficulty || difficultyLevel)
          lessonContextRef.current = newLesson.data.content
          setChatHistory(prev => [...prev, {
            role: 'assistant', content: newLesson.data.content, type: 'lesson', id: Date.now()
          }])
          await waitUntilDone(3000)
          speakAndStore(newLesson.data.content)
        }, 500)
      }

      setState(STATES.TEACHING)
    } catch {
      setState(STATES.INTERRUPTED)
      speakAndStore('Kuch problem aayi. Dobara try karo.')
    }
  }

  const toggleMic = () => {
    if (stt.isListening) { stt.stopListening() }
    else {
      stt.startListening((transcript) => {
        if (transcript.trim()) { setInterruptInput(transcript); submitQuestion(transcript) }
      })
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-text flex items-center gap-2">
            <span aria-hidden="true">{mod.icon}</span> {mod.title}
          </h2>
          <p className="text-muted text-sm mt-0.5">{mod.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge font-mono text-xs ${
            difficultyLevel === 'beginner' ? 'bg-accent/10 text-accent' :
            difficultyLevel === 'intermediate' ? 'bg-warn/10 text-warn' :
            'bg-danger/10 text-danger'
          }`}>{difficultyLevel}</span>
          {tts.isSpeaking && (
            <div className="flex items-end gap-0.5 h-5" role="status" aria-label="Audio chal raha hai">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Accessible live region */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4"
        role="log" aria-label="Lesson aur conversation" aria-live="polite">

        {/* ── LOADING: status + streaming text ── */}
        {state === STATES.LOADING_LESSON && (
          <div className="flex flex-col h-full">
            {/* Status pill */}
            <div className="flex items-center justify-center gap-3 py-6">
              <div className="flex items-end gap-0.5 h-6" aria-hidden="true">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
              <p className="text-accent text-sm font-medium animate-pulse">
                {statusMsg || 'Lesson generate ho rahi hai...'}
              </p>
            </div>

            {/* Streaming lesson text — appears chunk by chunk */}
            {streamedText && (
              <div className="card animate-fade-in">
                <p className="text-xs text-muted mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-accent rounded-full animate-pulse" aria-hidden="true" />
                  📚 Lesson aa rahi hai...
                </p>
                <div className="text-sm leading-relaxed font-body text-text">
                  {streamedText.split('\n\n').map((para, i) => (
                    <p key={i} className={i > 0 ? 'mt-3' : ''}>{para}</p>
                  ))}
                  {/* Blinking cursor */}
                  <span className="inline-block w-0.5 h-4 bg-accent ml-0.5 animate-pulse" aria-hidden="true" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CHAT HISTORY ── */}
        {chatHistory.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} onReplay={() => speakAndStore(msg.content)} />
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Bottom controls */}
      <div className="border-t border-border p-4">

        {/* INTERRUPTED / ANSWERING */}
        {(state === STATES.INTERRUPTED || state === STATES.ANSWERING) && (
          <div className="animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 bg-warn rounded-full animate-pulse" aria-hidden="true" />
              <p className="text-warn text-sm font-medium">
                {state === STATES.ANSWERING
                  ? (statusMsg || 'Jawab aa raha hai...')
                  : 'Lesson ruka — sawaal bolo'}
              </p>
            </div>

            {/* Big mic button */}
            <div className="flex flex-col items-center gap-3 mb-4">
              <button
                onClick={toggleMic}
                disabled={state === STATES.ANSWERING}
                aria-label={stt.isListening ? 'Recording band karo' : 'Apna sawaal bolo (mic)'}
                aria-pressed={stt.isListening}
                className={`w-20 h-20 rounded-full text-4xl flex items-center justify-center
                  transition-all duration-200 relative
                  ${stt.isListening
                    ? 'bg-danger text-white shadow-lg shadow-danger/40 listening-pulse'
                    : state === STATES.ANSWERING
                      ? 'bg-card border-2 border-border text-muted opacity-50 cursor-not-allowed'
                      : 'bg-accent/10 border-2 border-accent text-accent hover:bg-accent/20'
                  }`}
              >
                {stt.isListening ? '⏹' : '🎤'}
                {stt.isListening && (
                  <>
                    <span className="absolute inset-0 rounded-full border-2 border-danger animate-ripple" aria-hidden="true" />
                    <span className="absolute inset-0 rounded-full border-2 border-danger animate-ripple" style={{ animationDelay: '0.5s' }} aria-hidden="true" />
                  </>
                )}
              </button>

              {stt.isListening && (
                <div className="flex items-center gap-2" role="status" aria-live="polite">
                  <div className="flex items-end gap-0.5 h-5" aria-hidden="true">
                    {[...Array(5)].map((_, i) => <span key={i} className="wave-bar" />)}
                  </div>
                  <span className="text-accent text-sm font-medium">Sun raha hoon...</span>
                </div>
              )}
              {stt.transcript && !stt.isListening && (
                <p className="text-muted text-xs text-center max-w-xs" aria-live="polite">
                  Suna: "{stt.transcript}"
                </p>
              )}
            </div>

            {/* Text input — secondary */}
            <details className="group">
              <summary className="text-muted text-xs text-center cursor-pointer hover:text-text transition-colors mb-2 select-none">
                ▼ Text se likhna chahte ho? (optional)
              </summary>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={interruptInput}
                  onChange={e => setInterruptInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitQuestion(interruptInput)}
                  placeholder="Apna sawaal yahan likho..."
                  aria-label="Sawaal type karo"
                  disabled={state === STATES.ANSWERING}
                  className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5
                             text-text placeholder-muted focus:border-accent focus:outline-none
                             disabled:opacity-50 font-body text-sm"
                />
                <button
                  onClick={() => submitQuestion(interruptInput)}
                  disabled={!interruptInput.trim() || state === STATES.ANSWERING}
                  className="btn-primary px-4 text-sm"
                >→</button>
              </div>
            </details>

            <button
              onClick={() => { stt.stopListening(); setState(STATES.TEACHING) }}
              className="btn-ghost text-sm mt-3 w-full"
            >↩ Lesson Resume Karo</button>
          </div>
        )}

        {/* TEACHING controls */}
        {state === STATES.TEACHING && (
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button onClick={handleInterrupt} className="btn-ghost text-sm"
                aria-label="Lesson rok ke sawaal poochho (J ya F)">
                <kbd className="font-mono text-accent">J/F</kbd> Interrupt
              </button>
              <button
                onClick={() => { tts.stop(); setTimeout(() => speakAndStore(lessonContextRef.current), 100) }}
                className="btn-ghost text-sm" aria-label="Replay (R)">
                ↺ Replay
              </button>
              <button onClick={() => tts.stop()} className="btn-ghost text-sm">
                ⏹ Stop
              </button>
            </div>
            <button onClick={onStartQuiz} className="btn-primary text-sm">
              📝 Quiz Karo (Q)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ msg, onReplay }) {
  const isUser   = msg.role === 'user'
  const isLesson = msg.type === 'lesson'

  return (
    <article
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}
      aria-label={isUser ? `Tumne pucha: ${msg.content}` : `Tutor ne kaha: ${msg.content.slice(0, 60)}`}
    >
      <div className={`max-w-2xl ${isUser ? 'max-w-md' : 'w-full'}`}>
        <p className={`text-xs mb-1 ${isUser ? 'text-right text-muted' : 'text-muted'}`}>
          {isUser ? 'Tum' : isLesson ? '📚 Lesson' : '🤖 Tutor'}
          {msg.difficultyChanged && (
            <span className="ml-2 text-warn">· Difficulty {msg.difficultyChanged} ho gayi</span>
          )}
        </p>
        <div className={`rounded-2xl px-5 py-4 text-sm leading-relaxed font-body
          ${isUser ? 'bg-accent/10 border border-accent/20 text-text'
            : isLesson ? 'bg-card border border-border text-text'
            : 'bg-surface border border-border text-text'}`}>
          {msg.content.split('\n\n').map((para, i) => (
            <p key={i} className={i > 0 ? 'mt-3' : ''}>{para}</p>
          ))}
        </div>
        {!isUser && (
          <button onClick={onReplay}
            className="text-xs text-muted hover:text-accent transition-colors mt-1 ml-1"
            aria-label="Yeh message dobara sunao">
            ↺ Dobara Suno
          </button>
        )}
      </div>
    </article>
  )
}