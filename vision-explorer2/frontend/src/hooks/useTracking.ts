import { useEffect, useRef, useState } from "react";
import type { Detection, TrackedObject } from "../types/index";
import {
  GRACE_PERIOD_MS,
  MAX_OVERLAYS,
  SMOOTHING_FACTOR,
} from "../lib/constants";
import { smoothBox } from "../lib/smoothing";

function makeTrackedObject(det: Detection, now: number): TrackedObject {
  return {
    ...det,
    firstSeen: now,
    lastSeen: now,
    smoothedX: det.x,
    smoothedY: det.y,
    smoothedW: det.w,
    smoothedH: det.h,
    enrichmentState: "none",
    enrichmentData: null,
    isExpanded: false,
    fadingOut: false,
  };
}

function capByConfidence(map: Map<number, TrackedObject>): TrackedObject[] {
  const all = Array.from(map.values());
  if (all.length <= MAX_OVERLAYS) return all;
  return all
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_OVERLAYS);
}

export function useTracking(rawDetections: Detection[]): TrackedObject[] {
  // Internal map mutated in-place; setState used only to schedule a re-render
  const trackedRef = useRef<Map<number, TrackedObject>>(new Map());
  const graceTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const [result, setResult] = useState<TrackedObject[]>([]);

  // Stable callback ref so the grace-period timer can call it after expiry
  const scheduleUpdateRef = useRef<() => void>(() => {});

  useEffect(() => {
    scheduleUpdateRef.current = () => {
      setResult(capByConfidence(trackedRef.current));
    };
  });

  useEffect(() => {
    const tracked = trackedRef.current;
    const graceTimers = graceTimersRef.current;
    const now = Date.now();
    const incomingIds = new Set(rawDetections.map((d) => d.trackId));

    // Upsert / update active detections
    for (const det of rawDetections) {
      // Cancel any pending grace timer
      const timer = graceTimers.get(det.trackId);
      if (timer !== undefined) {
        clearTimeout(timer);
        graceTimers.delete(det.trackId);
      }

      const existing = tracked.get(det.trackId);
      if (existing) {
        const smoothed = smoothBox(
          {
            x: existing.smoothedX,
            y: existing.smoothedY,
            w: existing.smoothedW,
            h: existing.smoothedH,
          },
          { x: det.x, y: det.y, w: det.w, h: det.h },
          SMOOTHING_FACTOR
        );
        tracked.set(det.trackId, {
          ...existing,
          x: det.x,
          y: det.y,
          w: det.w,
          h: det.h,
          confidence: det.confidence,
          lastSeen: now,
          smoothedX: smoothed.x,
          smoothedY: smoothed.y,
          smoothedW: smoothed.w,
          smoothedH: smoothed.h,
          fadingOut: false,
        });
      } else {
        tracked.set(det.trackId, makeTrackedObject(det, now));
      }
    }

    // Start grace-period timers for disappeared tracks
    for (const trackId of tracked.keys()) {
      if (!incomingIds.has(trackId) && !graceTimers.has(trackId)) {
        // Mark as fading out immediately
        const obj = tracked.get(trackId)!;
        tracked.set(trackId, { ...obj, fadingOut: true });

        const t = setTimeout(() => {
          trackedRef.current.delete(trackId);
          graceTimersRef.current.delete(trackId);
          scheduleUpdateRef.current();
        }, GRACE_PERIOD_MS);
        graceTimers.set(trackId, t);
      }
    }

    setResult(capByConfidence(tracked));
  }, [rawDetections]);

  // Clean up all grace timers on unmount
  useEffect(() => {
    const graceTimers = graceTimersRef.current;
    return () => {
      for (const t of graceTimers.values()) clearTimeout(t);
    };
  }, []);

  return result;
}
