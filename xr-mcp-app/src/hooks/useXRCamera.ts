/**
 * useXRCamera — camera access hook for WebXR frame capture.
 * Simplified from garvis/xr-client/src/hooks/useXRCamera.ts
 * (no VideoTexture — we only capture frames for vision research).
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { useXR } from '@react-three/xr'

export interface XRCameraState {
  isAvailable: boolean
  isStreaming: boolean
  width: number
  height: number
  error: string | null
}

interface XRCameraResult {
  state: XRCameraState
  captureFrame: (quality?: number) => string | null
}

export function useXRCamera(): XRCameraResult {
  const session = useXR((state) => state.session)
  const isPresenting = !!session

  const [state, setState] = useState<XRCameraState>({
    isAvailable: false,
    isStreaming: false,
    width: 0,
    height: 0,
    error: null,
  })

  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null)

  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!isPresenting) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (videoElement && videoElement.parentNode) {
        videoElement.parentNode.removeChild(videoElement)
      }
      setVideoElement(null)
      setCanvasElement(null)
      setState((prev) => ({
        ...prev,
        isAvailable: false,
        isStreaming: false,
      }))
      return
    }

    const startCamera = async () => {
      try {
        console.log('[XRCamera] Requesting camera access...')
        const video = document.createElement('video')
        video.playsInline = true
        video.muted = true
        video.autoplay = true
        video.style.position = 'fixed'
        video.style.top = '0'
        video.style.left = '0'
        video.style.width = '1px'
        video.style.height = '1px'
        video.style.opacity = '0.01'
        video.style.pointerEvents = 'none'
        video.style.zIndex = '-1000'
        document.body.appendChild(video)

        const canvas = document.createElement('canvas')

        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
            audio: false,
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          })
        }

        streamRef.current = stream
        video.srcObject = stream

        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => {
            video.play().then(() => resolve()).catch(reject)
          }
          video.onerror = () => reject(new Error('Video load failed'))
          setTimeout(() => reject(new Error('Video timeout')), 10000)
        })

        const width = video.videoWidth
        const height = video.videoHeight
        canvas.width = width
        canvas.height = height

        console.log(`[XRCamera] Camera ready: ${width}x${height}`)

        setVideoElement(video)
        setCanvasElement(canvas)
        setState({
          isAvailable: true,
          isStreaming: true,
          width,
          height,
          error: null,
        })
      } catch (err) {
        console.error('[XRCamera] Camera error:', err)
        setState((prev) => ({
          ...prev,
          isAvailable: false,
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Camera access failed',
        }))
      }
    }

    startCamera()

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [isPresenting])

  const captureFrame = useCallback(
    (quality: number = 0.7): string | null => {
      if (!videoElement || !canvasElement) return null
      if (videoElement.readyState < 2) return null

      const ctx = canvasElement.getContext('2d')
      if (!ctx) return null

      ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height)
      const dataUrl = canvasElement.toDataURL('image/jpeg', quality)
      return dataUrl.split(',')[1]
    },
    [videoElement, canvasElement],
  )

  return { state, captureFrame }
}
