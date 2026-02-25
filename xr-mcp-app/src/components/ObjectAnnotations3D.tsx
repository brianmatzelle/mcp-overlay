/**
 * ObjectAnnotations3D — renders enriched object annotations in XR space.
 * Each detected object gets a mini card positioned at its bounding box location.
 * Uses pixelToPlane() mapping from XRCameraFeed and design tokens from design-system.
 */

import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { colors, typography, opacity, radii, createRoundedRectGeometry } from '../design-system.ts'

// Overlay positioning config — tuned for Quest 3 passthrough alignment
// (same values as garvis XRCameraFeed)
const OVERLAY_CONFIG = {
  distance: 0.6,
  xOffset: 0.04,
  yOffset: -0.130,
  planeHeight: 0.2,
  baseDistance: 0.18,
}

interface ObjectBBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface ObjectIdentification {
  name: string
  brand: string | null
  model: string | null
  color: string
  category: string
  description: string
}

interface ObjectEnrichment {
  summary: string
  price_estimate: {
    range_low: string
    range_high: string
    currency: string
    note: string
  }
  specs: Record<string, string>
  search_query: string
}

interface DetectedObject {
  id: number
  class: string
  confidence: number
  bbox: ObjectBBox
  identification: ObjectIdentification
  enrichment: ObjectEnrichment
}

interface VisionResearchResult {
  success: boolean
  count: number
  image_size: { width: number; height: number }
  objects: DetectedObject[]
}

interface ObjectAnnotations3DProps {
  /** Raw JSON string from tool result content[0].text */
  contentText: string | null
  /** Projection matrix from Raw Camera Access (column-major 4x4) */
  projectionMatrix?: Float32Array | null
  /** Whether using Raw Camera Access or getUserMedia fallback */
  isRawCameraAccess?: boolean
  /** Fixed world-space anchor position (overrides camera-follow) */
  worldPosition?: THREE.Vector3
}

/** Convert pixel coords to plane coords (origin center, Y up) */
function pixelToPlane(
  px: number,
  py: number,
  imageWidth: number,
  imageHeight: number,
  planeWidth: number,
  planeHeight: number,
) {
  const nx = px / imageWidth
  const ny = py / imageHeight
  const x = (nx - 0.5) * planeWidth
  const y = (0.5 - ny) * planeHeight
  return { x, y }
}

/** Single annotation card for one detected object */
function AnnotationCard({
  obj,
  imageSize,
  planeWidth,
  planeHeight,
}: {
  obj: DetectedObject
  imageSize: { width: number; height: number }
  planeWidth: number
  planeHeight: number
}) {
  const { bbox, identification, enrichment } = obj

  // Card anchor: center of bounding box
  const bboxCenterX = (bbox.x1 + bbox.x2) / 2
  const bboxCenterY = (bbox.y1 + bbox.y2) / 2
  const bboxTopY = bbox.y1

  const anchor = pixelToPlane(bboxCenterX, bboxCenterY, imageSize.width, imageSize.height, planeWidth, planeHeight)
  const top = pixelToPlane(bboxCenterX, bboxTopY, imageSize.width, imageSize.height, planeWidth, planeHeight)

  // Card positioned above the bbox
  const cardOffsetY = 0.025
  const cardX = anchor.x
  const cardY = top.y + cardOffsetY

  // Card dimensions
  const cardWidth = 0.08
  const cardHeight = 0.045

  const name = identification?.name || obj.class
  const brand = identification?.brand
  const priceLow = enrichment?.price_estimate?.range_low
  const priceHigh = enrichment?.price_estimate?.range_high
  const priceText = priceLow && priceHigh ? `${priceLow} - ${priceHigh}` : priceLow || priceHigh || ''

  const cardGeometry = useMemo(
    () => createRoundedRectGeometry(cardWidth, cardHeight, radii.sm),
    [cardWidth, cardHeight],
  )

  return (
    <group position={[cardX, cardY, 0.003]}>
      {/* Card background */}
      <mesh geometry={cardGeometry}>
        <meshBasicMaterial color={colors.bg.primary} transparent opacity={opacity.strong} />
      </mesh>

      {/* Accent bar at top */}
      <mesh position={[0, cardHeight / 2 - 0.001, 0.001]}>
        <planeGeometry args={[cardWidth - 0.004, 0.002]} />
        <meshBasicMaterial color={colors.accent.primary} />
      </mesh>

      {/* Product name */}
      <Text
        position={[0, cardHeight / 2 - 0.010, 0.001]}
        fontSize={typography.fontSize.xs}
        color={colors.text.primary}
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
        maxWidth={cardWidth - 0.008}
      >
        {name.length > 28 ? name.slice(0, 26) + '...' : name}
      </Text>

      {/* Brand */}
      {brand && (
        <Text
          position={[0, cardHeight / 2 - 0.019, 0.001]}
          fontSize={typography.fontSize.xs * 0.85}
          color={colors.text.secondary}
          anchorX="center"
          anchorY="middle"
          maxWidth={cardWidth - 0.008}
        >
          {brand}
        </Text>
      )}

      {/* Price range */}
      {priceText && (
        <Text
          position={[0, -cardHeight / 2 + 0.008, 0.001]}
          fontSize={typography.fontSize.xs}
          color={colors.success.base}
          anchorX="center"
          anchorY="middle"
        >
          {priceText}
        </Text>
      )}

      {/* Connector line from card to bbox center */}
      <ConnectorLine
        fromX={0}
        fromY={-cardHeight / 2}
        toX={0}
        toY={anchor.y - cardY}
      />
    </group>
  )
}

/** Thin line connecting card to bbox */
function ConnectorLine({
  fromX,
  fromY,
  toX,
  toY,
}: {
  fromX: number
  fromY: number
  toX: number
  toY: number
}) {
  const dx = toX - fromX
  const dy = toY - fromY
  const length = Math.sqrt(dx * dx + dy * dy)
  if (length < 0.001) return null

  const midX = (fromX + toX) / 2
  const midY = (fromY + toY) / 2
  const angle = Math.atan2(dy, dx)

  return (
    <mesh position={[midX, midY, -0.001]} rotation={[0, 0, angle]}>
      <planeGeometry args={[length, 0.0005]} />
      <meshBasicMaterial color={colors.accent.primary} transparent opacity={opacity.semi} />
    </mesh>
  )
}

export function ObjectAnnotations3D({
  contentText, projectionMatrix, isRawCameraAccess, worldPosition,
}: ObjectAnnotations3DProps) {
  const session = useXR((s) => s.session)
  const isPresenting = !!session
  const { camera } = useThree()
  const groupRef = useRef<THREE.Group>(null)

  // Parse data
  const data = useMemo<VisionResearchResult | null>(() => {
    if (!contentText) return null
    try {
      return JSON.parse(contentText)
    } catch {
      return null
    }
  }, [contentText])

  // Calculate plane dimensions from image aspect ratio (or projection matrix)
  const planeDimensions = useMemo(() => {
    if (isRawCameraAccess && projectionMatrix && data?.image_size) {
      // Compute exact plane dimensions from projection matrix intrinsics
      const fx = projectionMatrix[0]
      const fy = projectionMatrix[5]
      const distance = OVERLAY_CONFIG.distance
      return { width: (2 * distance) / fx, height: (2 * distance) / fy }
    }
    if (data?.image_size) {
      const aspectRatio = data.image_size.width / data.image_size.height
      const height = OVERLAY_CONFIG.planeHeight
      return { width: height * aspectRatio, height }
    }
    return { width: 0.27, height: 0.2 }
  }, [data?.image_size, isRawCameraAccess, projectionMatrix])

  // Position overlay: world-anchored or camera-follow
  useFrame(() => {
    if (!groupRef.current || !isPresenting) return

    const cameraPosition = new THREE.Vector3()
    camera.getWorldPosition(cameraPosition)

    if (worldPosition) {
      // Gaze-anchored: fixed world position, billboard toward camera
      groupRef.current.position.lerp(worldPosition, 0.15)
      groupRef.current.lookAt(cameraPosition)
      groupRef.current.scale.setScalar(1)
      return
    }

    // Camera-follow modes (existing behavior)
    const cameraQuat = new THREE.Quaternion()
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

  if (!isPresenting || !data || !data.success || data.objects.length === 0) return null

  return (
    <group ref={groupRef}>
      {data.objects.map((obj) => (
        <AnnotationCard
          key={`obj-${obj.id}-${obj.bbox.x1}-${obj.bbox.y1}`}
          obj={obj}
          imageSize={data.image_size}
          planeWidth={planeDimensions.width}
          planeHeight={planeDimensions.height}
        />
      ))}

      {/* Result count badge */}
      <Text
        position={[0, -OVERLAY_CONFIG.planeHeight / 2 - 0.015, 0.001]}
        fontSize={typography.fontSize.xs}
        color={colors.text.tertiary}
        anchorX="center"
        anchorY="middle"
      >
        {`${data.count} object${data.count !== 1 ? 's' : ''} detected`}
      </Text>
    </group>
  )
}
