import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { MODULES } from '../data/curriculum'
import { API } from '../utils/api'

export default function ModuleSidebar({ onSelectModule }) {
  const { currentModule, setCurrentModule, sessionId, speakAndStore, difficultyLevel } = useApp()
  const [progress, setProgress] = useState({})

  useEffect(() => {
    API.getProgress(sessionId).then(r => {
      const map = {}
      r.data.forEach(p => { map[p.module_id] = p })
      setProgress(map)
    }).catch(() => {})
  }, [sessionId, currentModule])

  const handleSelect = (mod) => {
    setCurrentModule(mod.id)
    onSelectModule(mod)
    speakAndStore(`Opening Module ${mod.id}: ${mod.title}. ${mod.description}`)
  }

  const statusLabel = (modId) => {
    const p = progress[modId]
    if (!p) return 'Not started'
    if (p.status === 'completed') return `Completed. Quiz score: ${p.quiz_score} out of 5`
    if (p.status === 'in_progress') return 'In progress'
    return 'Not started'
  }

  const statusIcon = (modId) => {
    const p = progress[modId]
    if (!p || p.status === 'not_started') return '○'
    if (p.status === 'completed') return '✓'
    return '◑'
  }

  const statusColor = (modId) => {
    const p = progress[modId]
    if (!p || p.status === 'not_started') return 'text-muted'
    if (p.status === 'completed') return 'text-accent'
    return 'text-warn'
  }

  return (
    <nav
      role="navigation"
      aria-label="Python course modules"
      className="w-72 bg-surface border-r border-border flex flex-col h-full"
    >
      <div className="p-5 border-b border-border">
        <h2 className="font-display text-lg font-bold text-text">Python for Beginners</h2>
        <p className="text-muted text-xs mt-1">5 modules · Voice & keyboard ready</p>

        {/* Overall progress */}
        {Object.keys(progress).length > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted mb-1">
              <span>Progress</span>
              <span>{Object.values(progress).filter(p => p.status === 'completed').length} / 5</span>
            </div>
            <div
              className="h-1.5 bg-border rounded-full overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={5}
              aria-valuenow={Object.values(progress).filter(p => p.status === 'completed').length}
              aria-label="Overall course progress"
            >
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${(Object.values(progress).filter(p => p.status === 'completed').length / 5) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto p-3 space-y-1" role="list">
        {MODULES.map((mod) => {
          const isActive = currentModule === mod.id
          return (
            <li key={mod.id} role="listitem">
              <button
                onClick={() => handleSelect(mod)}
                aria-label={`Module ${mod.id}: ${mod.title}. ${statusLabel(mod.id)}`}
                aria-current={isActive ? 'page' : undefined}
                className={`
                  w-full text-left px-4 py-3 rounded-xl transition-all duration-200
                  flex items-start gap-3 group
                  ${isActive
                    ? 'bg-accent/10 border border-accent/30 text-text'
                    : 'hover:bg-card text-muted hover:text-text border border-transparent'
                  }
                `}
              >
                <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden="true">{mod.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`font-medium text-sm ${isActive ? 'text-accent' : ''}`}>
                      {mod.title}
                    </span>
                    <span className={`text-base flex-shrink-0 ml-2 ${statusColor(mod.id)}`} aria-hidden="true">
                      {statusIcon(mod.id)}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5 truncate">{mod.description}</p>
                  <p className="text-xs text-muted/60 mt-1">~{mod.estimatedMinutes} min</p>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted text-center">
          <kbd className="bg-card border border-border rounded px-1.5 py-0.5 font-mono text-accent">J</kbd>
          {' '}or{' '}
          <kbd className="bg-card border border-border rounded px-1.5 py-0.5 font-mono text-accent">F</kbd>
          {' '}to interrupt · '}
          <kbd className="bg-card border border-border rounded px-1.5 py-0.5 font-mono text-accent">H</kbd>
          {' '}for help
        </p>
      </div>
    </nav>
  )
}
