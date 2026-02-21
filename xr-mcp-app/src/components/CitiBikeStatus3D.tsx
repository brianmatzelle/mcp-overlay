/**
 * CitiBikeStatus3D — renders Citi Bike station data as 3D text elements.
 * Parses the tool result JSON and displays station name, bike counts,
 * dock availability, capacity bar, and status using @react-three/drei <Text>.
 */

import { useMemo } from 'react'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { colors, typography, spacing, zLayers } from '../design-system.ts'

interface CitiBikeData {
  stationName: string
  stationId: string
  lat: number
  lon: number
  capacity: number
  classicBikes: number
  ebikes: number
  totalBikes: number
  docksAvailable: number
  fillPercent: number
  isRenting: boolean
  isReturning: boolean
  lastReported: number
  fetchedAt: string
}

interface CitiBikeStatus3DProps {
  /** Raw JSON string from tool result content[0].text */
  contentText: string | null
}

/** Color based on count: green >5, yellow 1-5, red 0 */
function countColor(count: number): string {
  if (count === 0) return colors.error.base
  if (count <= 5) return '#fbbf24' // yellow
  return colors.success.base
}

export function CitiBikeStatus3D({ contentText }: CitiBikeStatus3DProps) {
  if (!contentText) {
    return (
      <Text
        fontSize={typography.fontSize.base}
        color={colors.text.secondary}
        anchorX="center"
        anchorY="middle"
      >
        Loading station data...
      </Text>
    )
  }

  let data: CitiBikeData
  try {
    data = JSON.parse(contentText)
  } catch {
    return (
      <Text
        fontSize={typography.fontSize.base}
        color={colors.error.base}
        anchorX="center"
        anchorY="middle"
      >
        Failed to parse data
      </Text>
    )
  }

  const lineSpacing = typography.fontSize.base * 2.5
  let y = 0.1 // Start from top of content area
  const leftX = -0.16

  return (
    <group position-z={zLayers.controls}>
      {/* Station name header */}
      <Text
        position={[0, y, 0]}
        fontSize={typography.fontSize.md}
        color={colors.text.primary}
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {data.stationName}
      </Text>

      {/* Separator */}
      {(() => { y -= spacing.md; return null })()}
      <mesh position={[0, y, 0]}>
        <planeGeometry args={[0.34, 0.001]} />
        <meshBasicMaterial color="#0053D6" transparent opacity={0.5} />
      </mesh>

      {/* Bikes Available section */}
      {(() => { y -= spacing.md * 1.5; return null })()}
      <Text
        position={[leftX, y, 0]}
        fontSize={typography.fontSize.xs}
        color={colors.text.tertiary}
        anchorX="left"
        anchorY="middle"
      >
        BIKES AVAILABLE
      </Text>

      {/* Classic bikes */}
      {(() => { y -= lineSpacing; return null })()}
      <Text
        position={[leftX, y, 0]}
        fontSize={typography.fontSize.lg}
        color={countColor(data.classicBikes)}
        anchorX="left"
        anchorY="middle"
        fontWeight="bold"
      >
        {String(data.classicBikes)}
      </Text>
      <Text
        position={[leftX + 0.06, y, 0]}
        fontSize={typography.fontSize.sm}
        color={colors.text.secondary}
        anchorX="left"
        anchorY="middle"
      >
        classic
      </Text>

      {/* E-bikes */}
      <Text
        position={[0.04, y, 0]}
        fontSize={typography.fontSize.lg}
        color={countColor(data.ebikes)}
        anchorX="left"
        anchorY="middle"
        fontWeight="bold"
      >
        {String(data.ebikes)}
      </Text>
      <Text
        position={[0.1, y, 0]}
        fontSize={typography.fontSize.sm}
        color={colors.text.secondary}
        anchorX="left"
        anchorY="middle"
      >
        ebike
      </Text>

      {/* Docks Available section */}
      {(() => { y -= lineSpacing; return null })()}
      <Text
        position={[leftX, y, 0]}
        fontSize={typography.fontSize.xs}
        color={colors.text.tertiary}
        anchorX="left"
        anchorY="middle"
      >
        DOCKS AVAILABLE
      </Text>

      {(() => { y -= lineSpacing; return null })()}
      <Text
        position={[leftX, y, 0]}
        fontSize={typography.fontSize.lg}
        color={countColor(data.docksAvailable)}
        anchorX="left"
        anchorY="middle"
        fontWeight="bold"
      >
        {String(data.docksAvailable)}
      </Text>
      <Text
        position={[leftX + 0.06, y, 0]}
        fontSize={typography.fontSize.sm}
        color={colors.text.secondary}
        anchorX="left"
        anchorY="middle"
      >
        {`of ${data.capacity}`}
      </Text>

      {/* Capacity bar */}
      {(() => { y -= lineSpacing * 0.8; return null })()}
      <CapacityBar y={y} fillPercent={data.fillPercent} />

      {/* Status badges */}
      {(!data.isRenting || !data.isReturning) && (() => {
        y -= lineSpacing * 0.8
        return (
          <group position={[leftX, y, 0]}>
            {!data.isRenting && (
              <Text
                position={[0, 0, 0]}
                fontSize={typography.fontSize.xs}
                color={colors.error.base}
                anchorX="left"
                anchorY="middle"
              >
                Not Renting
              </Text>
            )}
            {!data.isReturning && (
              <Text
                position={[!data.isRenting ? 0.12 : 0, 0, 0]}
                fontSize={typography.fontSize.xs}
                color={colors.error.base}
                anchorX="left"
                anchorY="middle"
              >
                Not Returning
              </Text>
            )}
          </group>
        )
      })()}

      {/* Updated timestamp */}
      {(() => { y -= lineSpacing * 0.6; return null })()}
      <Text
        position={[0, y, 0]}
        fontSize={typography.fontSize.xs}
        color={colors.text.tertiary}
        anchorX="center"
        anchorY="middle"
      >
        {`Updated ${formatTime(data.fetchedAt)}`}
      </Text>
    </group>
  )
}

function CapacityBar({ y, fillPercent }: { y: number; fillPercent: number }) {
  const barWidth = 0.32
  const barHeight = 0.008
  const fillWidth = barWidth * (fillPercent / 100)

  const bgGeometry = useMemo(
    () => new THREE.PlaneGeometry(barWidth, barHeight),
    []
  )
  const fillGeometry = useMemo(
    () => new THREE.PlaneGeometry(Math.max(0.001, fillWidth), barHeight),
    [fillWidth]
  )

  return (
    <group position={[0, y, 0]}>
      {/* Background bar */}
      <mesh geometry={bgGeometry}>
        <meshBasicMaterial color="#333333" />
      </mesh>
      {/* Fill bar */}
      <mesh
        geometry={fillGeometry}
        position={[-(barWidth - fillWidth) / 2, 0, 0.0005]}
      >
        <meshBasicMaterial color="#0053D6" />
      </mesh>
      {/* Percent label */}
      <Text
        position={[barWidth / 2 + 0.02, 0, 0]}
        fontSize={typography.fontSize.xs}
        color={colors.text.tertiary}
        anchorX="left"
        anchorY="middle"
      >
        {`${fillPercent}%`}
      </Text>
    </group>
  )
}

function formatTime(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}
