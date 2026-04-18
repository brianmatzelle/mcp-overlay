import { useEffect, useRef, memo } from "react";
import type { Detection } from "../types/index";
import { getClassColor } from "../lib/constants";

interface Props {
  detections: Detection[];
  videoWidth: number;
  videoHeight: number;
}

export const BoundingBoxCanvas = memo(function BoundingBoxCanvas({
  detections,
  videoWidth,
  videoHeight,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const det of detections) {
      const color = getClassColor(det.label);

      // Bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(det.x, det.y, det.w, det.h);

      // Label above box
      ctx.fillStyle = color;
      ctx.font = "12px monospace";
      const text = `${det.label} ${Math.round(det.confidence * 100)}%`;
      ctx.fillText(text, det.x + 2, det.y - 4);
    }
  }, [detections, videoWidth, videoHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={videoWidth || 1280}
      height={videoHeight || 720}
      className="absolute inset-0 z-20 pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    />
  );
});
