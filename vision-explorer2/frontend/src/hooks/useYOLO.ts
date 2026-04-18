import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import * as ort from "onnxruntime-web";
import type { Detection } from "../types/index";
import {
  YOLO_MODEL_PATH,
  FRAME_SAMPLE_INTERVAL_MS,
  YOLO_INPUT_SIZE,
} from "../lib/constants";
import { preprocessFrame, postprocessOutput } from "../lib/yolo";
import { SimpleTracker } from "../lib/tracker";
import { smoothBox } from "../lib/smoothing";

export interface UseYOLOResult {
  detections: Detection[];
  isModelLoaded: boolean;
  error: string | null;
  sampleCanvasRef: RefObject<HTMLCanvasElement | null>;
  retryModelLoad: () => void;
}

export function useYOLO(
  videoRef: RefObject<HTMLVideoElement>
): UseYOLOResult {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelLoadAttempt, setModelLoadAttempt] = useState(0);

  const sessionRef = useRef<ort.InferenceSession | null>(null);
  const trackerRef = useRef(new SimpleTracker());
  const smoothedBoxesRef = useRef<
    Map<number, { x: number; y: number; w: number; h: number }>
  >(new Map());

  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Offscreen canvas for sampling video frames (exposed for enrichment cropping)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Create sample canvas on mount
  useEffect(() => {
    const canvas = document.createElement("canvas");
    sampleCanvasRef.current = canvas;
  }, []);

  // Load ONNX model — prefer WebGPU, fall back to wasm
  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      try {
        // WASM files are served from public/ (run `pnpm copy-wasm` once after install)
        ort.env.wasm.wasmPaths = "/";
        ort.env.wasm.numThreads = 4;

        const session = await ort.InferenceSession.create(YOLO_MODEL_PATH, {
          executionProviders: ["webgpu", "wasm"],
        });

        if (!cancelled) {
          sessionRef.current = session;
          setIsModelLoaded(true);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            `Failed to load YOLO model: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }

    loadModel();

    return () => {
      cancelled = true;
    };
  }, [modelLoadAttempt]);

  // Inference loop — runs at FRAME_SAMPLE_INTERVAL_MS (100ms = 10fps)
  useEffect(() => {
    if (!isModelLoaded) return;

    let running = true;

    async function runInference() {
      const video = videoRef.current;
      const session = sessionRef.current;
      const canvas = sampleCanvasRef.current;

      // Wait until video has data
      if (!video || !session || !canvas || video.readyState < 2) {
        scheduleNext();
        return;
      }

      const origWidth = video.videoWidth;
      const origHeight = video.videoHeight;

      if (origWidth === 0 || origHeight === 0) {
        scheduleNext();
        return;
      }

      try {
        // Draw current video frame onto sample canvas
        canvas.width = origWidth;
        canvas.height = origHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          scheduleNext();
          return;
        }
        ctx.drawImage(video, 0, 0, origWidth, origHeight);

        // Preprocess frame into NCHW Float32Array (letterboxed)
        const imageData = ctx.getImageData(0, 0, origWidth, origHeight);
        const { tensor: inputTensor, letterbox } = preprocessFrame(imageData);

        // Build ONNX tensor and run session
        const inputName = session.inputNames[0];
        const feeds: Record<string, ort.Tensor> = {
          [inputName]: new ort.Tensor("float32", inputTensor, [
            1,
            3,
            YOLO_INPUT_SIZE,
            YOLO_INPUT_SIZE,
          ]),
        };

        const results = await session.run(feeds);
        const outputName = session.outputNames[0];
        const output = results[outputName].data as Float32Array;

        // Post-process output → raw detections
        const rawDetections = postprocessOutput(output, letterbox);

        // Assign track IDs
        const tracked = trackerRef.current.update(rawDetections);

        // Apply EMA smoothing per track
        const smoothed: Detection[] = tracked.map((det) => {
          const prev = smoothedBoxesRef.current.get(det.trackId);
          const curr = { x: det.x, y: det.y, w: det.w, h: det.h };
          const box = prev ? smoothBox(prev, curr) : curr;
          smoothedBoxesRef.current.set(det.trackId, box);
          return { ...det, x: box.x, y: box.y, w: box.w, h: box.h };
        });

        // Prune smoothed boxes for tracks that have been removed
        for (const id of smoothedBoxesRef.current.keys()) {
          if (!tracked.some((d) => d.trackId === id)) {
            smoothedBoxesRef.current.delete(id);
          }
        }

        if (running) {
          setDetections(smoothed);
        }
      } catch (err) {
        console.error("YOLO inference error:", err);
      }

      if (running) scheduleNext();
    }

    function scheduleNext() {
      if (!running) return;
      timeoutRef.current = setTimeout(() => {
        if (!running) return;
        rafRef.current = requestAnimationFrame(runInference);
      }, FRAME_SAMPLE_INTERVAL_MS);
    }

    scheduleNext();

    return () => {
      running = false;
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isModelLoaded, videoRef]);

  const retryModelLoad = useCallback(() => {
    setError(null);
    setIsModelLoaded(false);
    setModelLoadAttempt((a) => a + 1);
  }, []);

  return { detections, isModelLoaded, error, sampleCanvasRef, retryModelLoad };
}
