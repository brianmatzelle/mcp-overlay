/**
 * useDetection — runs YOLO object detection on camera frames.
 * Ported from garvis/xr-client/src/hooks/useDetection.ts.
 * Captures frames, POSTs to /detect, returns bounding boxes.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { useXR } from '@react-three/xr'

export interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Detection {
  id: number
  class: string
  confidence: number
  bbox: BoundingBox
}

export interface DetectionState {
  isActive: boolean
  detections: Detection[]
  fps: number
  latency: number
  imageSize: { width: number; height: number } | null
  error: string | null
}

interface UseDetectionOptions {
  targetFps?: number
  confidence?: number
  maxDetections?: number
}

export function useDetection(
  captureFrame: () => string | null,
  cameraReady: boolean,
  options: UseDetectionOptions = {},
) {
  const { targetFps = 3, confidence = 0.4, maxDetections = 15 } = options

  const session = useXR((state) => state.session)
  const isPresenting = !!session

  const [state, setState] = useState<DetectionState>({
    isActive: false,
    detections: [],
    fps: 0,
    latency: 0,
    imageSize: null,
    error: null,
  })

  const isProcessingRef = useRef(false)
  const intervalRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)
  const fpsIntervalRef = useRef<number | null>(null)
  const captureFrameRef = useRef(captureFrame)
  captureFrameRef.current = captureFrame

  const frameInterval = 1000 / Math.max(1, targetFps)

  const detectFrame = useCallback(async () => {
    if (isProcessingRef.current) return

    const base64 = captureFrameRef.current()
    if (!base64) return

    isProcessingRef.current = true
    const startTime = performance.now()

    try {
      const response = await fetch('/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          confidence,
          max_detections: maxDetections,
        }),
      })

      if (!response.ok) throw new Error(`Server error: ${response.status}`)

      const result = await response.json()
      const latency = Math.round(performance.now() - startTime)

      if (result.success) {
        frameCountRef.current++
        setState((prev) => ({
          ...prev,
          detections: result.detections || [],
          latency,
          imageSize: result.image_size || prev.imageSize,
          error: null,
        }))
      }
    } catch (err) {
      if (Math.random() < 0.1) console.warn('Detection error:', err)
    } finally {
      isProcessingRef.current = false
    }
  }, [confidence, maxDetections])

  useEffect(() => {
    if (!isPresenting || !cameraReady) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (fpsIntervalRef.current) {
        clearInterval(fpsIntervalRef.current)
        fpsIntervalRef.current = null
      }
      setState((prev) => ({ ...prev, isActive: false, detections: [], fps: 0 }))
      return
    }

    console.log('[Detection] Starting detection loop')
    setState((prev) => ({ ...prev, isActive: true, error: null }))

    intervalRef.current = window.setInterval(() => {
      detectFrame()
    }, frameInterval)

    fpsIntervalRef.current = window.setInterval(() => {
      setState((prev) => ({ ...prev, fps: frameCountRef.current }))
      frameCountRef.current = 0
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current)
    }
  }, [isPresenting, cameraReady, frameInterval, detectFrame])

  return state
}
