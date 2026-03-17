import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const API = {
  // User
  createUser: (username) =>
    api.post('/users', { username }),

  getUser: (username) =>
    api.get(`/users/${username}`),

  // Progress
  getProgress: (sessionId) =>
    api.get(`/progress/${sessionId}`),

  updateProgress: (sessionId, moduleId, data) =>
    api.post('/progress', { session_id: sessionId, module_id: moduleId, ...data }),

  // Lesson — non-streaming fallback
  getLesson: (sessionId, moduleId, difficulty) =>
    api.post('/lesson', { session_id: sessionId, module_id: moduleId, difficulty }),

  /**
   * Streaming lesson via SSE.
   * Calls onEvent(type, text) for each event:
   *   type = "status"  → loading message  e.g. "AI soch raha hai..."
   *   type = "chunk"   → one sentence of lesson content
   *   type = "done"    → full lesson text (use this to start TTS)
   *   type = "error"   → something went wrong
   *
   * Returns a cancel function — call it to abort the stream.
   */
  streamLesson: (sessionId, moduleId, difficulty, onEvent) => {
    const controller = new AbortController()

    const run = async () => {
      try {
        const response = await fetch('/api/lesson/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            module_id: moduleId,
            difficulty
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          onEvent('error', `Server error: ${response.status}`)
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // SSE events are separated by double newlines
          const events = buffer.split('\n\n')
          // Last element may be incomplete — keep it in buffer
          buffer = events.pop()

          for (const raw of events) {
            const line = raw.trim()
            if (!line.startsWith('data:')) continue
            try {
              const parsed = JSON.parse(line.slice(5).trim())
              onEvent(parsed.type, parsed.text)
            } catch {
              // malformed event — skip
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('SSE stream error:', err)
          onEvent('error', 'Stream connection failed')
        }
      }
    }

    run()
    return () => controller.abort()
  },

  // Tutor chat (handles interrupts + doubts)
  chat: (sessionId, moduleId, message, difficulty, lessonContext) =>
    api.post('/tutor', {
      session_id: sessionId,
      module_id: moduleId,
      message,
      difficulty,
      lesson_context: lessonContext
    }),

  // Quiz
  getQuiz: (sessionId, moduleId, difficulty) =>
    api.post('/quiz', { session_id: sessionId, module_id: moduleId, difficulty }),

  submitQuizResult: (sessionId, moduleId, score, total, wrongTopics) =>
    api.post('/quiz/result', {
      session_id: sessionId,
      module_id: moduleId,
      score,
      total,
      wrong_topics: wrongTopics
    }),

  // TTS proxy
  tts: (text, speed = 1.0) =>
    api.post('/tts', { text, speed }, { responseType: 'blob' }),
}

export default API