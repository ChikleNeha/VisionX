import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { MODULES } from '../data/curriculum'
import { API } from '../utils/api'

const QUIZ_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  ACTIVE: 'active',
  FEEDBACK: 'feedback',
  COMPLETE: 'complete',
}

export default function QuizView({ onBack }) {
  const { currentModule, sessionId, difficultyLevel, setDifficultyLevel, speakAndStore, tts } = useApp()

  const [state, setState] = useState(QUIZ_STATES.IDLE)
  const [questions, setQuestions] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [score, setScore] = useState(0)
  const [wrongTopics, setWrongTopics] = useState([])
  const [feedback, setFeedback] = useState('')
  const [announcement, setAnnouncement] = useState('')

  const mod = MODULES.find(m => m.id === currentModule)

  // Keyboard: 1-4 to answer, Escape to stop
  useEffect(() => {
    const handler = (e) => {
      if (state !== QUIZ_STATES.ACTIVE) return
      if (['1', '2', '3', '4'].includes(e.key)) {
        const optionMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' }
        handleAnswer(optionMap[e.key])
      }
      if (e.key === 'Escape') tts.stop()
      if (e.key === 'r' || e.key === 'R') {
        // Replay current question
        const q = questions[currentIdx]
        if (q) speakCurrentQuestion(q)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state, currentIdx, questions])

  const speakCurrentQuestion = (q) => {
    const text = `Question ${currentIdx + 1} of ${questions.length}. ${q.question}. 
      Option 1: ${q.options[0]}. 
      Option 2: ${q.options[1]}. 
      Option 3: ${q.options[2]}. 
      Option 4: ${q.options[3]}. 
      Press 1, 2, 3, or 4 to answer.`
    speakAndStore(text)
  }

  const loadQuiz = async () => {
    setState(QUIZ_STATES.LOADING)
    speakAndStore(`Loading your ${difficultyLevel} quiz on ${mod.title}. Please wait.`)
    try {
      const res = await API.getQuiz(sessionId, currentModule, difficultyLevel)
      setQuestions(res.data.questions)
      setCurrentIdx(0)
      setScore(0)
      setWrongTopics([])
      setState(QUIZ_STATES.ACTIVE)

      setTimeout(() => {
        speakAndStore(`Quiz ready. You have ${res.data.questions.length} questions. Press 1, 2, 3, or 4 to answer each question. Press R to repeat a question.`)
        setTimeout(() => speakCurrentQuestion(res.data.questions[0]), 3500)
      }, 500)
    } catch (err) {
      setState(QUIZ_STATES.IDLE)
      speakAndStore('Failed to load quiz. Please try again.')
    }
  }

  const handleAnswer = (answer) => {
    if (state !== QUIZ_STATES.ACTIVE || selectedAnswer) return
    setSelectedAnswer(answer)

    const q = questions[currentIdx]
    const isCorrect = answer === q.answer
    if (isCorrect) setScore(s => s + 1)
    else setWrongTopics(prev => [...prev, q.topic || mod.title])

    const feedbackText = isCorrect
      ? `Correct! ${q.explanation}`
      : `Incorrect. The correct answer was option ${q.answer}: ${q.options[q.answer.charCodeAt(0) - 65]}. ${q.explanation}`

    setFeedback(feedbackText)
    setState(QUIZ_STATES.FEEDBACK)
    speakAndStore(feedbackText)
    setAnnouncement(feedbackText)

    // Auto advance after 4 seconds
    setTimeout(() => advance(isCorrect), 4000)
  }

  const advance = (wasCorrect) => {
    const nextIdx = currentIdx + 1
    if (nextIdx >= questions.length) {
      finishQuiz()
    } else {
      setCurrentIdx(nextIdx)
      setSelectedAnswer(null)
      setFeedback('')
      setState(QUIZ_STATES.ACTIVE)
      setTimeout(() => speakCurrentQuestion(questions[nextIdx]), 600)
    }
  }

  const finishQuiz = async () => {
    const finalScore = score
    const total = questions.length
    setState(QUIZ_STATES.COMPLETE)

    // Submit result — backend will adapt difficulty
    try {
      const res = await API.submitQuizResult(sessionId, currentModule, finalScore, total, wrongTopics)
      if (res.data.new_difficulty) {
        setDifficultyLevel(res.data.new_difficulty)
      }
      if (finalScore >= Math.ceil(total * 0.7)) {
        await API.updateProgress(sessionId, currentModule, {
          status: 'completed',
          quiz_score: finalScore
        })
      }
    } catch (e) {}

    const percent = Math.round((finalScore / total) * 100)
    const encouragement = finalScore === total
      ? 'Perfect score! You have mastered this module!'
      : finalScore >= Math.ceil(total * 0.7)
        ? 'Great job! You passed. Ready for the next module.'
        : "Good effort! Let's review this topic again to strengthen your understanding."

    const resultText = `Quiz complete! You scored ${finalScore} out of ${total}, that is ${percent} percent. ${encouragement}`
    speakAndStore(resultText)
    setAnnouncement(resultText)
  }

  const q = questions[currentIdx]
  const optionLabels = ['A', 'B', 'C', 'D']

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-text">
            Quiz: {mod.title}
          </h2>
          <p className="text-muted text-sm">Press 1, 2, 3, or 4 to answer · R to repeat</p>
        </div>
        <button onClick={onBack} className="btn-ghost text-sm" aria-label="Back to lesson">
          ← Lesson
        </button>
      </div>

      {/* Aria live region */}
      <div role="status" aria-live="assertive" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* IDLE */}
        {state === QUIZ_STATES.IDLE && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <span className="text-5xl mb-6" aria-hidden="true">📝</span>
            <h3 className="font-display text-2xl font-bold text-text mb-3">Ready for the quiz?</h3>
            <p className="text-muted max-w-sm mb-2">
              5 questions on {mod.title}. Questions and options will be read aloud.
            </p>
            <p className="text-muted text-sm mb-6">
              Press <kbd className="bg-card border border-border rounded px-1.5 font-mono text-accent">1</kbd>–<kbd className="bg-card border border-border rounded px-1.5 font-mono text-accent">4</kbd> to answer.
            </p>
            <button onClick={loadQuiz} className="btn-primary text-lg px-8">
              Start Quiz
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
            <p className="text-muted">Generating quiz questions...</p>
          </div>
        )}

        {/* ACTIVE / FEEDBACK */}
        {(state === QUIZ_STATES.ACTIVE || state === QUIZ_STATES.FEEDBACK) && q && (
          <div className="max-w-2xl mx-auto animate-slide-up">
            {/* Progress */}
            <div className="flex items-center justify-between mb-6">
              <span className="text-muted text-sm">Question {currentIdx + 1} of {questions.length}</span>
              <span className="text-muted text-sm">Score: {score}</span>
            </div>
            <div
              className="h-1.5 bg-border rounded-full overflow-hidden mb-8"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={questions.length}
              aria-valuenow={currentIdx}
            >
              <div
                className="h-full bg-accent transition-all duration-500"
                style={{ width: `${(currentIdx / questions.length) * 100}%` }}
              />
            </div>

            {/* Question */}
            <h3
              className="font-display text-xl font-bold text-text mb-6 leading-snug"
              aria-live="polite"
            >
              {q.question}
            </h3>

            {/* Options */}
            <div className="grid grid-cols-1 gap-3 mb-6" role="group" aria-label="Answer options">
              {q.options.map((opt, i) => {
                const label = optionLabels[i]
                const isSelected = selectedAnswer === label
                const isCorrect = label === q.answer
                let style = 'bg-card border-border text-text hover:border-accent'
                if (state === QUIZ_STATES.FEEDBACK) {
                  if (isCorrect) style = 'bg-accent/10 border-accent text-accent'
                  else if (isSelected && !isCorrect) style = 'bg-danger/10 border-danger text-danger'
                  else style = 'bg-card border-border text-muted opacity-60'
                }

                return (
                  <button
                    key={label}
                    onClick={() => handleAnswer(label)}
                    disabled={state === QUIZ_STATES.FEEDBACK}
                    aria-label={`Option ${i + 1}: ${opt}${state === QUIZ_STATES.FEEDBACK && isCorrect ? ' — correct answer' : ''}${state === QUIZ_STATES.FEEDBACK && isSelected && !isCorrect ? ' — your incorrect answer' : ''}`}
                    aria-pressed={isSelected}
                    className={`
                      flex items-center gap-4 px-5 py-4 rounded-xl border-2 
                      transition-all duration-200 text-left
                      ${style}
                      disabled:cursor-default
                    `}
                  >
                    <span className="font-mono font-bold text-lg w-8 flex-shrink-0">{i + 1}</span>
                    <span className="font-body text-sm leading-snug">{opt}</span>
                    {state === QUIZ_STATES.FEEDBACK && isCorrect && (
                      <span className="ml-auto text-accent" aria-hidden="true">✓</span>
                    )}
                    {state === QUIZ_STATES.FEEDBACK && isSelected && !isCorrect && (
                      <span className="ml-auto text-danger" aria-hidden="true">✗</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Feedback */}
            {state === QUIZ_STATES.FEEDBACK && (
              <div
                className={`p-4 rounded-xl border animate-slide-up ${
                  selectedAnswer === q.answer
                    ? 'bg-accent/5 border-accent/30 text-accent'
                    : 'bg-danger/5 border-danger/30 text-danger'
                }`}
                role="alert"
                aria-live="assertive"
              >
                <p className="font-medium text-sm">{feedback}</p>
                <p className="text-xs opacity-70 mt-1">Advancing automatically...</p>
              </div>
            )}

            <button
              onClick={() => speakCurrentQuestion(q)}
              className="btn-ghost text-sm mt-4"
              aria-label="Repeat question (R)"
            >
              ↺ Repeat Question (R)
            </button>
          </div>
        )}

        {/* COMPLETE */}
        {state === QUIZ_STATES.COMPLETE && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in max-w-md mx-auto">
            <div className="text-7xl mb-6" aria-hidden="true">
              {score === questions.length ? '🏆' : score >= Math.ceil(questions.length * 0.7) ? '🎉' : '📖'}
            </div>
            <h3 className="font-display text-3xl font-bold text-text mb-2">
              {score} / {questions.length}
            </h3>
            <p className="text-muted mb-2">
              {Math.round((score / questions.length) * 100)}% correct
            </p>
            <p className="text-text mb-8">
              {score === questions.length
                ? 'Perfect score! Module complete!'
                : score >= Math.ceil(questions.length * 0.7)
                  ? 'Great work! You passed this module.'
                  : 'Keep practicing! The lesson has been adjusted to help you.'}
            </p>
            <div className="flex gap-3">
              <button onClick={loadQuiz} className="btn-ghost" aria-label="Retake quiz">
                ↺ Try Again
              </button>
              <button onClick={onBack} className="btn-primary" aria-label="Return to lesson">
                Back to Lesson
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
