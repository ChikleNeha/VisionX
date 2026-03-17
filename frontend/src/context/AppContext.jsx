import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useTTS } from '../hooks/useTTS'
import { useSTT } from '../hooks/useSTT'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [username, setUsername] = useState(() => localStorage.getItem('ac_username') || null)
  const [sessionId] = useState(() => {
    const existing = localStorage.getItem('ac_session_id')
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem('ac_session_id', id)
    return id
  })

  const [currentModule, setCurrentModule] = useState(1)
  const [difficultyLevel, setDifficultyLevel] = useState('beginner') // beginner | intermediate | advanced
  const [lessonState, setLessonState] = useState('idle') // idle | teaching | interrupted | quiz
  const [isHighContrast, setIsHighContrast] = useState(false)
  const [fontSize, setFontSize] = useState('medium')
  const [lastAIMessage, setLastAIMessage] = useState('')

  const tts = useTTS()
  const stt = useSTT()
  const lastMessageRef = useRef('')

  // Sync username to localStorage
  const saveUsername = (name) => {
    localStorage.setItem('ac_username', name)
    setUsername(name)
  }

  // High contrast toggle
  const toggleHighContrast = () => {
    setIsHighContrast(prev => {
      document.body.classList.toggle('high-contrast', !prev)
      return !prev
    })
  }

  // Font size control
  const changeFontSize = (size) => {
    const sizeMap = { small: '14px', medium: '18px', large: '22px', xlarge: '28px' }
    document.documentElement.style.setProperty('--font-size', sizeMap[size] || '18px')
    setFontSize(size)
  }

  // Store last message for replay
  const speakAndStore = (text) => {
    lastMessageRef.current = text
    setLastAIMessage(text)
    tts.speak(text)
  }

  const replayLast = () => {
    if (lastMessageRef.current) tts.speak(lastMessageRef.current)
  }

  return (
    <AppContext.Provider value={{
      username, saveUsername, sessionId,
      currentModule, setCurrentModule,
      difficultyLevel, setDifficultyLevel,
      lessonState, setLessonState,
      isHighContrast, toggleHighContrast,
      fontSize, changeFontSize,
      tts, stt,
      speakAndStore, replayLast, lastAIMessage
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
