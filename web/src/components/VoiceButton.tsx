import { useEffect, useRef, useState } from 'react'
import './VoiceButton.css'

// Tap-to-speak using the Web Speech API (webkitSpeechRecognition on iOS Safari).
// Press once to start, press again to stop. Stays listening through pauses by
// running in continuous mode and auto-restarting if the engine ends early.
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
  const wantListeningRef = useRef(false) // desired state; survives onend closures

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      return
    }
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = true // keep listening through pauses

    recognition.onresult = (event: any) => {
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += transcript
        else interimText += transcript
      }
      if (onInterim) onInterim(interimText)
      if (finalText) {
        onTranscript(finalText.trim())
        if (onInterim) onInterim('')
      }
    }

    // iOS/Safari often ends the session on a pause even in continuous mode.
    // If the user hasn't tapped stop, restart so it keeps going.
    recognition.onend = () => {
      if (wantListeningRef.current) {
        try {
          recognition.start()
          return
        } catch {
          /* fall through to stop */
        }
      }
      setListening(false)
    }
    recognition.onerror = (e: any) => {
      // "no-speech" / "aborted" are recoverable; let onend restart.
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        wantListeningRef.current = false
        setListening(false)
      }
    }

    recognitionRef.current = recognition
    return () => {
      wantListeningRef.current = false
      try { recognition.stop() } catch { /* noop */ }
    }
  }, [onTranscript, onInterim])

  const toggle = () => {
    const recognition = recognitionRef.current
    if (!recognition) return
    if (wantListeningRef.current) {
      wantListeningRef.current = false
      try { recognition.stop() } catch { /* noop */ }
      setListening(false)
    } else {
      wantListeningRef.current = true
      try {
        recognition.start()
        setListening(true)
      } catch {
        // already started
        setListening(true)
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
