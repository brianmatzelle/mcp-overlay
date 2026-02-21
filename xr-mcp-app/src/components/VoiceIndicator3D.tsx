/**
 * VoiceIndicator3D — small sphere indicating voice state.
 * Camera-following is handled by the parent Window component.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colors } from '../design-system'

interface VoiceIndicator3DProps {
  isConnected: boolean
  isListening: boolean
  isSpeaking: boolean
  isProcessing: boolean
  isMuted?: boolean
}

function getIndicatorColor(props: VoiceIndicator3DProps): string {
  if (!props.isConnected) return colors.error.base
  if (props.isMuted) return colors.warning.base
  if (props.isListening) return colors.success.base
  if (props.isProcessing) return '#facc15'
  if (props.isSpeaking) return colors.accent.secondary
  return colors.text.tertiary
}

const SPHERE_RADIUS = 0.006

export function VoiceIndicator3D(props: VoiceIndicator3DProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  const indicatorColor = getIndicatorColor(props)
  const isActive = props.isListening || props.isSpeaking || props.isProcessing

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    if (isActive) {
      const scale = 1 + Math.sin(clock.getElapsedTime() * 4) * 0.2
      meshRef.current.scale.setScalar(scale)
    } else {
      meshRef.current.scale.setScalar(1)
    }
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[SPHERE_RADIUS, 16, 16]} />
      <meshBasicMaterial color={indicatorColor} />
    </mesh>
  )
}
