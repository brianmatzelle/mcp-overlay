/**
 * SportsSearch3D — renders live sports search results as 3D text elements.
 * Parses the search-streams JSON tool result and displays game listings
 * with league-colored badges, titles, and times.
 */

import { Text } from '@react-three/drei'
import { colors, typography, spacing, zLayers } from '../design-system.ts'

interface GameResult {
  title: string
  url: string
  metadata: string  // league name
  time: string
  provider: string
}

interface SportsSearch3DProps {
  /** Raw JSON string from tool result content[0].text */
  contentText: string | null
}

/** League → color mapping */
const LEAGUE_COLORS: Record<string, string> = {
  NFL: '#013369',
  NBA: '#f58426',
  NHL: '#a2aaad',
  NCAA: '#2e8b57',
  'UFC/MMA': '#d20a0a',
  Boxing: '#c5a100',
  WWE: '#e40000',
  MLB: '#002d72',
}

function getLeagueColor(league: string): string {
  return LEAGUE_COLORS[league] ?? colors.accent.primary
}

export function SportsSearch3D({ contentText }: SportsSearch3DProps) {
  if (!contentText) {
    return (
      <Text
        fontSize={typography.fontSize.base}
        color={colors.text.secondary}
        anchorX="center"
        anchorY="middle"
      >
        Loading sports...
      </Text>
    )
  }

  let games: GameResult[]
  try {
    games = JSON.parse(contentText)
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

  if (!Array.isArray(games) || games.length === 0) {
    return (
      <Text
        fontSize={typography.fontSize.base}
        color={colors.text.secondary}
        anchorX="center"
        anchorY="middle"
      >
        No games found
      </Text>
    )
  }

  const displayGames = games.slice(0, 5)
  const lineSpacing = typography.fontSize.base * 3.2
  let y = 0.1 // Start from top of content area

  return (
    <group position-z={zLayers.controls}>
      {/* Header */}
      <Text
        position={[-0.16, y, 0]}
        fontSize={typography.fontSize.md}
        color={colors.text.primary}
        anchorX="left"
        anchorY="middle"
        fontWeight="bold"
      >
        LIVE SPORTS
      </Text>
      <Text
        position={[0.16, y, 0]}
        fontSize={typography.fontSize.sm}
        color={colors.text.secondary}
        anchorX="right"
        anchorY="middle"
      >
        {`${games.length} game${games.length !== 1 ? 's' : ''}`}
      </Text>

      {/* Separator */}
      <mesh position={[0, y - spacing.md, 0]}>
        <planeGeometry args={[0.34, 0.001]} />
        <meshBasicMaterial color={colors.accent.primary} transparent opacity={0.5} />
      </mesh>

      {/* Game rows */}
      {displayGames.map((game, i) => {
        const rowY = y - spacing.lg - lineSpacing * i
        const leagueColor = getLeagueColor(game.metadata)

        return (
          <group key={i} position={[0, rowY, 0]}>
            {/* League badge */}
            <mesh position={[-0.15, 0, 0]}>
              <planeGeometry args={[0.04, 0.016]} />
              <meshBasicMaterial color={leagueColor} />
            </mesh>
            <Text
              position={[-0.15, 0, 0.001]}
              fontSize={typography.fontSize.xs}
              color={colors.text.primary}
              anchorX="center"
              anchorY="middle"
              fontWeight="bold"
            >
              {game.metadata.length > 5 ? game.metadata.slice(0, 5) : game.metadata}
            </Text>

            {/* Game title */}
            <Text
              position={[-0.12, 0, 0]}
              fontSize={typography.fontSize.sm}
              color={colors.text.primary}
              anchorX="left"
              anchorY="middle"
              maxWidth={0.22}
            >
              {game.title}
            </Text>

            {/* Time */}
            {game.time && (
              <Text
                position={[0.16, 0, 0]}
                fontSize={typography.fontSize.xs}
                color={colors.text.secondary}
                anchorX="right"
                anchorY="middle"
              >
                {game.time}
              </Text>
            )}
          </group>
        )
      })}

      {/* Timestamp */}
      <Text
        position={[0, y - spacing.lg - lineSpacing * displayGames.length, 0]}
        fontSize={typography.fontSize.xs}
        color={colors.text.tertiary}
        anchorX="center"
        anchorY="middle"
      >
        {`Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
      </Text>
    </group>
  )
}
