/**
 * VoiceIndicator3D — small floating sphere indicating voice state.
 * Positioned below center of FOV, follows camera.
 */

import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { colors, animation } from '../design-system'

interface VoiceIndicator3DProps {
  isConnected: boolean
  isListening: boolean
  isSpeaking: boolean
  isProcessing: boolean
}

function getIndicatorColor(props: VoiceIndicator3DProps): string {
  if (!props.isConnected) return colors.error.base
  if (props.isListening) return colors.success.base
  if (props.isProcessing) return '#facc15'
  if (props.isSpeaking) return colors.accent.secondary
  return colors.text.tertiary
}

const DISTANCE = 0.5
const VERTICAL_OFFSET = -0.15
const SPHERE_RADIUS = 0.006

export function VoiceIndicator3D(props: VoiceIndicator3DProps) {
  const groupRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const { camera } = useThree()

  const indicatorColor = getIndicatorColor(props)
  const isActive = props.isListening || props.isSpeaking || props.isProcessing

  const geometry = useMemo(() => new THREE.SphereGeometry(SPHERE_RADIUS, 16, 16), [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return

    const cameraPos = new THREE.Vector3()
    const cameraQuat = new THREE.Quaternion()
    camera.getWorldPosition(cameraPos)
    camera.getWorldQuaternion(cameraQuat)

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat).normalize()
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuat).normalize()

    const targetPos = cameraPos
      .clone()
      .add(forward.multiplyScalar(DISTANCE))
      .add(up.multiplyScalar(VERTICAL_OFFSET))

    groupRef.current.position.lerp(targetPos, animation.lerpFactor)
    groupRef.current.quaternion.slerp(cameraQuat, animation.lerpFactor)

    // Pulse animation when active
    if (meshRef.current && isActive) {
      const scale = 1 + Math.sin(clock.getElapsedTime() * 4) * 0.2
      meshRef.current.scale.setScalar(scale)
    } else if (meshRef.current) {
      meshRef.current.scale.setScalar(1)
    }
  })

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} geometry={geometry}>
        <meshBasicMaterial color={indicatorColor} />
      </mesh>
    </group>
  )
}
