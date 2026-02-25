/**
 * GaussianSplat3D — renders a Gaussian splat PLY file in XR space.
 *
 * Receives the generate-splat-from-image tool result (JSON with artifact_url),
 * fetches the PLY via the artifact URL, and renders it using @sparkjsdev/spark.
 * Supports gaze-anchored positioning (worldPosition) or camera-follow fallback.
 */

import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { SparkRenderer } from './spark/SparkRenderer.tsx'
import { SplatMesh } from './spark/SplatMesh.tsx'
import { colors, typography, opacity, radii, createRoundedRectGeometry } from '../design-system.ts'
import type { SplatMesh as SparkSplatMeshType } from '@sparkjsdev/spark'

interface SplatToolResult {
  success: boolean
  artifact_url: string
  artifact_id: string
  vertex_count: number
  size_bytes: number
  backend: string
  error?: string
}

interface GaussianSplat3DProps {
  /** Raw JSON string from tool result content[0].text */
  contentText: string | null
  /** Fixed world-space anchor position (from gaze anchor) */
  worldPosition?: THREE.Vector3
}

export function GaussianSplat3D({ contentText, worldPosition }: GaussianSplat3DProps) {
  const session = useXR((s) => s.session)
  const isPresenting = !!session
  const { camera, gl } = useThree()
  const groupRef = useRef<THREE.Group>(null)
  const splatRef = useRef<SparkSplatMeshType>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Parse tool result JSON
  const data = useMemo<SplatToolResult | null>(() => {
    if (!contentText) return null
    try {
      return JSON.parse(contentText)
    } catch {
      return null
    }
  }, [contentText])

  // Memoize SparkRenderer args
  const sparkArgs = useMemo(() => ({ renderer: gl }), [gl])

  // Memoize SplatMesh args — changes when artifact URL changes
  const splatArgs = useMemo(() => {
    if (!data?.success || !data?.artifact_url) return null
    return {
      url: data.artifact_url,
      onLoad: () => {
        setLoading(false)
        setLoaded(true)
      },
    } as const
  }, [data])

  // Track loading state
  useEffect(() => {
    if (splatArgs) {
      setLoading(true)
      setLoaded(false)
      setError(null)
    }
  }, [splatArgs])

  // Position: gaze-anchored (world position) or camera-follow fallback
  useFrame(() => {
    if (!groupRef.current || !isPresenting) return

    const cameraPosition = new THREE.Vector3()
    camera.getWorldPosition(cameraPosition)

    if (worldPosition) {
      // Gaze-anchored: fixed in world space, smooth lerp to target
      groupRef.current.position.lerp(worldPosition, 0.15)
      // Don't billboard — let the 3D model keep its orientation
    } else {
      // Fallback: 1.5m in front of camera
      const cameraQuat = new THREE.Quaternion()
      camera.getWorldQuaternion(cameraQuat)
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat)
      const target = cameraPosition.clone().add(forward.multiplyScalar(1.5))
      groupRef.current.position.lerp(target, 0.15)
    }
  })

  if (!isPresenting || !data) return null

  // Error state
  if (!data.success) {
    return (
      <group ref={groupRef}>
        <Text
          fontSize={typography.fontSize.sm}
          color={colors.error.base}
          anchorX="center"
          anchorY="middle"
        >
          {`Splat error: ${data.error || 'Unknown error'}`}
        </Text>
      </group>
    )
  }

  const badgeGeometry = createRoundedRectGeometry(0.12, 0.02, radii.sm)

  return (
    <group ref={groupRef}>
      {/* SparkRenderer wraps all SplatMesh components */}
      <SparkRenderer args={[sparkArgs]}>
        {splatArgs && (
          <SplatMesh
            ref={splatRef}
            args={[splatArgs]}
            scale={0.5}
          />
        )}
      </SparkRenderer>

      {/* Loading indicator */}
      {loading && (
        <Text
          position={[0, 0, 0]}
          fontSize={typography.fontSize.md}
          color={colors.accent.primary}
          anchorX="center"
          anchorY="middle"
        >
          Generating 3D model...
        </Text>
      )}

      {/* Info badge below the splat */}
      {loaded && (
        <group position={[0, -0.35, 0]}>
          <mesh geometry={badgeGeometry}>
            <meshBasicMaterial
              color={colors.bg.primary}
              transparent
              opacity={opacity.heavy}
            />
          </mesh>
          <Text
            position={[0, 0, 0.001]}
            fontSize={typography.fontSize.xs}
            color={colors.text.secondary}
            anchorX="center"
            anchorY="middle"
          >
            {`3D Splat · ${data.vertex_count.toLocaleString()} gaussians`}
          </Text>
        </group>
      )}
    </group>
  )
}
