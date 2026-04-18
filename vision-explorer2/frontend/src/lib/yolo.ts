import { YOLO_CONFIDENCE_THRESHOLD, YOLO_INPUT_SIZE, MAX_OVERLAYS } from "./constants";

export const COCO_CLASSES: string[] = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
  "truck", "boat", "traffic light", "fire hydrant", "stop sign",
  "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
  "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag",
  "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
  "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
  "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana",
  "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza",
  "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table",
  "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone",
  "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock",
  "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
];

export interface RawDetection {
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LetterboxInfo {
  padX: number;
  padY: number;
  scale: number;
}

export interface PreprocessResult {
  tensor: Float32Array;
  letterbox: LetterboxInfo;
}

/**
 * Letterbox imageData into 640×640 (preserving aspect ratio, gray padding),
 * normalize to [0,1], transpose to NCHW.
 * Returns tensor of shape [1, 3, 640, 640] plus letterbox metadata for
 * reversing the coordinate transform in postprocessOutput.
 */
export function preprocessFrame(imageData: ImageData): PreprocessResult {
  const size = YOLO_INPUT_SIZE;
  const { width: origW, height: origH } = imageData;

  const scale = Math.min(size / origW, size / origH);
  const scaledW = Math.round(origW * scale);
  const scaledH = Math.round(origH * scale);
  const padX = Math.round((size - scaledW) / 2);
  const padY = Math.round((size - scaledH) / 2);

  const offscreen = new OffscreenCanvas(size, size);
  const ctx = offscreen.getContext("2d")!;

  // YOLOv8 standard pad color
  ctx.fillStyle = "rgb(114, 114, 114)";
  ctx.fillRect(0, 0, size, size);

  const srcCanvas = new OffscreenCanvas(origW, origH);
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(srcCanvas, padX, padY, scaledW, scaledH);

  const resized = ctx.getImageData(0, 0, size, size);
  const pixels = resized.data; // RGBA, length = 640*640*4

  const numPixels = size * size;
  const tensor = new Float32Array(3 * numPixels);

  for (let i = 0; i < numPixels; i++) {
    tensor[i] = pixels[i * 4] / 255.0;                     // R channel
    tensor[numPixels + i] = pixels[i * 4 + 1] / 255.0;     // G channel
    tensor[2 * numPixels + i] = pixels[i * 4 + 2] / 255.0; // B channel
  }

  return { tensor, letterbox: { padX, padY, scale } };
}

/**
 * Post-process YOLO output tensor [1, 84, 8400] → RawDetection[].
 * Uses letterbox metadata to map coordinates back to original image space.
 */
export function postprocessOutput(
  output: Float32Array,
  letterbox: LetterboxInfo
): RawDetection[] {
  const numAnchors = 8400;
  const numClasses = 80;
  const { padX, padY, scale } = letterbox;

  const candidates: RawDetection[] = [];

  for (let a = 0; a < numAnchors; a++) {
    let maxScore = 0;
    let maxClass = 0;
    for (let c = 0; c < numClasses; c++) {
      const score = output[(4 + c) * numAnchors + a];
      if (score > maxScore) {
        maxScore = score;
        maxClass = c;
      }
    }

    if (maxScore <= YOLO_CONFIDENCE_THRESHOLD) continue;

    // cx, cy, bw, bh in letterboxed 640×640 space
    const cx = output[0 * numAnchors + a];
    const cy = output[1 * numAnchors + a];
    const bw = output[2 * numAnchors + a];
    const bh = output[3 * numAnchors + a];

    // Remove letterbox padding, then unscale to original image coords
    const x = (cx - bw / 2 - padX) / scale;
    const y = (cy - bh / 2 - padY) / scale;
    const w = bw / scale;
    const h = bh / scale;

    candidates.push({
      label: COCO_CLASSES[maxClass] ?? "unknown",
      confidence: maxScore,
      x,
      y,
      w,
      h,
    });
  }

  // NMS then cap to MAX_OVERLAYS best detections early
  const afterNms = nms(candidates, 0.45);
  return afterNms.slice(0, MAX_OVERLAYS);
}

function iou(a: RawDetection, b: RawDetection): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const inter = interW * interH;
  if (inter === 0) return 0;

  const union = a.w * a.h + b.w * b.h - inter;
  return inter / union;
}

function nms(detections: RawDetection[], iouThreshold: number): RawDetection[] {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: RawDetection[] = [];

  for (const det of sorted) {
    // Cross-class NMS: suppress any overlapping box regardless of label
    const overlaps = kept.some((k) => iou(k, det) > iouThreshold);
    if (!overlaps) kept.push(det);
  }

  return kept;
}
