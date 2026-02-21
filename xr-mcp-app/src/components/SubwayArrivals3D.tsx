/**
 * SubwayArrivals3D — renders MTA subway arrival data as 3D text elements.
 * Parses the tool result JSON and displays station name, line indicator,
 * direction labels, and arrival times using @react-three/drei <Text>.
 */

import { Text } from '@react-three/drei'
import { colors, typography, spacing, zLayers } from '../design-system.ts'

interface SubwayDirection {
  label: string
  arrivals: number[]
}

interface SubwayData {
  line: string
  stationName: string
  directions: {
    N: SubwayDirection
    S: SubwayDirection
  }
  color: string
  fetchedAt: string
}

interface SubwayArrivals3DProps {
  /** Raw JSON string from tool result content[0].text */
  contentText: string | null
}

export function SubwayArrivals3D({ contentText }: SubwayArrivals3DProps) {
  if (!contentText) {
    return (
      <Text
        fontSize={typography.fontSize.base}
        color={colors.text.secondary}
        anchorX="center"
        anchorY="middle"
      >
        Loading arrivals...
      </Text>
    )
  }

  let data: SubwayData
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

  const lineColor = data.color || colors.accent.primary
  const startY = 0.08 // Start from top of content area
  const lineSpacing = typography.fontSize.base * 2.2
  let y = startY

  return (
    <group position-z={zLayers.controls}>
      {/* Line indicator circle + station name */}
      <group position={[0, y, 0]}>
        {/* Colored circle for subway line */}
        <mesh position={[-0.12, 0, 0]}>
          <circleGeometry args={[0.015, 32]} />
          <meshBasicMaterial color={lineColor} />
        </mesh>
        <Text
          position={[-0.12, 0, 0.001]}
          fontSize={typography.fontSize.base}
          color={colors.text.primary}
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          {data.line}
        </Text>

        {/* Station name */}
        <Text
          position={[-0.08, 0, 0]}
          fontSize={typography.fontSize.md}
          color={colors.text.primary}
          anchorX="left"
          anchorY="middle"
          fontWeight="bold"
        >
          {data.stationName}
        </Text>
      </group>

      {/* Separator line */}
      {(() => { y -= spacing.md; return null })()}
      <mesh position={[0, y, 0]}>
        <planeGeometry args={[0.34, 0.001]} />
        <meshBasicMaterial color={lineColor} transparent opacity={0.5} />
      </mesh>

      {/* Northbound direction */}
      {(() => { y -= spacing.md; return null })()}
      <DirectionGroup
        y={y}
        direction="N"
        label={data.directions.N.label}
        arrivals={data.directions.N.arrivals}
        lineColor={lineColor}
        lineSpacing={lineSpacing}
      />

      {/* Southbound direction */}
      {(() => {
        y -= spacing.md + lineSpacing * (1 + Math.min(data.directions.N.arrivals.length, 3));
        return null
      })()}
      <DirectionGroup
        y={y}
        direction="S"
        label={data.directions.S.label}
        arrivals={data.directions.S.arrivals}
        lineColor={lineColor}
        lineSpacing={lineSpacing}
      />

      {/* Updated timestamp */}
      {(() => {
        y -= spacing.md + lineSpacing * (1 + Math.min(data.directions.S.arrivals.length, 3));
        return null
      })()}
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

function DirectionGroup({
  y,
  direction,
  label,
  arrivals,
  lineColor,
  lineSpacing,
}: {
  y: number
  direction: string
  label: string
  arrivals: number[]
  lineColor: string
  lineSpacing: number
}) {
  const displayArrivals = arrivals.slice(0, 3)
  const arrowChar = direction === 'N' ? '\u2191' : '\u2193' // ↑ or ↓

  return (
    <group>
      {/* Direction header */}
      <Text
        position={[-0.16, y, 0]}
        fontSize={typography.fontSize.sm}
        color={lineColor}
        anchorX="left"
        anchorY="middle"
        fontWeight="bold"
      >
        {`${arrowChar} ${label}`}
      </Text>

      {/* Arrival times */}
      {displayArrivals.map((mins, i) => (
        <group key={i} position={[0, y - lineSpacing * (i + 1), 0]}>
          <Text
            position={[-0.16, 0, 0]}
            fontSize={typography.fontSize.base}
            color={colors.text.primary}
            anchorX="left"
            anchorY="middle"
          >
            {mins <= 0 ? 'Now' : `${mins} min`}
          </Text>
          <Text
            position={[0.16, 0, 0]}
            fontSize={typography.fontSize.xs}
            color={mins <= 1 ? colors.success.base : colors.text.secondary}
            anchorX="right"
            anchorY="middle"
          >
            {mins <= 0 ? 'Arriving' : mins <= 1 ? 'Approaching' : ''}
          </Text>
        </group>
      ))}
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
