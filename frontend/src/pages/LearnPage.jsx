import { useState, useEffect, useRef } from 'react'
import { unlockAudio } from '../hooks/useTTS'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { MODULES, SHORTCUTS } from '../data/curriculum'
import ModuleSidebar from '../components/ModuleSidebar'
import LessonView from '../components/LessonView'
import QuizView from '../components/QuizView'
import CodeView from '../components/CodeView'

export default function LearnPage() {
  const { username, currentModule, setCurrentModule, speakAndStore, tts,
          toggleHighContrast, changeFontSize, tts: { setRate } } = useApp()

  const [view, setView]               = useState('lesson') // 'lesson' | 'quiz' | 'code'
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const navigate    = useNavigate()

  useEffect(() => {
    if (!username) navigate('/')
  }, [username])

  // Global shortcuts
  useEffect(() => {
    const handler = (e) => {
      unlockAudio()
      const tag = document.activeElement.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        speakAndStore(`Shortcuts: ${SHORTCUTS.map(s => `${s.keys}: ${s.action}`).join('. ')}`)
      }
      if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); setView('quiz') }
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); setView('code') }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        const next = Math.min(currentModule + 1, MODULES.length)
        setCurrentModule(next); setView('lesson')
        speakAndStore(`Module ${next}: ${MODULES[next - 1].title}`)
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        const prev = Math.max(currentModule - 1, 1)
        setCurrentModule(prev); setView('lesson')
        speakAndStore(`Module ${prev}: ${MODULES[prev - 1].title}`)
      }
      if (e.key === 'Escape') tts.stop()
      if (e.altKey && e.key === 'c') toggleHighContrast()
      if (e.altKey && e.key === '1') changeFontSize('small')
      if (e.altKey && e.key === '2') changeFontSize('medium')
      if (e.altKey && e.key === '3') changeFontSize('large')
      if (e.altKey && e.key === '4') changeFontSize('xlarge')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentModule])

  const handleSelectModule = (mod) => {
    setCurrentModule(mod.id)
    setView('lesson')
  }

  return (
    <div className="flex h-screen bg-ink overflow-hidden" role="application" aria-label="AccessCode learning environment">

      <div className={`flex-shrink-0 transition-all duration-300 ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}
        aria-hidden={!sidebarOpen}>
        <ModuleSidebar onSelectModule={handleSelectModule} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface" role="banner">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(s => !s)}
              aria-label={sidebarOpen ? 'Module list band karo' : 'Module list kholo'}
              aria-expanded={sidebarOpen}
              className="btn-ghost text-sm px-3 py-2">☰</button>
            <span className="font-display font-bold text-text text-lg">
              Access<span className="text-accent">Code</span>
            </span>
          </div>

          <nav aria-label="View controls" className="flex items-center gap-2">
            <button onClick={() => { setView('lesson') }}
              aria-pressed={view === 'lesson'}
              className={`text-sm px-4 py-2 rounded-lg transition-colors ${view === 'lesson' ? 'bg-accent/10 text-accent border border-accent/30' : 'text-muted hover:text-text'}`}>
              📚 Lesson
            </button>
            <button onClick={() => { setView('quiz') }}
              aria-pressed={view === 'quiz'}
              className={`text-sm px-4 py-2 rounded-lg transition-colors ${view === 'quiz' ? 'bg-accent/10 text-accent border border-accent/30' : 'text-muted hover:text-text'}`}>
              📝 Quiz (Q)
            </button>
            <button onClick={() => { setView('code') }}
              aria-pressed={view === 'code'}
              className={`text-sm px-4 py-2 rounded-lg transition-colors ${view === 'code' ? 'bg-accent/10 text-accent border border-accent/30' : 'text-muted hover:text-text'}`}>
              ⚡ Code
            </button>
          </nav>

          <div className="flex items-center gap-2">
            {tts.isSpeaking && (
              <div className="flex items-end gap-0.5 h-5" role="status" aria-label="Audio chal raha hai">
                {[...Array(4)].map((_, i) => (
                  <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            )}
            <span className="text-muted text-sm hidden sm:block">
              Hi, <span className="text-text">{username}</span>
            </span>
            <button onClick={() => navigate('/')} className="btn-ghost text-xs px-3 py-2"
              aria-label="Home page par wapas jao">← Home</button>
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-hidden" role="main">
          {view === 'lesson' && <LessonView onStartQuiz={() => setView('quiz')} />}
          {view === 'quiz'   && <QuizView onBack={() => setView('lesson')} />}
          {view === 'code'   && <CodeView />}
        </main>

        <footer className="px-5 py-2 border-t border-border bg-surface" role="contentinfo">
          <p className="text-muted text-xs text-center">
            <kbd className="bg-card border border-border rounded px-1.5 font-mono text-accent text-xs">J/F</kbd> Interrupt ·
            <kbd className="ml-2 bg-card border border-border rounded px-1.5 font-mono text-accent text-xs">R</kbd> Replay ·
            <kbd className="ml-2 bg-card border border-border rounded px-1.5 font-mono text-accent text-xs">Q</kbd> Quiz ·
            <kbd className="ml-2 bg-card border border-border rounded px-1.5 font-mono text-accent text-xs">C</kbd> Code ·
            <kbd className="ml-2 bg-card border border-border rounded px-1.5 font-mono text-accent text-xs">N/P</kbd> Next/Prev ·
            <kbd className="ml-2 bg-card border border-border rounded px-1.5 font-mono text-accent text-xs">Esc</kbd> Stop ·
            <kbd className="ml-2 bg-card border border-border rounded px-1.5 font-mono text-accent text-xs">H</kbd> Help
          </p>
        </footer>
      </div>
    </div>
  )
}