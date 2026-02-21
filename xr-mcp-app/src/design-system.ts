/**
 * Design System — subset of Garvis XR design tokens
 * plus rounded-rect geometry helper and types for 3D UI rendering.
 *
 * Source: garvis/xr-client/src/design-system/tokens.ts + primitives.ts
 */

import * as THREE from 'three'

// ============================================================================
// TYPES
// ============================================================================

/**
 * R3F pointer event type with 3D point information
 */
export type PointerEvent3D = THREE.Event & {
  point: THREE.Vector3
  pointerId: number
  stopPropagation: () => void
  target: {
    setPointerCapture?: (pointerId: number) => void
    releasePointerCapture?: (pointerId: number) => void
  }
}

/**
 * Window horizontal positioning mode
 */
export type HorizontalMode = 'visor' | 'yaw'

// ============================================================================
// COLORS
// ============================================================================

export const colors = {
  bg: {
    primary: '#1a1a2e',
    secondary: '#16213e',
    overlay: '#000000',
  },
  accent: {
    primary: '#6366f1',
    primaryHover: '#818cf8',
    secondary: '#60a5fa',
    secondaryHover: '#93c5fd',
  },
  text: {
    primary: '#ffffff',
    secondary: '#888888',
    tertiary: '#666666',
    disabled: '#444444',
    user: '#4ade80',
    assistant: '#60a5fa',
  },
  success: {
    base: '#22c55e',
    hover: '#4ade80',
  },
  error: {
    base: '#ef4444',
    hover: '#f87171',
  },
  warning: {
    base: '#fbbf24',
    hover: '#fcd34d',
  },
  interactive: {
    default: '#888888',
    hover: '#60a5fa',
    active: '#ffffff',
    disabled: '#333333',
  },
  border: {
    default: '#444444',
    accent: '#6366f1',
  },
} as const

// ============================================================================
// SPACING (in meters)
// ============================================================================

export const spacing = {
  xs: 0.005,
  sm: 0.01,
  md: 0.02,
  lg: 0.03,
  xl: 0.04,
} as const

// ============================================================================
// TYPOGRAPHY (fontSize in meters)
// ============================================================================

export const typography = {
  fontSize: {
    xs: 0.006,
    sm: 0.007,
    base: 0.008,
    md: 0.01,
    lg: 0.012,
    xl: 0.015,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
  },
} as const

// ============================================================================
// RADII
// ============================================================================

export const radii = {
  sm: 0.002,
  md: 0.005,
  lg: 0.01,
  xl: 0.015,
} as const

// ============================================================================
// OPACITY
// ============================================================================

export const opacity = {
  subtle: 0.1,
  glass: 0.12,
  light: 0.2,
  medium: 0.3,
  semi: 0.5,
  heavy: 0.8,
  strong: 0.9,
  solid: 0.95,
} as const

// ============================================================================
// ANIMATION
// ============================================================================

export const animation = {
  lerpFactor: 0.15,
  lerpFast: 0.25,
} as const

// ============================================================================
// Z-LAYERS (depth offsets in 3D space)
// ============================================================================

export const zLayers = {
  background: -0.003,
  border: -0.002,
  content: 0,
  overlay: 0.001,
  controls: 0.002,
  tooltip: 0.003,
  modal: 0.004,
} as const

// ============================================================================
// WINDOW DEFAULTS
// ============================================================================

export const windowDefaults = {
  titleBarHeight: 0.04,
  padding: 0.02,
  resizeHandleSize: 0.025,
  closeButtonWidth: 0.04,
  closeButtonHeight: 0.025,
  minScale: 0.5,
  maxScale: 2.0,
} as const

// ============================================================================
// GEOMETRY HELPERS
// ============================================================================

export function createRoundedRectGeometry(
  width: number,
  height: number,
  radius: number
): THREE.ShapeGeometry {
  const shape = new THREE.Shape()
  const x = -width / 2
  const y = -height / 2
  const r = Math.min(radius, width / 2, height / 2)

  shape.moveTo(x + r, y)
  shape.lineTo(x + width - r, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + r)
  shape.lineTo(x + width, y + height - r)
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  shape.lineTo(x + r, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)

  return new THREE.ShapeGeometry(shape)
}
