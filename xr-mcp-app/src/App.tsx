import { useState, useEffect, useRef, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore, useXR } from '@react-three/xr'
import { useVoiceAssistant } from './hooks/useVoiceAssistant.ts'
import { Window, type WindowAction } from './components/XRWindow.tsx'
import { SubwayArrivals3D } from './components/SubwayArrivals3D.tsx'
import { CitiBikeStatus3D } from './components/CitiBikeStatus3D.tsx'
import { SportsSearch3D } from './components/SportsSearch3D.tsx'
import { VideoPlayer3D } from './components/VideoPlayer3D.tsx'
import { ChatWindow3D } from './components/ChatWindow3D.tsx'
import { VoiceIndicator3D } from './components/VoiceIndicator3D.tsx'

const xrStore = createXRStore()

/** 3D scene rendered inside XR */
function XRScene() {
  // Detect XR session active
  const session = useXR((s) => s.session)
  const inXR = session != null

  const voice = useVoiceAssistant({ enabled: inXR })

  // Extract per-tool results
  const subwayText = voice.mcpToolResults['subway-arrivals']?.content?.[0]?.text ?? null
  const citibikeText = voice.mcpToolResults['citibike-status']?.content?.[0]?.text ?? null
  const searchText = voice.mcpToolResults['search-streams']?.content?.[0]?.text ?? null
  const streamData = voice.mcpToolResults['show-stream']?.content?.[0]?.text ?? null

  // Parse stream URL from show-stream result
  const streamUrl = useMemo(() => {
    if (!streamData) return null
    try {
      const parsed = JSON.parse(streamData)
      return parsed?.stream_url ?? null
    } catch {
      return null
    }
  }, [streamData])

  // Window visibility state
  const [chatVisible, setChatVisible] = useState(true)
  const [subwayVisible, setSubwayVisible] = useState(true)
  const [citibikeVisible, setCitibikeVisible] = useState(true)
  const [sportsVisible, setSportsVisible] = useState(true)
  const [videoVisible, setVideoVisible] = useState(true)

  // Re-show panels when new data arrives from voice
  const prevSubwayRef = useRef<string | null>(null)
  const prevCitibikeRef = useRef<string | null>(null)
  const prevSearchRef = useRef<string | null>(null)
  const prevStreamRef = useRef<string | null>(null)
  useEffect(() => {
    if (subwayText && subwayText !== prevSubwayRef.current) {
      setSubwayVisible(true)
    }
    prevSubwayRef.current = subwayText
  }, [subwayText])
  useEffect(() => {
    if (citibikeText && citibikeText !== prevCitibikeRef.current) {
      setCitibikeVisible(true)
    }
    prevCitibikeRef.current = citibikeText
  }, [citibikeText])
  useEffect(() => {
    if (searchText && searchText !== prevSearchRef.current) {
      setSportsVisible(true)
    }
    prevSearchRef.current = searchText
  }, [searchText])
  useEffect(() => {
    if (streamUrl && streamUrl !== prevStreamRef.current) {
      setVideoVisible(true)
    }
    prevStreamRef.current = streamUrl
  }, [streamUrl])

  const muteAction: WindowAction[] = useMemo(() => [{
    key: 'mute',
    icon: voice.isMuted ? 'M' : 'U',
    variant: voice.isMuted ? 'error' : 'success',
    active: voice.isMuted,
    onPress: voice.toggleMute,
  }], [voice.isMuted, voice.toggleMute])

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
      {subwayText && subwayVisible && (
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
          <SubwayArrivals3D contentText={subwayText} />
        </Window>
      )}

      {/* Citi Bike panel — shows only when Garvis returns data */}
      {citibikeText && citibikeVisible && (
        <Window
          title="Citi Bike"
          width={0.4}
          height={0.35}
          config={{ distance: 0.6, horizontalOffset: 0.3, verticalOffset: 0.05, horizontalMode: 'visor' }}
          draggable={true}
          resizable={true}
          storageKey="citibike"
          showClose={true}
          onClose={() => setCitibikeVisible(false)}
        >
          <CitiBikeStatus3D contentText={citibikeText} />
        </Window>
      )}

      {/* Sports search results — shows when Garvis finds games */}
      {searchText && sportsVisible && (
        <Window
          title="Live Sports"
          width={0.4}
          height={0.35}
          config={{ distance: 0.6, horizontalOffset: -0.25, verticalOffset: 0.15, horizontalMode: 'visor' }}
          draggable={true}
          resizable={true}
          storageKey="sports"
          showClose={true}
          onClose={() => setSportsVisible(false)}
        >
          <SportsSearch3D contentText={searchText} />
        </Window>
      )}

      {/* Video player — shows when Garvis starts a stream */}
      {streamUrl && videoVisible && (
        <Window
          title="Stream"
          width={0.5}
          height={0.32}
          config={{ distance: 0.55, horizontalOffset: 0, verticalOffset: 0.05, horizontalMode: 'visor' }}
          draggable={true}
          resizable={true}
          storageKey="video"
          showClose={true}
          onClose={() => setVideoVisible(false)}
        >
          <VideoPlayer3D url={streamUrl} width={0.45} />
        </Window>
      )}

      {/* Voice status indicator — draggable, not closeable, with mute toggle */}
      <Window
        title="Status"
        width={0.06}
        height={0.04}
        config={{ distance: 0.5, horizontalOffset: 0, verticalOffset: -0.25, horizontalMode: 'visor' }}
        draggable={true}
        resizable={false}
        storageKey="voice-indicator"
        showClose={false}
        actions={muteAction}
      >
        <VoiceIndicator3D
          isConnected={voice.isConnected}
          isListening={voice.isListening}
          isSpeaking={voice.isSpeaking}
          isProcessing={voice.isProcessing}
          isMuted={voice.isMuted}
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
