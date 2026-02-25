/**
 * DetectionOverlay3D — renders YOLO bounding boxes in XR space.
 * Ported from garvis/xr-client/src/components/XRCameraFeed.tsx.
 * Follows camera, maps pixel coords to 3D plane via pixelToPlane.
 */

import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import type { Detection } from '../hooks/useDetection'

const OVERLAY_CONFIG = {
  distance: 0.6,
  xOffset: 0.04,
  yOffset: -0.130,
  planeHeight: 0.2,
  baseDistance: 0.18,
}

const CLASS_COLORS: Record<string, string> = {
  person: '#ff9f1c',
  car: '#ff6b6b',
  truck: '#ff6b6b',
  bus: '#ff6b6b',
  bicycle: '#4ecdc4',
  motorcycle: '#4ecdc4',
  dog: '#ffe66d',
  cat: '#ffe66d',
  bird: '#ffe66d',
  laptop: '#a855f7',
  cell_phone: '#a855f7',
  tv: '#a855f7',
  cup: '#22c55e',
  bottle: '#22c55e',
  chair: '#f59e0b',
  couch: '#f59e0b',
  bed: '#f59e0b',
  book: '#8b5cf6',
  clock: '#ec4899',
  default: '#39ff14',
}

function getClassColor(className: string): string {
  return CLASS_COLORS[className.toLowerCase()] || CLASS_COLORS.default
}

function CornerAccents({ width, height, color }: { width: number; height: number; color: string }) {
  const size = 0.008
  const thickness = 0.0008
  const corners = [
    { x: -width / 2, y: height / 2, rotH: 0, rotV: 0 },
    { x: width / 2, y: height / 2, rotH: 0, rotV: Math.PI },
    { x: -width / 2, y: -height / 2, rotH: Math.PI, rotV: 0 },
    { x: width / 2, y: -height / 2, rotH: Math.PI, rotV: Math.PI },
  ]

  return (
    <>
      {corners.map((corner, i) => (
        <group key={i} position={[corner.x, corner.y, 0.0002]}>
          <mesh position={[corner.rotV ? -size / 2 : size / 2, 0, 0]}>
            <planeGeometry args={[size, thickness * 2]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh position={[0, corner.rotH ? size / 2 : -size / 2, 0]}>
            <planeGeometry args={[thickness * 2, size]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      ))}
    </>
  )
}

function ObjectBoundingBox({
  detection,
  imageSize,
  planeWidth,
  planeHeight,
}: {
  detection: Detection
  imageSize: { width: number; height: number }
  planeWidth: number
  planeHeight: number
}) {
  const { bbox, confidence } = detection
  const className = detection.class
  const color = getClassColor(className)

  const nx1 = bbox.x1 / imageSize.width
  const ny1 = bbox.y1 / imageSize.height
  const nx2 = bbox.x2 / imageSize.width
  const ny2 = bbox.y2 / imageSize.height

  const x1 = (nx1 - 0.5) * planeWidth
  const y1 = (0.5 - ny1) * planeHeight
  const x2 = (nx2 - 0.5) * planeWidth
  const y2 = (0.5 - ny2) * planeHeight

  const centerX = (x1 + x2) / 2
  const centerY = (y1 + y2) / 2
  const width = Math.abs(x2 - x1)
  const height = Math.abs(y1 - y2)

  const label = `${className} ${Math.round(confidence * 100)}%`
  const lineWidth = 0.00035

  return (
    <group position={[centerX, centerY, 0.002]}>
      <mesh position={[0, height / 2 - lineWidth / 2, 0]}>
        <planeGeometry args={[width, lineWidth]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, -height / 2 + lineWidth / 2, 0]}>
        <planeGeometry args={[width, lineWidth]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[-width / 2 + lineWidth / 2, 0, 0]}>
        <planeGeometry args={[lineWidth, height]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[width / 2 - lineWidth / 2, 0, 0]}>
        <planeGeometry args={[lineWidth, height]} />
        <meshBasicMaterial color={color} />
      </mesh>

      <CornerAccents width={width} height={height} color={color} />

      <mesh position={[-width / 2 + 0.025, height / 2 + 0.006, 0.001]}>
        <planeGeometry args={[0.045, 0.010]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.75} />
      </mesh>
      <Text
        position={[-width / 2 + 0.025, height / 2 + 0.006, 0.002]}
        fontSize={0.006}
        color={color}
        anchorX="center"
        anchorY="middle"
        maxWidth={0.1}
      >
        {label}
      </Text>
    </group>
  )
}

interface DetectionOverlay3DProps {
  detections: Detection[]
  imageSize: { width: number; height: number } | null
  fps: number
  latency: number
  /** Projection matrix from Raw Camera Access (column-major 4x4) */
  projectionMatrix?: Float32Array | null
  /** Whether using Raw Camera Access or getUserMedia fallback */
  isRawCameraAccess?: boolean
}

export function DetectionOverlay3D({
  detections, imageSize, fps, latency, projectionMatrix, isRawCameraAccess,
}: DetectionOverlay3DProps) {
  const session = useXR((s) => s.session)
  const isPresenting = !!session
  const { camera } = useThree()
  const groupRef = useRef<THREE.Group>(null)

  const planeDimensions = useMemo(() => {
    if (isRawCameraAccess && projectionMatrix && imageSize) {
      // Compute exact plane dimensions from projection matrix intrinsics
      const fx = projectionMatrix[0] // focal length X in NDC
      const fy = projectionMatrix[5] // focal length Y in NDC
      const distance = OVERLAY_CONFIG.distance
      // At distance d, visible width = 2*d/fx, height = 2*d/fy
      return { width: (2 * distance) / fx, height: (2 * distance) / fy }
    }
    if (imageSize) {
      const aspectRatio = imageSize.width / imageSize.height
      const height = OVERLAY_CONFIG.planeHeight
      return { width: height * aspectRatio, height }
    }
    return { width: 0.27, height: 0.2 }
  }, [imageSize, isRawCameraAccess, projectionMatrix])

  useFrame(() => {
    if (!groupRef.current || !isPresenting) return

    const cameraPosition = new THREE.Vector3()
    const cameraQuat = new THREE.Quaternion()
    camera.getWorldPosition(cameraPosition)
    camera.getWorldQuaternion(cameraQuat)

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat).normalize()

    if (isRawCameraAccess && projectionMatrix) {
      // Raw Camera Access: texture is aligned with XRView — no heuristic offsets needed
      const position = cameraPosition.clone()
        .add(forward.multiplyScalar(OVERLAY_CONFIG.distance))

      groupRef.current.position.copy(position)
      groupRef.current.quaternion.copy(cameraQuat)
      groupRef.current.scale.setScalar(1)
    } else {
      // Fallback: use heuristic offsets for getUserMedia camera misalignment
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuat).normalize()
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuat).normalize()

      const position = cameraPosition
        .clone()
        .add(forward.multiplyScalar(OVERLAY_CONFIG.distance))
        .add(right.multiplyScalar(OVERLAY_CONFIG.xOffset))
        .add(up.multiplyScalar(OVERLAY_CONFIG.yOffset))

      groupRef.current.position.copy(position)
      groupRef.current.quaternion.copy(cameraQuat)

      const scale = OVERLAY_CONFIG.distance / OVERLAY_CONFIG.baseDistance
      groupRef.current.scale.setScalar(scale)
    }
  })

  if (!isPresenting || !imageSize || detections.length === 0) return null

  return (
    <group ref={groupRef}>
      {detections.map((det) => (
        <ObjectBoundingBox
          key={`det-${det.id}-${det.class}-${det.bbox.x1}`}
          detection={det}
          imageSize={imageSize}
          planeWidth={planeDimensions.width}
          planeHeight={planeDimensions.height}
        />
      ))}

      {/* Debug stats */}
      <Text
        position={[0, -OVERLAY_CONFIG.planeHeight / 2 - 0.008, 0.001]}
        fontSize={0.005}
        color="#39ff14"
        anchorX="center"
        anchorY="middle"
      >
        {`YOLO: ${detections.length} obj | ${fps} fps | ${latency}ms`}
      </Text>
    </group>
  )
}
