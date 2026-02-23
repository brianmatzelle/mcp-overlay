/**
 * useCameraFrameSender — sends camera frames to Garvis server at ~1fps.
 * Pattern: garvis/xr-client/src/hooks/useDetection.ts (interval-based capture loop).
 */

import { useRef, useEffect } from 'react'
import { useXR } from '@react-three/xr'
import type { GarvisClient } from '../voice/garvis-client'

interface UseCameraFrameSenderOptions {
  /** Frames per second to send (default 1) */
  fps?: number
}

export function useCameraFrameSender(
  captureFrame: (quality?: number) => string | null,
  client: GarvisClient | null,
  isConnected: boolean,
  options: UseCameraFrameSenderOptions = {},
) {
  const { fps = 1 } = options

  const session = useXR((state) => state.session)
  const inXR = !!session
  const intervalRef = useRef<number | null>(null)

  // Keep latest refs so the interval callback always uses current values
  const captureFrameRef = useRef(captureFrame)
  captureFrameRef.current = captureFrame
  const clientRef = useRef(client)
  clientRef.current = client

  useEffect(() => {
    // Depend on stable booleans, not object references
    if (!inXR || !isConnected) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    console.log('[CameraFrameSender] Starting frame capture interval')
    const intervalMs = 1000 / Math.max(0.1, fps)

    intervalRef.current = window.setInterval(() => {
      const c = clientRef.current
      if (!c || !c.isConnected()) return

      const frame = captureFrameRef.current(0.6)
      if (frame) {
        c.sendControl('camera_frame', { frame })
      }
    }, intervalMs)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [inXR, isConnected, fps])
}
