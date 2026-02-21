/**
 * ChatWindow3D — 3D chat transcript for XR.
 * Shows voice status and recent conversation messages.
 * Adapted from garvis/xr-client/src/features/chat/ChatContent.tsx.
 */

import { useMemo } from 'react'
import { Text } from '@react-three/drei'
import { colors, typography } from '../design-system'
import type { VoiceMessage } from '../hooks/useVoiceAssistant'

interface ChatWindow3DProps {
  isConnected: boolean
  isListening: boolean
  isSpeaking: boolean
  isProcessing: boolean
  error: string | null
  messages: VoiceMessage[]
}

const MAX_VISIBLE = 6
const CONTENT_WIDTH = 0.3
const LINE_HEIGHT = 0.014
const FONT_SIZE = typography.fontSize.sm

function getStatusText(props: ChatWindow3DProps): string {
  if (!props.isConnected) return 'Disconnected'
  if (props.error) return `Error: ${props.error}`
  if (props.isListening) return 'Listening...'
  if (props.isProcessing) return 'Thinking...'
  if (props.isSpeaking) return 'Speaking...'
  return 'Ready'
}

function getStatusColor(props: ChatWindow3DProps): string {
  if (!props.isConnected) return colors.error.base
  if (props.error) return colors.error.base
  if (props.isListening) return colors.success.base
  if (props.isProcessing) return '#facc15'
  if (props.isSpeaking) return colors.accent.secondary
  return colors.success.base
}

export function ChatWindow3D(props: ChatWindow3DProps) {
  const { messages } = props

  const visible = useMemo(() => {
    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp)
    return sorted.slice(-MAX_VISIBLE)
  }, [messages])

  const statusText = getStatusText(props)
  const statusColor = getStatusColor(props)

  const contentLeft = -CONTENT_WIDTH / 2

  return (
    <group>
      {/* Status text */}
      <Text
        position={[contentLeft, 0.09, 0]}
        fontSize={typography.fontSize.base}
        color={statusColor}
        anchorX="left"
        anchorY="middle"
        font={undefined}
      >
        {statusText}
      </Text>

      {/* Messages */}
      {visible.map((msg, i) => {
        const prefix = msg.role === 'user' ? 'You: ' : 'Garvis: '
        const y = 0.07 - i * LINE_HEIGHT * 2
        return (
          <Text
            key={msg.timestamp}
            position={[contentLeft, y, 0]}
            fontSize={FONT_SIZE}
            color={msg.role === 'user' ? colors.text.user : colors.text.assistant}
            anchorX="left"
            anchorY="top"
            maxWidth={CONTENT_WIDTH}
            font={undefined}
          >
            {prefix + msg.content}
          </Text>
        )
      })}

      {/* Empty state */}
      {messages.length === 0 && (
        <Text
          position={[contentLeft, 0.04, 0]}
          fontSize={FONT_SIZE}
          color={colors.text.tertiary}
          anchorX="left"
          anchorY="middle"
          font={undefined}
        >
          Say something to start...
        </Text>
      )}
    </group>
  )
}
