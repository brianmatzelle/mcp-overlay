import { useState, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore, useXR } from '@react-three/xr'
import { useVoiceAssistant } from './hooks/useVoiceAssistant.ts'
import { Window } from './components/XRWindow.tsx'
import { SubwayArrivals3D } from './components/SubwayArrivals3D.tsx'
import { ChatWindow3D } from './components/ChatWindow3D.tsx'
import { VoiceIndicator3D } from './components/VoiceIndicator3D.tsx'

const xrStore = createXRStore()

/** 3D scene rendered inside XR */
function XRScene() {
  // Detect XR session active
  const session = useXR((s) => s.session)
  const inXR = session != null

  const voice = useVoiceAssistant({ enabled: inXR })

  // Only show MCP tool results when Garvis triggers them via voice
  const contentText = voice.mcpToolResult?.content?.[0]?.text ?? null

  // Window visibility state
  const [chatVisible, setChatVisible] = useState(true)
  const [subwayVisible, setSubwayVisible] = useState(true)

  // Re-show subway panel when new data arrives from voice
  const prevContentRef = useRef<string | null>(null)
  useEffect(() => {
    if (contentText && contentText !== prevContentRef.current) {
      setSubwayVisible(true)
    }
    prevContentRef.current = contentText
  }, [contentText])

  return (
    <>
      {/* Chat window — left side, draggable, closeable */}
      {chatVisible && (
        <Window
          title="Chat"
          icon="💬"
          width={0.35}
          height={0.25}
          config={{ distance: 0.6, horizontalOffset: -0.25, verticalOffset: -0.05, horizontalMode: 'visor' }}
          draggable={true}
          resizable={true}
          storageKey="chat"
          showClose={true}
          onClose={() => setChatVisible(false)}
        >
          <ChatWindow3D
            isConnected={voice.isConnected}
            isListening={voice.isListening}
            isSpeaking={voice.isSpeaking}
            isProcessing={voice.isProcessing}
            error={voice.error}
            messages={voice.messages}
          />
        </Window>
      )}

      {/* Subway panel — right side, shows only when Garvis returns data */}
      {contentText && subwayVisible && (
        <Window
          title="MTA Subway"
          icon="🚇"
          width={0.4}
          height={0.35}
          config={{ distance: 0.6, horizontalOffset: 0.15, verticalOffset: -0.05, horizontalMode: 'visor' }}
          draggable={true}
          resizable={true}
          storageKey="subway"
          showClose={true}
          onClose={() => setSubwayVisible(false)}
        >
          <SubwayArrivals3D contentText={contentText} />
        </Window>
      )}

      {/* Voice status indicator — draggable, not closeable */}
      <Window
        title="Status"
        width={0.06}
        height={0.04}
        config={{ distance: 0.5, horizontalOffset: 0, verticalOffset: -0.25, horizontalMode: 'visor' }}
        draggable={true}
        resizable={false}
        storageKey="voice-indicator"
        showClose={false}
      >
        <VoiceIndicator3D
          isConnected={voice.isConnected}
          isListening={voice.isListening}
          isSpeaking={voice.isSpeaking}
          isProcessing={voice.isProcessing}
        />
      </Window>
    </>
  )
}

function App() {
  const handleEnterAR = async () => {
    try {
      await xrStore.enterAR()
    } catch (error) {
      console.error('Failed to enter AR:', error)
      try {
        await xrStore.enterVR()
      } catch (vrError) {
        console.error('Failed to enter VR:', vrError)
      }
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }}>
      {/* Browser-mode UI (visible before entering AR) */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        padding: '2rem',
        maxWidth: '500px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h1 style={{ color: '#fff', fontSize: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
          Garvis XR
        </h1>
        <button
          onClick={handleEnterAR}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 'bold',
            background: '#667eea',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Enter AR
        </button>
      </div>

      {/* XR Canvas — behind browser UI, becomes immersive on Enter AR */}
      <Canvas style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
        <XR store={xrStore}>
          <XRScene />
          <ambientLight intensity={0.5} />
        </XR>
      </Canvas>
    </div>
  )
}

export default App
