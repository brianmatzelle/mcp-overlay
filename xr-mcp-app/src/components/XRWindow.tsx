/**
 * XRWindow — camera-following 3D window container for XR.
 * Simplified version of Garvis's Window.tsx (visor mode only, no drag/resize).
 */

import { useRef, useMemo, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import {
  colors,
  typography,
  radii,
  opacity,
  animation,
  zLayers,
  windowDefaults,
  createRoundedRectGeometry,
} from '../design-system.ts'

interface XRWindowProps {
  title: string
  children: ReactNode
  /** Panel width in meters */
  width?: number
  /** Panel height in meters */
  height?: number
  /** Distance from camera in meters */
  distance?: number
  /** Horizontal offset from camera center in meters */
  horizontalOffset?: number
  /** Vertical offset from camera center in meters */
  verticalOffset?: number
}

export function XRWindow({
  title,
  children,
  width = 0.4,
  height = 0.35,
  distance = 0.6,
  horizontalOffset = 0,
  verticalOffset = -0.05,
}: XRWindowProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()

  // Total panel height = title bar + content
  const totalHeight = height + windowDefaults.titleBarHeight
  const titleBarY = totalHeight / 2 - windowDefaults.titleBarHeight / 2
  const contentY = titleBarY - windowDefaults.titleBarHeight / 2 - height / 2

  const panelRadius = Math.min(radii.xl, width * 0.05, totalHeight * 0.05)

  const panelGeometry = useMemo(
    () => createRoundedRectGeometry(width, totalHeight, panelRadius),
    [width, totalHeight, panelRadius]
  )

  const titleBarGeometry = useMemo(
    () => createRoundedRectGeometry(width - 0.01, windowDefaults.titleBarHeight - 0.005, radii.md),
    [width]
  )

  // Camera-follow: visor mode (locked to head rotation)
  useFrame(() => {
    if (!groupRef.current) return

    const cameraPos = new THREE.Vector3()
    const cameraWorldQuat = new THREE.Quaternion()

    camera.getWorldPosition(cameraPos)
    camera.getWorldQuaternion(cameraWorldQuat)

    // Calculate forward/right/up vectors from camera quaternion
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraWorldQuat).normalize()
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraWorldQuat).normalize()
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraWorldQuat).normalize()

    const targetPos = cameraPos
      .clone()
      .add(forward.multiplyScalar(distance))
      .add(right.multiplyScalar(horizontalOffset))
      .add(up.multiplyScalar(verticalOffset))

    // Smooth lerp position and slerp rotation
    groupRef.current.position.lerp(targetPos, animation.lerpFactor)
    groupRef.current.quaternion.slerp(cameraWorldQuat, animation.lerpFactor)
  })

  return (
    <group ref={groupRef}>
      {/* Background panel */}
      <mesh geometry={panelGeometry} position-z={zLayers.background}>
        <meshBasicMaterial
          color={colors.bg.primary}
          transparent
          opacity={opacity.solid}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Border */}
      <mesh geometry={panelGeometry} position-z={zLayers.border}>
        <meshBasicMaterial
          color={colors.border.accent}
          transparent
          opacity={opacity.medium}
          wireframe
        />
      </mesh>

      {/* Title bar background */}
      <mesh geometry={titleBarGeometry} position-y={titleBarY} position-z={zLayers.overlay}>
        <meshBasicMaterial
          color={colors.bg.secondary}
          transparent
          opacity={opacity.heavy}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Title text */}
      <Text
        position={[0, titleBarY, zLayers.controls]}
        fontSize={typography.fontSize.md}
        color={colors.accent.secondary}
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        {title}
      </Text>

      {/* Content area */}
      <group position={[0, contentY, zLayers.content]}>
        {children}
      </group>
    </group>
  )
}
