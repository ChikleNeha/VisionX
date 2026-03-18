import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { API } from '../utils/api'
import { waitUntilDone } from '../hooks/useTTS'

const STATES = {
  IDLE:       'idle',
  LISTENING:  'listening',
  PROCESSING: 'processing',
  RESULT:     'result',
}

export default function CodeView() {
  const { currentModule, sessionId, speakAndStore, tts, stt } = useApp()

  const [state, setState]           = useState(STATES.IDLE)
  const [history, setHistory]       = useState([])   // [{spoken, code, output, error, success}]
  const [currentCode, setCurrentCode] = useState('')
  const [typedInput, setTypedInput] = useState('')
  const [status, setStatus]         = useState('')
  const isListeningRef = useRef(false)
  const bottomRef      = useRef(null)
  const containerRef   = useRef(null)

  useEffect(() => { isListeningRef.current = stt.isListening }, [stt.isListening])

  // Scroll to bottom on new results
  useEffect(() => {
    requestAnimationFrame(() => {
      if (containerRef.current)
        containerRef.current.scrollTop = containerRef.current.scrollHeight
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }, [history, state])

  // Audio intro on mount
  useEffect(() => {
    speakAndStore(
      'Coding practice mein swagat hai! Apna code boliye ya type karo. ' +
      'Main use Python mein convert karke chalaunga aur result sunaunga. ' +
      'Space dabao mic shuru karne ke liye.'
    )
    return () => tts.stop()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA'

      // Space → start/stop mic
      if (e.code === 'Space' && !inInput) {
        e.preventDefault()
        if (isListeningRef.current) {
          stt.stopListening()
        } else if (state === STATES.IDLE || state === STATES.RESULT) {
          startListening()
        }
      }
      // Escape → stop
      if (e.key === 'Escape') { tts.stop(); stt.stopListening() }
      // R → repeat last output
      if ((e.key === 'r' || e.key === 'R') && !inInput && history.length > 0) {
        const last = history[history.length - 1]
        speakAndStore(last.output)
      }
      // C → clear history
      if ((e.key === 'c' || e.key === 'C') && !inInput) {
        setHistory([])
        setState(STATES.IDLE)
        speakAndStore('History saaf kar di.')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state, history])

  const startListening = () => {
    setState(STATES.LISTENING)
    setStatus('Bol do... Space dabao submit karne ke liye')
    speakAndStore('Bol do.')

    stt.startListening((transcript) => {
      if (transcript.trim()) {
        runCode(transcript.trim())
      } else {
        setState(STATES.IDLE)
        setStatus('')
      }
    })
  }

  const runCode = async (spoken) => {
    stt.stopListening()
    setState(STATES.PROCESSING)
    setStatus('Code ban raha hai...')

    try {
      const res = await API.runCode(spoken, currentModule)
      const { code, output, error, error_explanation, success } = res.data

      setCurrentCode(code)
      const entry = { spoken, code, output, error, error_explanation, success, id: Date.now() }
      setHistory(prev => [...prev, entry])
      setState(STATES.RESULT)
      setStatus('')

      // Speak the result
      speakAndStore(output)

      // Wait for output to finish, then prompt next action
      await new Promise(r => setTimeout(r, 800))
      await waitUntilDone(30000)
      if (success) {
        speakAndStore('Space dabao aur kuch aur try karo.')
      } else {
        speakAndStore('Dobara try karo ya kuch aur boliye. Space dabao.')
      }

    } catch (err) {
      setState(STATES.IDLE)
      setStatus('Error aaya, dobara try karo.')
      speakAndStore('Kuch problem aayi. Dobara try karo. Space dabao.')
    }
  }

  const handleTypedSubmit = () => {
    if (!typedInput.trim()) return
    const text = typedInput.trim()
    setTypedInput('')
    runCode(text)
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-text flex items-center gap-2">
            <span aria-hidden="true">⚡</span> Code Practice
          </h2>
          <p className="text-muted text-sm mt-0.5">
            Bolo ya type karo → Python mein convert → run → result suno
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <kbd className="bg-card border border-border rounded px-1.5 font-mono text-accent">Space</kbd> mic ·
          <kbd className="ml-1 bg-card border border-border rounded px-1.5 font-mono text-accent">R</kbd> repeat ·
          <kbd className="ml-1 bg-card border border-border rounded px-1.5 font-mono text-accent">C</kbd> clear
        </div>
      </div>

      {/* History + current */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-6 space-y-6">

        {history.length === 0 && state === STATES.IDLE && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <span className="text-6xl mb-4" aria-hidden="true">🎤</span>
            <h3 className="font-display text-2xl font-bold text-text mb-3">
              Code boliye!
            </h3>
            <p className="text-muted text-sm max-w-sm mb-6 leading-relaxed">
              Kuch bhi boliye jaise:<br/>
              <span className="text-accent">"print hello world"</span><br/>
              <span className="text-accent">"variable x equals 10"</span><br/>
              <span className="text-accent">"for loop 1 se 5 tak"</span>
            </p>
            <button
              onClick={startListening}
              autoFocus
              className="btn-primary text-lg px-8 py-4"
              aria-label="Mic shuru karo — Space dabao"
            >
              🎤 Space — Bolna Shuru Karo
            </button>
          </div>
        )}

        {/* History entries */}
        {history.map((entry) => (
          <div key={entry.id} className="space-y-3 animate-slide-up">

            {/* User's spoken input */}
            <div className="flex justify-end">
              <div className="max-w-md bg-accent/10 border border-accent/20 rounded-2xl px-4 py-3">
                <p className="text-xs text-muted mb-1">Tumne kaha</p>
                <p className="text-text text-sm">"{entry.spoken}"</p>
              </div>
            </div>

            {/* Generated code */}
            <div className="card">
              <p className="text-xs text-muted mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-accent rounded-full" aria-hidden="true" />
                Generated Python
              </p>
              <pre className="font-mono text-sm text-accent bg-surface rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
                {entry.code}
              </pre>
            </div>

            {/* Output or Error */}
            {entry.success ? (
              <div className="card border-accent/30 bg-accent/5">
                <p className="text-xs text-accent mb-2 flex items-center gap-2">
                  <span aria-hidden="true">✅</span> Output
                </p>
                <p className="font-mono text-sm text-text">
                  {entry.output.replace('Code chala! Output hai: ', '') || '(koi output nahi)'}
                </p>
              </div>
            ) : (
              <div className="card border-danger/30 bg-danger/5">
                <p className="text-xs text-danger mb-2 flex items-center gap-2">
                  <span aria-hidden="true">❌</span> Error
                </p>
                <pre className="font-mono text-xs text-danger/80 mb-3 whitespace-pre-wrap">
                  {entry.error}
                </pre>
                {entry.error_explanation && (
                  <p className="text-sm text-text border-t border-danger/20 pt-3">
                    💡 {entry.error_explanation}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Processing state */}
        {state === STATES.PROCESSING && (
          <div className="flex flex-col items-center py-8 animate-fade-in" role="status">
            <div className="flex items-end gap-0.5 h-10 mb-3" aria-hidden="true">
              {[...Array(7)].map((_, i) => (
                <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
            <p className="text-accent text-sm">{status}</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Bottom input area */}
      <div className="border-t border-border p-4">

        {/* Listening state — big mic */}
        {state === STATES.LISTENING && (
          <div className="flex flex-col items-center gap-3 animate-slide-up">
            <div className="relative">
              <span className="absolute inset-0 rounded-full border-2 border-danger animate-ripple" aria-hidden="true" />
              <span className="absolute inset-0 rounded-full border-2 border-danger animate-ripple" style={{ animationDelay: '0.5s' }} aria-hidden="true" />
              <button
                onClick={() => stt.stopListening()}
                className="w-20 h-20 rounded-full bg-danger text-white text-4xl flex items-center justify-center listening-pulse relative z-10"
                aria-label="Space dabao submit karne ke liye"
              >
                ⏹
              </button>
            </div>
            <p className="text-accent text-sm font-medium" role="status">
              Sun raha hoon... Space dabao submit karne ke liye
            </p>
            {stt.transcript && (
              <p className="text-muted text-xs">"{stt.transcript}"</p>
            )}
          </div>
        )}

        {/* Idle / Result — input bar */}
        {(state === STATES.IDLE || state === STATES.RESULT) && (
          <div className="space-y-3 animate-slide-up">
            {history.length > 0 && (
              <button
                onClick={startListening}
                className="btn-primary w-full"
                aria-label="Aur code boliye — Space dabao"
              >
                🎤 Aur Code Boliye (Space)
              </button>
            )}
            {/* Text fallback */}
            <div className="flex gap-2">
              <input
                type="text"
                value={typedInput}
                onChange={e => setTypedInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTypedSubmit()}
                placeholder="Ya yahan type karo... jaise 'print 2 plus 2'"
                aria-label="Code type karo"
                className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5
                           text-text placeholder-muted focus:border-accent focus:outline-none
                           font-body text-sm"
              />
              <button
                onClick={handleTypedSubmit}
                disabled={!typedInput.trim()}
                className="btn-primary px-4"
                aria-label="Run karo"
              >▶</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}