/**
 * Type augmentations for the WebXR Raw Camera Access API.
 * @see https://immersive-web.github.io/raw-camera-access/
 *
 * Extends the existing XRView and XRWebGLBinding types from @types/webxr
 * with camera access methods not yet in the standard type definitions.
 */

interface XRCamera {
  readonly width: number
  readonly height: number
}

interface XRView {
  readonly camera?: XRCamera
}

interface XRWebGLBinding {
  getCameraImage(camera: XRCamera): WebGLTexture
}
