import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { MODULES } from '../data/curriculum'
import { API } from '../utils/api'
import { waitUntilDone } from '../hooks/useTTS'

const QUIZ_STATES = {
  IDLE:     'idle',
  LOADING:  'loading',
  ACTIVE:   'active',
  FEEDBACK: 'feedback',
  COMPLETE: 'complete',
}

export default function QuizView({ onBack }) {
  const { currentModule, sessionId, difficultyLevel, setDifficultyLevel, speakAndStore, tts } = useApp()

  const [state, setState]               = useState(QUIZ_STATES.IDLE)
  const [questions, setQuestions]       = useState([])
  const [currentIdx, setCurrentIdx]     = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [score, setScore]               = useState(0)
  const [wrongTopics, setWrongTopics]   = useState([])
  const [feedback, setFeedback]         = useState('')
  const [announcement, setAnnouncement] = useState('')
  const stateRef    = useRef(QUIZ_STATES.IDLE)  // always-current state for handlers
  const questionsRef = useRef([])
  const idxRef       = useRef(0)
  const scoreRef     = useRef(0)

  const mod = MODULES.find(m => m.id === currentModule)

  // Keep refs in sync
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { questionsRef.current = questions }, [questions])
  useEffect(() => { idxRef.current = currentIdx }, [currentIdx])
  useEffect(() => { scoreRef.current = score }, [score])

  // ── Audio intro on mount ────────────────────────────────────────────────────
  useEffect(() => {
    const intro = `Quiz time! Yeh ${mod.title} ka quiz hai. 5 sawaal honge. 
      Har sawaal sunne ke baad 1, 2, 3, ya 4 dabao jawab dene ke liye. 
      R dabao sawaal dobara sunne ke liye. 
      Shuru karne ke liye Space ya Enter dabao.`
    speakAndStore(intro)
    return () => tts.stop()
  }, [])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA'
      if (inInput) return

      // Space / Enter — start quiz from idle, or replay from active
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault()
        if (stateRef.current === QUIZ_STATES.IDLE) { loadQuiz(); return }
      }

      // 1–4 to answer
      if (['1', '2', '3', '4'].includes(e.key) && stateRef.current === QUIZ_STATES.ACTIVE) {
        const map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' }
        handleAnswer(map[e.key])
      }

      // R → repeat question
      if ((e.key === 'r' || e.key === 'R') && stateRef.current === QUIZ_STATES.ACTIVE) {
        const q = questionsRef.current[idxRef.current]
        if (q) speakCurrentQuestion(q, idxRef.current)
      }

      if (e.key === 'Escape') tts.stop()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])   // empty deps — uses refs only, no stale closures

  const speakCurrentQuestion = (q, idx) => {
    const n = idx ?? currentIdx
    const text = `Sawaal ${n + 1}. ${q.question}. 
      Option 1: ${q.options[0]}. 
      Option 2: ${q.options[1]}. 
      Option 3: ${q.options[2]}. 
      Option 4: ${q.options[3]}. 
      1, 2, 3, ya 4 dabao.`
    speakAndStore(text)
  }

  const loadQuiz = async () => {
    tts.stop()
    setState(QUIZ_STATES.LOADING)
    speakAndStore(`${mod.title} ka quiz load ho raha hai. Thoda waqt lagega.`)
    try {
      const res = await API.getQuiz(sessionId, currentModule, difficultyLevel)
      const qs  = res.data.questions
      setQuestions(qs)
      setCurrentIdx(0)
      setScore(0)
      setWrongTopics([])
      setState(QUIZ_STATES.ACTIVE)

      // Wait for loading message then speak first question
      await waitUntilDone(8000)
      speakAndStore(`Quiz shuru! ${qs.length} sawaal hain. 1, 2, 3, ya 4 dabao jawab dene ke liye.`)
      await waitUntilDone(8000)
      speakCurrentQuestion(qs[0], 0)

    } catch {
      setState(QUIZ_STATES.IDLE)
      speakAndStore('Quiz load nahi hua. Dobara try karo. Space dabao.')
    }
  }

  const handleAnswer = (answer) => {
    if (stateRef.current !== QUIZ_STATES.ACTIVE || selectedAnswer) return
    setSelectedAnswer(answer)

    const q   = questionsRef.current[idxRef.current]
    const isCorrect = answer === q.answer
    if (isCorrect) setScore(s => s + 1)
    else setWrongTopics(prev => [...prev, q.topic || mod.title])

    const feedbackText = isCorrect
      ? `Bilkul sahi! ${q.explanation}`
      : `Galat. Sahi jawab tha option ${q.answer}: ${q.options[q.answer.charCodeAt(0) - 65]}. ${q.explanation}`

    setFeedback(feedbackText)
    setState(QUIZ_STATES.FEEDBACK)
    speakAndStore(feedbackText)
    setAnnouncement(feedbackText)

    // Auto advance after feedback finishes (or 5s max)
    setTimeout(() => advance(isCorrect), 5000)
  }

  const advance = (wasCorrect) => {
    const nextIdx = idxRef.current + 1
    if (nextIdx >= questionsRef.current.length) {
      finishQuiz()
    } else {
      setCurrentIdx(nextIdx)
      setSelectedAnswer(null)
      setFeedback('')
      setState(QUIZ_STATES.ACTIVE)
      setTimeout(() => speakCurrentQuestion(questionsRef.current[nextIdx], nextIdx), 600)
    }
  }

  const finishQuiz = async () => {
    const finalScore = scoreRef.current
    const total      = questionsRef.current.length
    setState(QUIZ_STATES.COMPLETE)

    try {
      const res = await API.submitQuizResult(sessionId, currentModule, finalScore, total, wrongTopics)
      if (res.data.new_difficulty) setDifficultyLevel(res.data.new_difficulty)
      if (finalScore >= Math.ceil(total * 0.7)) {
        await API.updateProgress(sessionId, currentModule, { status: 'completed', quiz_score: finalScore })
      }
    } catch {}

    const pct = Math.round((finalScore / total) * 100)
    const msg = finalScore === total
      ? 'Zabardast! Perfect score! Aapne yeh module master kar liya!'
      : finalScore >= Math.ceil(total * 0.7)
        ? `Bahut accha! Aapne ${pct} percent score kiya. Agle module ke liye ready ho!`
        : `Koi baat nahi! Aapne ${pct} percent score kiya. Thoda aur practice karte hain.`

    speakAndStore(`Quiz khatam! Aapne ${finalScore} mein se ${total} sahi kiye. ${msg}`)
    setAnnouncement(msg)
  }

  const q = questions[currentIdx]
  const optionLabels = ['A', 'B', 'C', 'D']

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-text">Quiz: {mod.title}</h2>
          <p className="text-muted text-sm">
            1–4 jawab · R repeat ·{' '}
            {state === QUIZ_STATES.IDLE
              ? <span className="text-accent">Space dabao shuru karne ke liye</span>
              : 'Esc audio band'
            }
          </p>
        </div>
        <button onClick={() => { tts.stop(); onBack() }} className="btn-ghost text-sm">← Lesson</button>
      </div>

      <div role="status" aria-live="assertive" aria-atomic="true" className="sr-only">{announcement}</div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* IDLE */}
        {state === QUIZ_STATES.IDLE && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <span className="text-5xl mb-6" aria-hidden="true">📝</span>
            <h3 className="font-display text-2xl font-bold text-text mb-3">{mod.title} Quiz</h3>
            <p className="text-muted max-w-sm mb-2 text-sm">
              5 sawaal honge. Jawab sunne ke baad 1, 2, 3, ya 4 dabao.
            </p>
            <p className="text-muted text-sm mb-6">
              <kbd className="bg-card border border-border rounded px-1.5 font-mono text-accent">Space</kbd>{' '}
              ya{' '}
              <kbd className="bg-card border border-border rounded px-1.5 font-mono text-accent">Enter</kbd>{' '}
              dabao shuru karne ke liye
            </p>
            <button onClick={loadQuiz} className="btn-primary text-lg px-8" autoFocus>
              ▶ Quiz Shuru Karo
            </button>
          </div>
        )}

        {/* LOADING */}
        {state === QUIZ_STATES.LOADING && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="flex items-end gap-1 h-12 mb-4" aria-hidden="true">
              {[...Array(7)].map((_, i) => (
                <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
            <p className="text-muted">Sawaal ban rahe hain...</p>
          </div>
        )}

        {/* ACTIVE / FEEDBACK */}
        {(state === QUIZ_STATES.ACTIVE || state === QUIZ_STATES.FEEDBACK) && q && (
          <div className="max-w-2xl mx-auto animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <span className="text-muted text-sm">Sawaal {currentIdx + 1} / {questions.length}</span>
              <span className="text-muted text-sm">Score: {score}</span>
            </div>
            <div className="h-1.5 bg-border rounded-full overflow-hidden mb-8"
              role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={currentIdx}>
              <div className="h-full bg-accent transition-all duration-500"
                style={{ width: `${(currentIdx / questions.length) * 100}%` }} />
            </div>

            <h3 className="font-display text-xl font-bold text-text mb-6 leading-snug" aria-live="polite">
              {q.question}
            </h3>

            <div className="grid grid-cols-1 gap-3 mb-6" role="group" aria-label="Jawab ke options">
              {q.options.map((opt, i) => {
                const label = optionLabels[i]
                const isSelected = selectedAnswer === label
                const isCorrect  = label === q.answer
                let style = 'bg-card border-border text-text hover:border-accent'
                if (state === QUIZ_STATES.FEEDBACK) {
                  if (isCorrect)              style = 'bg-accent/10 border-accent text-accent'
                  else if (isSelected)        style = 'bg-danger/10 border-danger text-danger'
                  else                        style = 'bg-card border-border text-muted opacity-50'
                }
                return (
                  <button key={label} onClick={() => handleAnswer(label)}
                    disabled={state === QUIZ_STATES.FEEDBACK}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-4 px-5 py-4 rounded-xl border-2 transition-all duration-200 text-left disabled:cursor-default ${style}`}>
                    <span className="font-mono font-bold text-lg w-8 flex-shrink-0">{i + 1}</span>
                    <span className="font-body text-sm leading-snug">{opt}</span>
                    {state === QUIZ_STATES.FEEDBACK && isCorrect  && <span className="ml-auto text-accent">✓</span>}
                    {state === QUIZ_STATES.FEEDBACK && isSelected && !isCorrect && <span className="ml-auto text-danger">✗</span>}
                  </button>
                )
              })}
            </div>

            {state === QUIZ_STATES.FEEDBACK && (
              <div className={`p-4 rounded-xl border animate-slide-up ${selectedAnswer === q.answer ? 'bg-accent/5 border-accent/30 text-accent' : 'bg-danger/5 border-danger/30 text-danger'}`}
                role="alert" aria-live="assertive">
                <p className="font-medium text-sm">{feedback}</p>
                <p className="text-xs opacity-70 mt-1">Agla sawaal aa raha hai...</p>
              </div>
            )}

            <button onClick={() => speakCurrentQuestion(q, currentIdx)}
              className="btn-ghost text-sm mt-4" aria-label="Sawaal dobara suno (R)">
              ↺ Dobara Suno (R)
            </button>
          </div>
        )}

        {/* COMPLETE */}
        {state === QUIZ_STATES.COMPLETE && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in max-w-md mx-auto">
            <div className="text-7xl mb-6" aria-hidden="true">
              {score === questions.length ? '🏆' : score >= Math.ceil(questions.length * 0.7) ? '🎉' : '📖'}
            </div>
            <h3 className="font-display text-3xl font-bold text-text mb-2">{score} / {questions.length}</h3>
            <p className="text-muted mb-2">{Math.round((score / questions.length) * 100)}% sahi</p>
            <p className="text-text mb-8 text-sm">
              {score === questions.length ? 'Perfect! Module complete!' :
               score >= Math.ceil(questions.length * 0.7) ? 'Bahut accha! Pass ho gaye.' :
               'Thoda aur practice karo!'}
            </p>
            <div className="flex gap-3">
              <button onClick={loadQuiz} className="btn-ghost">↺ Dobara Do</button>
              <button onClick={() => { tts.stop(); onBack() }} className="btn-primary">Lesson Par Wapas</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}