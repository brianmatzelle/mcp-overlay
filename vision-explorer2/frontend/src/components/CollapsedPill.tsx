import React from "react";
import type { TrackedObject } from "../types/index";
import { getClassColor } from "../lib/constants";

interface Props {
  obj: TrackedObject;
}

function CollapsedPill({ obj }: Props) {
  const color = getClassColor(obj.label);
  const confidence = Math.round(obj.confidence * 100);

  let label: string;
  let trailing: React.ReactNode = null;

  if (obj.enrichmentState === "ready" && obj.enrichmentData) {
    label = obj.enrichmentData.identification.name;
    trailing = (
      <span style={{ color, marginLeft: 6 }}>●</span>
    );
  } else if (obj.enrichmentState === "pending") {
    label = `${obj.label} ${confidence}%`;
    trailing = (
      <span className="hud-spinner" style={{ marginLeft: 6 }} aria-hidden>
        ◌
      </span>
    );
  } else if (obj.enrichmentState === "error") {
    label = obj.label;
    trailing = <span style={{ marginLeft: 6 }}>⚠</span>;
  } else {
    label = `${obj.label} ${confidence}%`;
  }

  return (
    <div
      className="hud-blur hud-pill-enter"
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "rgba(0, 0, 0, 0.75)",
        border: `1.5px solid ${color}`,
        borderRadius: 12,
        padding: "6px 12px",
        fontSize: "0.875rem",
        color: "#fff",
        whiteSpace: "nowrap",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <span>{label}</span>
      {trailing}
    </div>
  );
}

export default React.memo(CollapsedPill, (prev, next) =>
  prev.obj.trackId === next.obj.trackId &&
  prev.obj.enrichmentState === next.obj.enrichmentState &&
  prev.obj.label === next.obj.label &&
  prev.obj.confidence === next.obj.confidence
);
