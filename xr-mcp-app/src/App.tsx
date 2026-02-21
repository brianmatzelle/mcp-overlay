import { Canvas } from '@react-three/fiber'
import { XR, createXRStore, useXR } from '@react-three/xr'
import { MCPAppPanel } from './MCPAppPanel.tsx'
import { useMCPData } from './hooks/useMCPData.ts'
import { useVoiceAssistant } from './hooks/useVoiceAssistant.ts'
import { XRWindow } from './components/XRWindow.tsx'
import { SubwayArrivals3D } from './components/SubwayArrivals3D.tsx'
import { ChatWindow3D } from './components/ChatWindow3D.tsx'
import { VoiceIndicator3D } from './components/VoiceIndicator3D.tsx'

const xrStore = createXRStore()

/** 3D scene rendered inside XR */
function XRScene({ autoContent }: { autoContent: string | null }) {
  // Detect XR session active
  const session = useXR((s) => s.session)
  const inXR = session != null

  const voice = useVoiceAssistant({ enabled: inXR })

  // Voice-triggered result takes priority, fallback to auto-loaded data
  const voiceContent = voice.mcpToolResult?.content?.[0]?.text ?? null
  const contentText = voiceContent ?? autoContent

  return (
    <>
      {/* Chat window — left side */}
      <XRWindow
        title="Garvis"
        distance={0.6}
        width={0.35}
        height={0.25}
        horizontalOffset={-0.25}
      >
        <ChatWindow3D
          isConnected={voice.isConnected}
          isListening={voice.isListening}
          isSpeaking={voice.isSpeaking}
          isProcessing={voice.isProcessing}
          error={voice.error}
          messages={voice.messages}
        />
      </XRWindow>

      {/* Subway panel — right side, shows when data available */}
      {contentText && (
        <XRWindow
          title="MTA Subway"
          distance={0.6}
          width={0.4}
          height={0.35}
          horizontalOffset={0.15}
        >
          <SubwayArrivals3D contentText={contentText} />
        </XRWindow>
      )}

      {/* Voice status indicator */}
      <VoiceIndicator3D
        isConnected={voice.isConnected}
        isListening={voice.isListening}
        isSpeaking={voice.isSpeaking}
        isProcessing={voice.isProcessing}
      />
    </>
  )
}

function App() {
  const mcpData = useMCPData()

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
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}>
          <h1 style={{ color: '#fff', fontSize: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
            XR MCP App
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
        <MCPAppPanel mcpData={mcpData} />
      </div>

      {/* XR Canvas — behind browser UI, becomes immersive on Enter AR */}
      <Canvas style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
        <XR store={xrStore}>
          <XRScene autoContent={mcpData.toolResultContent} />
          <ambientLight intensity={0.5} />
        </XR>
      </Canvas>
    </div>
  )
}

export default App
