import React, { useRef, useEffect, useCallback } from "react";
import type { TrackedObject } from "../types/index";
import { useStore } from "../store/useStore";
import CollapsedPill from "./CollapsedPill";
import ExpandedCard from "./ExpandedCard";

interface Props {
  obj: TrackedObject;
  top: number; // collision-adjusted Y position
  opacity: number; // 1 = active, 0.5 = fading out (grace period)
}

function ObjectOverlay({ obj, top, opacity }: Props) {
  const toggleExpanded = useStore((s) => s.toggleExpanded);
  const setEnrichmentState = useStore((s) => s.setEnrichmentState);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside handler to collapse expanded card
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (
        obj.isExpanded &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        toggleExpanded(obj.trackId);
      }
    },
    [obj.isExpanded, obj.trackId, toggleExpanded]
  );

  useEffect(() => {
    if (obj.isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [obj.isExpanded, handleClickOutside]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: obj.smoothedX,
        top,
        opacity,
        transform: "translate3d(0, 0, 0)",
        transition: "left 100ms linear, top 100ms linear, opacity 300ms ease",
        zIndex: obj.isExpanded ? 100 : 30,
        pointerEvents: "auto",
      }}
      onClick={() => {
        // Clicking an error pill retries enrichment instead of expanding
        if (obj.enrichmentState === "error") {
          setEnrichmentState(obj.trackId, "none");
          return;
        }
        toggleExpanded(obj.trackId);
      }}
    >
      {/* Expand/collapse wrapper */}
      <div
        style={{
          overflow: obj.isExpanded ? "hidden" : "visible",
          maxHeight: obj.isExpanded ? 600 : undefined,
          transition: "max-height 300ms ease-out",
        }}
      >
        {obj.isExpanded ? <ExpandedCard obj={obj} /> : <CollapsedPill obj={obj} />}
      </div>
    </div>
  );
}

export default React.memo(ObjectOverlay, (prev, next) =>
  prev.obj.trackId === next.obj.trackId &&
  prev.obj.smoothedX === next.obj.smoothedX &&
  prev.obj.smoothedY === next.obj.smoothedY &&
  prev.obj.smoothedH === next.obj.smoothedH &&
  prev.obj.enrichmentState === next.obj.enrichmentState &&
  prev.obj.isExpanded === next.obj.isExpanded &&
  prev.obj.enrichmentData === next.obj.enrichmentData &&
  prev.top === next.top &&
  prev.opacity === next.opacity
);
