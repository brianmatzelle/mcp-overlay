/**
 * useGazeAnchor — captures the user's gaze position at speech onset
 * using continuous WebXR hit testing from the viewer.
 *
 * When `isListening` transitions false → true (Deepgram detects speech),
 * the latest hit-test surface point (or camera fallback) is captured.
 * Call `consumeGaze(toolName)` when a tool result arrives to anchor it.
 */

import { useRef, useState, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXRHitTest } from '@react-three/xr'
import * as THREE from 'three'

// Reusable objects to avoid GC pressure in per-frame callbacks
const _matrix = new THREE.Matrix4()
const _hitPos = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _camDir = new THREE.Vector3()

const FALLBACK_DISTANCE = 1.5 // meters in front of camera when no surface hit

export function useGazeAnchor(isListening: boolean): {
  toolAnchors: Record<string, THREE.Vector3>
  consumeGaze: (toolName: string) => void
} {
  const { camera } = useThree()

  // Latest hit-test surface position (updated every frame)
  const hitPositionRef = useRef<THREE.Vector3 | null>(null)
  // Fallback: camera pos + gaze direction * distance (updated every frame)
  const cameraGazeRef = useRef(new THREE.Vector3())
  // Gaze captured at speech onset
  const latestGazeRef = useRef<THREE.Vector3 | null>(null)
  // Track isListening transitions
  const wasListeningRef = useRef(false)

  // Anchored positions keyed by tool name
  const [toolAnchors, setToolAnchors] = useState<Record<string, THREE.Vector3>>({})

  // Continuous hit testing from viewer — runs every frame
  useXRHitTest(
    (results, getWorldMatrix) => {
      if (results.length > 0) {
        getWorldMatrix(_matrix, results[0])
        _hitPos.setFromMatrixPosition(_matrix)
        if (!hitPositionRef.current) {
          hitPositionRef.current = new THREE.Vector3()
        }
        hitPositionRef.current.copy(_hitPos)
      } else {
        hitPositionRef.current = null
      }
    },
    'viewer',
  )

  // Camera fallback + speech onset detection (every frame)
  useFrame(() => {
    // Update camera fallback position
    camera.getWorldPosition(_camPos)
    camera.getWorldDirection(_camDir)
    cameraGazeRef.current.copy(_camPos).add(_camDir.multiplyScalar(FALLBACK_DISTANCE))

    // Detect isListening: false → true (speech onset)
    if (isListening && !wasListeningRef.current) {
      latestGazeRef.current = hitPositionRef.current
        ? hitPositionRef.current.clone()
        : cameraGazeRef.current.clone()
      console.log(
        '[GazeAnchor] Captured gaze at speech onset:',
        latestGazeRef.current.toArray().map((v) => v.toFixed(3)),
        hitPositionRef.current ? '(hit-test)' : '(camera fallback)',
      )
    }
    wasListeningRef.current = isListening
  })

  const consumeGaze = useCallback((toolName: string) => {
    if (!latestGazeRef.current) return
    const pos = latestGazeRef.current.clone()
    setToolAnchors((prev) => ({ ...prev, [toolName]: pos }))
    console.log('[GazeAnchor] Anchored', toolName, 'at', pos.toArray().map((v) => v.toFixed(3)))
  }, [])

  return { toolAnchors, consumeGaze }
}
