import { useEffect, useRef, useState } from 'react'
import './VoiceButton.css'

// Tap-to-speak using the Web Speech API (webkitSpeechRecognition on iOS Safari).
// Falls back to hidden if the browser doesn't support it.
export default function VoiceButton({
  onTranscript,
  onInterim,
}: {
  onTranscript: (text: string) => void
  onInterim?: (text: string) => void
}) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      return
    }
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onresult = (event: any) => {
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += transcript
        else interimText += transcript
      }
      if (interimText && onInterim) onInterim(interimText)
      if (finalText) onTranscript(finalText.trim())
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    return () => {
      try { recognition.stop() } catch { /* noop */ }
    }
  }, [onTranscript, onInterim])

  const toggle = () => {
    const recognition = recognitionRef.current
    if (!recognition) return
    if (listening) {
      recognition.stop()
      setListening(false)
    } else {
      try {
        recognition.start()
        setListening(true)
      } catch {
        // start() throws if already started; ignore
      }
    }
  }

  if (!supported) return null

  return (
    <button
      type="button"
      className={`voice-button ${listening ? 'listening' : ''}`}
      onClick={toggle}
      aria-label={listening ? 'Stop listening' : 'Tap to speak'}
    >
      <span className="voice-icon">🎤</span>
      {listening ? 'Listening… tap to stop' : 'Tap to speak'}
    </button>
  )
}
