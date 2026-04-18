import React, { useMemo } from "react";
import type { TrackedObject } from "../types/index";
import { useStore } from "../store/useStore";
import ObjectOverlay from "./ObjectOverlay";

// Estimated pill dimensions for collision avoidance
const PILL_HEIGHT = 36;
const PILL_WIDTH = 160;
const MAX_NUDGES = 3;

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

function computeLayout(
  objects: TrackedObject[]
): Array<{ obj: TrackedObject; top: number }> {
  // Sort descending by confidence — highest-confidence pills are placed first
  const sorted = [...objects].sort((a, b) => b.confidence - a.confidence);
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];

  return sorted.map((obj) => {
    let top = obj.smoothedY;
    const rect = { x: obj.smoothedX, y: top, w: PILL_WIDTH, h: PILL_HEIGHT };

    // Nudge downward if overlapping a previously placed pill (max 3 nudges)
    let nudges = 0;
    for (const p of placed) {
      if (nudges >= MAX_NUDGES) break;
      if (rectsOverlap(rect, p)) {
        top = p.y + p.h + 8;
        rect.y = top;
        nudges++;
      }
    }

    placed.push({ x: rect.x, y: top, w: rect.w, h: rect.h });
    return { obj, top };
  });
}

function OverlayLayer() {
  const trackedObjects = useStore((s) => s.trackedObjects);

  const objects = useMemo(
    () => Array.from(trackedObjects.values()),
    [trackedObjects]
  );

  const layout = useMemo(() => computeLayout(objects), [objects]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      {layout.map(({ obj, top }) => (
        <ObjectOverlay
          key={obj.trackId}
          obj={obj}
          top={top}
          opacity={obj.fadingOut ? 0.5 : 1}
        />
      ))}
    </div>
  );
}

export default React.memo(OverlayLayer);
