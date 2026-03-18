/**
 * browserTTS — Web Speech API wrapper with Hindi voice priority.
 * Used for short status messages (instant, no network).
 * For lesson content, use tts-1-hd via useTTS hook.
 */

let _cachedVoice = null
let _voicesReady = false

// Load voices — returns a Promise that resolves when voices are available
function loadVoices() {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis?.getVoices() || []
    if (voices.length > 0) {
      _voicesReady = true
      resolve(voices)
      return
    }
    // Chrome loads voices async — wait for event
    const handler = () => {
      const v = window.speechSynthesis.getVoices()
      if (v.length > 0) {
        _voicesReady = true
        resolve(v)
      }
    }
    window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true })
    // Fallback after 2s if event never fires
    setTimeout(() => resolve(window.speechSynthesis?.getVoices() || []), 2000)
  })
}

function pickBestVoice(voices) {
  if (_cachedVoice) return _cachedVoice
  _cachedVoice =
    voices.find(v => v.lang === 'hi-IN') ||
    voices.find(v => v.lang === 'en-IN') ||
    voices.find(v => v.lang.startsWith('hi')) ||
    voices.find(v => v.lang.includes('IN')) ||
    null
  return _cachedVoice
}

// Reset cache when voices change (e.g. user installs a new language)
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    _cachedVoice = null
  })
}

/**
 * browserSpeak(text, onDone?, rate?)
 * Speaks text with best available Hindi/Indian voice.
 */
export async function browserSpeak(text, onDone, rate = 1.05) {
  if (!window.speechSynthesis || !text?.trim()) {
    onDone?.(); return
  }

  window.speechSynthesis.cancel()

  // Wait for voices to load (instant if already loaded)
  const voices = await loadVoices()
  const voice  = pickBestVoice(voices)

  const utt    = new SpeechSynthesisUtterance(text)
  utt.rate     = rate
  utt.volume   = 0.95

  if (voice) {
    utt.voice = voice
    console.log('[browserTTS] using voice:', voice.name, voice.lang)
  } else {
    utt.lang = 'hi-IN'
    console.log('[browserTTS] no Hindi voice found, using lang=hi-IN')
  }

  const timer = setTimeout(() => onDone?.(), Math.max(3000, text.length * 70))
  utt.onend   = () => { clearTimeout(timer); onDone?.() }
  utt.onerror = () => { clearTimeout(timer); onDone?.() }

  window.speechSynthesis.speak(utt)
}

export function browserStop() {
  window.speechSynthesis?.cancel()
}