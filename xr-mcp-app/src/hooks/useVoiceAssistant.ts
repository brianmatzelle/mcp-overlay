/**
 * useVoiceAssistant — React hook bridging GarvisClient events to React state.
 * Simplified from garvis/xr-client/src/voice/useVoiceAssistant.ts
 * (uses React state instead of Koota ECS).
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { GarvisClient, type MCPToolResultContent } from '../voice/garvis-client'

export interface VoiceMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface MCPToolResult {
  toolName: string
  content: MCPToolResultContent[]
}

export interface VoiceAssistantState {
  isConnected: boolean
  isListening: boolean
  isSpeaking: boolean
  isProcessing: boolean
  isMuted: boolean
  error: string | null
  messages: VoiceMessage[]
  mcpToolResults: Record<string, MCPToolResult>
  toggleMute: () => void
}

export function useVoiceAssistant(opts: { enabled: boolean }): VoiceAssistantState {
  const { enabled } = opts

  const clientRef = useRef<GarvisClient | null>(null)
  const connectingRef = useRef(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<VoiceMessage[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [mcpToolResults, setMcpToolResults] = useState<Record<string, MCPToolResult>>({})

  // Track current streaming messages by timestamp
  const currentUserTs = useRef<number | null>(null)
  const currentAssistantTs = useRef<number | null>(null)

  const upsertMessage = useCallback(
    (role: 'user' | 'assistant', content: string, ts: number) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.timestamp === ts)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = { ...updated[idx], content }
          return updated
        }
        return [...prev, { role, content, timestamp: ts }]
      })
    },
    [],
  )

  const createClient = useCallback(() => {
    return new GarvisClient({
      onConnected: () => {
        connectingRef.current = false
        setIsConnected(true)
        setError(null)
      },
      onDisconnected: () => {
        connectingRef.current = false
        setIsConnected(false)
        setIsListening(false)
        setIsSpeaking(false)
        setIsProcessing(false)
      },
      onError: (err) => {
        console.error('Garvis error:', err)
        connectingRef.current = false
        setError(err.message)
      },
      onTranscript: (text, isFinal, role) => {
        if (role === 'user') {
          if (isFinal) {
            if (currentUserTs.current) {
              upsertMessage('user', text, currentUserTs.current)
            } else {
              upsertMessage('user', text, Date.now())
            }
            currentUserTs.current = null
          } else {
            if (!currentUserTs.current) {
              currentUserTs.current = Date.now()
            }
            upsertMessage('user', text, currentUserTs.current)
          }
        } else {
          if (isFinal) {
            if (currentAssistantTs.current) {
              upsertMessage('assistant', text, currentAssistantTs.current)
            } else {
              upsertMessage('assistant', text, Date.now())
            }
            currentAssistantTs.current = null
          } else {
            if (!currentAssistantTs.current) {
              currentAssistantTs.current = Date.now()
            }
            upsertMessage('assistant', text, currentAssistantTs.current)
          }
        }
      },
      onListening: (listening) => {
        setIsListening(listening)
        if (listening) setIsProcessing(false)
      },
      onSpeaking: (speaking) => {
        setIsSpeaking(speaking)
        if (speaking) {
          setIsProcessing(false)
        } else {
          setIsProcessing(true)
        }
      },
      onMCPToolResult: (toolName, content) => {
        setMcpToolResults(prev => ({ ...prev, [toolName]: { toolName, content } }))
      },
    })
  }, [upsertMessage])

  // Single effect keyed only on `enabled` — stable callbacks via refs avoid re-triggers
  useEffect(() => {
    if (!enabled) {
      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
      }
      connectingRef.current = false
      return
    }

    // Guard: don't connect if already connected or in-flight
    if (clientRef.current?.isConnected() || connectingRef.current) {
      return
    }

    // Clean up stale client that isn't connected
    if (clientRef.current) {
      clientRef.current.disconnect()
      clientRef.current = null
    }

    connectingRef.current = true
    const client = createClient()
    clientRef.current = client

    // Delay connection to let XR session stabilize
    const timeout = setTimeout(() => {
      // Verify this client is still the current one (guards against StrictMode remount)
      if (clientRef.current !== client) {
        connectingRef.current = false
        return
      }
      client.connect().catch((err) => {
        console.error('Failed to connect:', err)
        connectingRef.current = false
        setError(err instanceof Error ? err.message : 'Connection failed')
      })
    }, 500)

    return () => {
      clearTimeout(timeout)
      connectingRef.current = false
      if (clientRef.current === client) {
        client.disconnect()
        clientRef.current = null
      }
    }
  }, [enabled, createClient])

  const toggleMute = useCallback(() => {
    const client = clientRef.current
    if (!client) return
    if (client.isMuted()) {
      client.unmute()
      setIsMuted(false)
    } else {
      client.mute()
      setIsMuted(true)
    }
  }, [])

  return {
    isConnected,
    isListening,
    isSpeaking,
    isProcessing,
    isMuted,
    error,
    messages,
    mcpToolResults,
    toggleMute,
  }
}
