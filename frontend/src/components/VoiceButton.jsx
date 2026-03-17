import { useApp } from '../context/AppContext'

export default function VoiceButton({ onResult, size = 'md', label = 'Ask by voice' }) {
  const { stt } = useApp()
  const { isListening, isSupported, startListening, stopListening, transcript } = stt

  if (!isSupported) return null

  const handleClick = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening(onResult)
    }
  }

  const sizeClasses = {
    sm: 'w-10 h-10 text-lg',
    md: 'w-14 h-14 text-2xl',
    lg: 'w-20 h-20 text-4xl',
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {/* Ripple rings when listening */}
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-full border-2 border-accent animate-ripple" aria-hidden="true" />
            <span className="absolute inset-0 rounded-full border-2 border-accent animate-ripple" style={{ animationDelay: '0.5s' }} aria-hidden="true" />
          </>
        )}
        <button
          onClick={handleClick}
          aria-label={isListening ? 'Stop listening. Click to submit.' : label}
          aria-pressed={isListening}
          className={`
            ${sizeClasses[size]} rounded-full flex items-center justify-center
            transition-all duration-200 relative z-10
            ${isListening
              ? 'bg-danger text-white shadow-lg shadow-danger/40 listening-pulse'
              : 'bg-card border-2 border-border hover:border-accent text-muted hover:text-accent'
            }
          `}
        >
          {isListening ? '⏹' : '🎤'}
        </button>
      </div>

      {/* Live transcript */}
      {isListening && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Voice transcript"
          className="flex items-center gap-3"
        >
          {/* Waveform bars */}
          <div className="flex items-end gap-0.5 h-6" aria-hidden="true">
            {[...Array(5)].map((_, i) => (
              <span key={i} className="wave-bar" />
            ))}
          </div>
          <span className="text-accent text-sm font-medium">Listening...</span>
        </div>
      )}

      {transcript && !isListening && (
        <p
          aria-live="polite"
          className="text-muted text-xs max-w-xs text-center truncate"
        >
          Heard: "{transcript}"
        </p>
      )}
    </div>
  )
}
