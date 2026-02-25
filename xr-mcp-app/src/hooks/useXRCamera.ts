/**
 * useXRCamera — camera access hook for WebXR frame capture.
 *
 * Camera stream is acquired BEFORE entering XR via preAcquireCamera(),
 * called from App.tsx's handleEnterAR. This matches the timing of the
 * Babylon.js demo (onXRSessionInit) which successfully gets the Quest 3's
 * passthrough camera at 1280x960. Acquiring after XR session start gives
 * only the front camera at 640x480.
 *
 * Also probes for WebXR Raw Camera Access API (future browser support).
 * If detected, stops the getUserMedia stream and switches to raw mode.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { useXR } from '@react-three/xr'
import { useFrame, useThree } from '@react-three/fiber'

export interface XRCameraState {
  isAvailable: boolean
  isStreaming: boolean
  width: number
  height: number
  error: string | null
  /** Projection matrix from XRView when using Raw Camera Access (column-major 4x4) */
  projectionMatrix: Float32Array | null
  /** Whether using Raw Camera Access (true) or getUserMedia fallback (false) */
  isRawCameraAccess: boolean
}

interface XRCameraResult {
  state: XRCameraState
  captureFrame: (quality?: number) => string | null
}

type CameraMode = 'detecting' | 'raw' | 'fallback'

const INITIAL_STATE: XRCameraState = {
  isAvailable: false,
  isStreaming: false,
  width: 0,
  height: 0,
  error: null,
  projectionMatrix: null,
  isRawCameraAccess: false,
}

/** Max frames to wait for view.camera before confirming getUserMedia mode */
const DETECTION_FRAME_LIMIT = 30

/** Min interval between pixel extractions (ms). ~5fps = 200ms */
const CAPTURE_INTERVAL_MS = 200

/** JPEG quality for raw camera extraction */
const RAW_CAPTURE_QUALITY = 0.7

// --- Pre-acquired camera stream (set before XR session starts) ---
interface PreAcquiredCamera {
  stream: MediaStream
  video: HTMLVideoElement
  canvas: HTMLCanvasElement
  width: number
  height: number
}

let preAcquiredCamera: PreAcquiredCamera | null = null
/** Promise that resolves when preAcquireCamera() finishes — hook awaits this */
let preAcquirePromise: Promise<void> | null = null

/**
 * Acquire the camera stream during XR session init.
 * Called from xrStore.subscribe callback, which fires synchronously when
 * the session is created — matching Babylon's onXRSessionInit timing.
 * The hook awaits preAcquirePromise to ensure it uses this stream.
 */
export function preAcquireCamera(): void {
  preAcquirePromise = doPreAcquireCamera()
}

async function doPreAcquireCamera(): Promise<void> {
  // Cleanup any previous pre-acquired camera
  if (preAcquiredCamera) {
    preAcquiredCamera.stream.getTracks().forEach((t) => t.stop())
    if (preAcquiredCamera.video.parentNode) {
      preAcquiredCamera.video.parentNode.removeChild(preAcquiredCamera.video)
    }
    preAcquiredCamera = null
  }

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
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter((d) => d.kind === 'videoinput')
    console.log('[XRCamera] Available cameras:', videoDevices.map((d) => d.label).join(', '))

    const passthroughCamera = videoDevices.find(
      (d) => d.label === 'camera 2, facing back',
    )

    if (passthroughCamera) {
      console.log(`[XRCamera] Found Quest passthrough camera: ${passthroughCamera.label}`)
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: passthroughCamera.deviceId,
          width: 1280,
          height: 960,
        },
      })
    } else {
      console.log('[XRCamera] No Quest passthrough camera found, using generic environment camera')
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })
    }
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    })
  }

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

  // Log actual track settings
  const track = stream.getVideoTracks()[0]
  if (track) {
    const settings = track.getSettings()
    console.log(`[XRCamera] Track settings: ${settings.width}x${settings.height} @${settings.frameRate}fps, device: ${track.label}`)
  }

  console.log(`[XRCamera] Pre-acquired camera ready: ${width}x${height}`)

  preAcquiredCamera = { stream, video, canvas, width, height }
}

export function useXRCamera(): XRCameraResult {
  const session = useXR((state) => state.session)
  const isPresenting = !!session
  const { gl } = useThree()

  const [state, setState] = useState<XRCameraState>(INITIAL_STATE)

  // --- Mode tracking ---
  const modeRef = useRef<CameraMode>('detecting')
  const detectionFrameCountRef = useRef(0)

  // --- Raw Camera Access resources ---
  const glBindingRef = useRef<XRWebGLBinding | null>(null)
  const fbRef = useRef<WebGLFramebuffer | null>(null)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const latestBase64Ref = useRef<string | null>(null)
  const lastCaptureTimeRef = useRef(0)
  const projectionMatrixRef = useRef<Float32Array | null>(null)
  const pixelBufferRef = useRef<Uint8Array | null>(null)

  // --- getUserMedia resources ---
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fallbackReadyRef = useRef(false)

  // --- Cleanup helpers ---
  const cleanupRaw = useCallback(() => {
    const glContext = gl.getContext() as WebGL2RenderingContext
    if (fbRef.current) {
      glContext.deleteFramebuffer(fbRef.current)
      fbRef.current = null
    }
    glBindingRef.current = null
    offscreenCanvasRef.current = null
    offscreenCtxRef.current = null
    latestBase64Ref.current = null
    projectionMatrixRef.current = null
    pixelBufferRef.current = null
  }, [gl])

  const cleanupFallback = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current?.parentNode) {
      videoRef.current.parentNode.removeChild(videoRef.current)
    }
    videoRef.current = null
    fallbackCanvasRef.current = null
    fallbackReadyRef.current = false
  }, [])

  // --- Adopt pre-acquired camera or start fresh getUserMedia ---
  const startCamera = useCallback(async () => {
    // Wait for pre-acquisition to finish (fired from xrStore.subscribe)
    if (preAcquirePromise) {
      await preAcquirePromise
      preAcquirePromise = null
    }
    // Check for pre-acquired camera
    if (preAcquiredCamera) {
      console.log(`[XRCamera] Using pre-acquired camera: ${preAcquiredCamera.width}x${preAcquiredCamera.height}`)
      const { stream, video, canvas, width, height } = preAcquiredCamera
      streamRef.current = stream
      videoRef.current = video
      fallbackCanvasRef.current = canvas
      fallbackReadyRef.current = true
      preAcquiredCamera = null // Consumed

      setState({
        isAvailable: true,
        isStreaming: true,
        width,
        height,
        error: null,
        projectionMatrix: null,
        isRawCameraAccess: false,
      })
      return
    }

    // No pre-acquired camera — start fresh (desktop/emulator path)
    try {
      console.log('[XRCamera] No pre-acquired camera, starting getUserMedia...')
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

      videoRef.current = video
      fallbackCanvasRef.current = canvas
      fallbackReadyRef.current = true

      setState({
        isAvailable: true,
        isStreaming: true,
        width,
        height,
        error: null,
        projectionMatrix: null,
        isRawCameraAccess: false,
      })
    } catch (err) {
      console.error('[XRCamera] Camera error:', err)
      setState((prev) => ({
        ...prev,
        isAvailable: false,
        isStreaming: false,
        error: err instanceof Error ? err.message : 'Camera access failed',
        projectionMatrix: null,
        isRawCameraAccess: false,
      }))
    }
  }, [])

  // --- Session lifecycle ---
  useEffect(() => {
    if (!isPresenting || !session) {
      cleanupRaw()
      cleanupFallback()
      modeRef.current = 'detecting'
      detectionFrameCountRef.current = 0
      lastCaptureTimeRef.current = 0
      setState(INITIAL_STATE)
      return
    }

    // Adopt pre-acquired camera or start fresh
    startCamera()

    // Also set up Raw Camera Access resources for parallel detection
    try {
      const glContext = gl.getContext() as WebGL2RenderingContext
      glBindingRef.current = new XRWebGLBinding(session, glContext)
      fbRef.current = glContext.createFramebuffer()
      offscreenCanvasRef.current = document.createElement('canvas')
      offscreenCtxRef.current = offscreenCanvasRef.current.getContext('2d')
      modeRef.current = 'detecting'
      detectionFrameCountRef.current = 0
      console.log('[XRCamera] Probing for Raw Camera Access...')
    } catch (err) {
      console.warn('[XRCamera] XRWebGLBinding not available:', err)
      modeRef.current = 'fallback'
    }

    return () => {
      cleanupRaw()
      cleanupFallback()
    }
  }, [isPresenting, session, gl, cleanupRaw, cleanupFallback, startCamera])

  // --- Per-frame Raw Camera Access detection + extraction ---
  useFrame((_threeState, _delta, frame) => {
    if (!frame || !isPresenting) return
    if (modeRef.current === 'fallback') return

    const refSpace = gl.xr.getReferenceSpace()
    if (!refSpace) return

    const pose = frame.getViewerPose(refSpace)
    if (!pose) return

    // Find a view with camera access
    let cameraView: XRView | null = null
    for (const view of pose.views) {
      if (view.camera) {
        cameraView = view
        break
      }
    }

    // Detection phase: determine if Raw Camera Access is available
    if (modeRef.current === 'detecting') {
      detectionFrameCountRef.current++
      if (cameraView) {
        console.log('[XRCamera] Raw Camera Access available! Switching from getUserMedia.')
        cleanupFallback()
        modeRef.current = 'raw'
      } else if (detectionFrameCountRef.current > DETECTION_FRAME_LIMIT) {
        console.log('[XRCamera] Raw Camera Access not available, using getUserMedia')
        modeRef.current = 'fallback'
        return
      } else {
        return
      }
    }

    if (modeRef.current !== 'raw' || !cameraView || !cameraView.camera) return

    const xrCamera = cameraView.camera
    const width = xrCamera.width
    const height = xrCamera.height

    // Store projection matrix every frame (lightweight)
    projectionMatrixRef.current = new Float32Array(cameraView.projectionMatrix)

    // Update state if dimensions changed (debounced via comparison)
    setState((prev) => {
      if (prev.isStreaming && prev.width === width && prev.height === height && prev.isRawCameraAccess) {
        return prev
      }
      return {
        isAvailable: true,
        isStreaming: true,
        width,
        height,
        error: null,
        projectionMatrix: projectionMatrixRef.current,
        isRawCameraAccess: true,
      }
    })

    // Throttle pixel extraction
    const now = performance.now()
    if (now - lastCaptureTimeRef.current < CAPTURE_INTERVAL_MS) return
    lastCaptureTimeRef.current = now

    // Extract pixels from camera texture
    try {
      const glContext = gl.getContext() as WebGL2RenderingContext
      const glBinding = glBindingRef.current
      if (!glBinding || !fbRef.current) return

      const cameraTexture = glBinding.getCameraImage(xrCamera)

      glContext.bindFramebuffer(glContext.FRAMEBUFFER, fbRef.current)
      glContext.framebufferTexture2D(
        glContext.FRAMEBUFFER,
        glContext.COLOR_ATTACHMENT0,
        glContext.TEXTURE_2D,
        cameraTexture,
        0,
      )

      const fbStatus = glContext.checkFramebufferStatus(glContext.FRAMEBUFFER)
      if (fbStatus !== glContext.FRAMEBUFFER_COMPLETE) {
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, null)
        if (Math.random() < 0.01) {
          console.warn('[XRCamera] Framebuffer incomplete:', fbStatus)
        }
        return
      }

      const bufferSize = width * height * 4
      if (!pixelBufferRef.current || pixelBufferRef.current.length !== bufferSize) {
        pixelBufferRef.current = new Uint8Array(bufferSize)
      }

      glContext.readPixels(
        0, 0, width, height,
        glContext.RGBA, glContext.UNSIGNED_BYTE,
        pixelBufferRef.current,
      )
      glContext.bindFramebuffer(glContext.FRAMEBUFFER, null)

      // Write to offscreen canvas with Y-flip (GL reads bottom-up)
      const canvas = offscreenCanvasRef.current!
      const ctx = offscreenCtxRef.current!
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height

      const imageData = ctx.createImageData(width, height)
      const pixels = pixelBufferRef.current
      const rowBytes = width * 4

      for (let y = 0; y < height; y++) {
        const srcOffset = (height - 1 - y) * rowBytes
        const dstOffset = y * rowBytes
        imageData.data.set(
          pixels.subarray(srcOffset, srcOffset + rowBytes),
          dstOffset,
        )
      }
      ctx.putImageData(imageData, 0, 0)

      const dataUrl = canvas.toDataURL('image/jpeg', RAW_CAPTURE_QUALITY)
      latestBase64Ref.current = dataUrl.split(',')[1]
    } catch (err) {
      if (Math.random() < 0.01) {
        console.warn('[XRCamera] Frame extraction error:', err)
      }
    }
  })

  // --- getUserMedia frame capture ---
  const captureFallbackFrame = useCallback(
    (quality: number = 0.7): string | null => {
      const video = videoRef.current
      const canvas = fallbackCanvasRef.current
      if (!video || !canvas || !fallbackReadyRef.current) return null
      if (video.readyState < 2) return null

      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      return dataUrl.split(',')[1]
    },
    [],
  )

  // --- Public captureFrame ---
  const captureFrame = useCallback(
    (quality: number = 0.7): string | null => {
      if (modeRef.current === 'raw') {
        return latestBase64Ref.current
      }
      return captureFallbackFrame(quality)
    },
    [captureFallbackFrame],
  )

  return { state, captureFrame }
}
