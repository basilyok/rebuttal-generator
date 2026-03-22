import { useState, useRef, useEffect } from 'react'
import './App.css'

interface Rebuttal {
  brief: string
  detailed: string
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [rebuttal, setRebuttal] = useState<Rebuttal | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [apiKey, setApiKey] = useState(localStorage.getItem('anthropic_api_key') || '')
  const [showApiKeyInput, setShowApiKeyInput] = useState(!apiKey)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<any>(null)

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            setTranscript(prev => (prev ? prev + ' ' : '') + transcript)
          } else {
            interimTranscript += transcript
          }
        }
        if (interimTranscript) {
          setTranscript(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + interimTranscript)
        }
      }

      recognitionRef.current.onerror = (event: any) => {
        setError(`Speech recognition error: ${event.error}`)
      }

      recognitionRef.current.onend = () => {
        setIsRecording(false)
      }
    }
  }, [])

  // Check for service worker updates
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        setUpdateAvailable(false)
      })

      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true)
              }
            })
          }
        })
      })
    }
  }, [])

  const toggleRecording = async () => {
    if (!recognitionRef.current) {
      setError('Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari.')
      return
    }

    if (isRecording) {
      recognitionRef.current.stop()
      setIsRecording(false)
    } else {
      setTranscript('')
      setError('')
      setRebuttal(null)
      recognitionRef.current.start()
      setIsRecording(true)
    }
  }

  const generateRebuttal = async () => {
    if (!transcript.trim()) {
      setError('Please provide an argument first')
      return
    }

    if (!apiKey.trim()) {
      setError('Please set your API key')
      return
    }

    setIsLoading(true)
    setError('')
    setRebuttal(null)
    setIsExpanded(false)

    try {
      // Generate brief rebuttal
      const briefResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 150,
          messages: [
            {
              role: 'user',
              content: `Generate a very brief, concise rebuttal to this argument in 1-2 sentences: "${transcript}"`,
            },
          ],
        }),
      })

      if (!briefResponse.ok) {
        throw new Error(`API error: ${briefResponse.statusText}`)
      }

      const briefData = await briefResponse.json()
      const briefRebuttal = briefData.content[0].text

      // Generate detailed rebuttal
      const detailedResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [
            {
              role: 'user',
              content: `Generate a detailed, well-reasoned rebuttal to this argument. Include counterpoints, evidence-based reasoning, and a strong conclusion: "${transcript}"`,
            },
          ],
        }),
      })

      if (!detailedResponse.ok) {
        throw new Error(`API error: ${detailedResponse.statusText}`)
      }

      const detailedData = await detailedResponse.json()
      const detailedRebuttal = detailedData.content[0].text

      setRebuttal({
        brief: briefRebuttal,
        detailed: detailedRebuttal,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate rebuttal')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('anthropic_api_key', apiKey)
      setShowApiKeyInput(false)
    } else {
      setError('Please enter a valid API key')
    }
  }

  const handleUpdateClick = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
        })
      })
      window.location.reload()
    }
  }

  return (
    <div className="container">
      {updateAvailable && (
        <div className="success" style={{ marginBottom: '20px' }}>
          🎉 A new version is available!{' '}
          <button onClick={handleUpdateClick} style={{ marginLeft: '8px', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
            Reload
          </button>
        </div>
      )}
      <h1>🎤 Rebuttal Generator</h1>
      <p className="subtitle">Speak your argument, get an intelligent rebuttal</p>

      {showApiKeyInput && (
        <div className="input-section">
          <label className="label">Anthropic API Key</label>
          <div className="controls" style={{ gap: '12px' }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Anthropic API key"
              style={{
                flex: 1,
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleSaveApiKey()}
            />
            <button className="button button-primary" onClick={handleSaveApiKey}>
              Save Key
            </button>
          </div>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
            Get your API key from <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>
          </p>
        </div>
      )}

      {!showApiKeyInput && (
        <button
          className="button button-secondary"
          onClick={() => setShowApiKeyInput(true)}
          style={{ marginBottom: '20px', fontSize: '12px' }}
        >
          Change API Key
        </button>
      )}

      <div className="input-section">
        <label className="label">Record Your Argument</label>
        <div className="controls">
          <button
            className={`button ${isRecording ? 'button-danger' : 'button-primary'}`}
            onClick={toggleRecording}
            disabled={isLoading}
          >
            {isRecording ? '⏹ Stop Recording' : '🎙 Start Recording'}
          </button>
          {isRecording && (
            <div className="recording-indicator">
              <span className="recording-dot"></span>
              Recording...
            </div>
          )}
        </div>

        {transcript && (
          <div className="transcript-area">
            {transcript}
          </div>
        )}
      </div>

      <button
        className="button button-primary submit-button"
        onClick={generateRebuttal}
        disabled={!transcript.trim() || isLoading}
      >
        {isLoading ? (
          <>
            <span className="spinner"></span>
            Generating Rebuttal...
          </>
        ) : (
          '✨ Generate Rebuttal'
        )}
      </button>

      {error && <div className="error">⚠️ {error}</div>}

      {rebuttal && (
        <div className="rebuttal-section">
          <h2 className="rebuttal-title">Your Rebuttal</h2>

          <div className="rebuttal-brief">
            {rebuttal.brief}
          </div>

          <div className="expander-header" onClick={() => setIsExpanded(!isExpanded)}>
            <div className={`expander-arrow ${isExpanded ? 'open' : ''}`}>▼</div>
            <div className="expander-text">View Detailed Rebuttal</div>
          </div>

          <div className={`rebuttal-detailed ${isExpanded ? '' : 'collapsed'}`}>
            <div className="rebuttal-detailed-content">
              {rebuttal.detailed}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
