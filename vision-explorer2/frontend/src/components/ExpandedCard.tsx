import React from "react";
import type { TrackedObject } from "../types/index";
import { getClassColor } from "../lib/constants";

interface Props {
  obj: TrackedObject;
}

function ExpandedCard({ obj }: Props) {
  const color = getClassColor(obj.label);
  const data = obj.enrichmentData;

  // Loading skeleton for pending state
  if (obj.enrichmentState === "pending" || !data) {
    return (
      <div
        className="hud-blur"
        style={{
          background: "rgba(0, 0, 0, 0.8)",
          border: `1.5px solid ${color}`,
          borderRadius: 16,
          minWidth: 280,
          maxWidth: 360,
          padding: 16,
          color: "#fff",
          fontFamily: "monospace",
        }}
      >
        <div
          className="animate-pulse"
          style={{
            height: 20,
            width: "60%",
            background: "#374151",
            borderRadius: 4,
            marginBottom: 8,
          }}
        />
        <div
          className="animate-pulse"
          style={{
            height: 14,
            width: "40%",
            background: "#374151",
            borderRadius: 4,
            marginBottom: 12,
          }}
        />
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 12,
          }}
        >
          <div
            className="animate-pulse"
            style={{
              height: 14,
              width: "100%",
              background: "#374151",
              borderRadius: 4,
              marginBottom: 6,
            }}
          />
          <div
            className="animate-pulse"
            style={{
              height: 14,
              width: "80%",
              background: "#374151",
              borderRadius: 4,
            }}
          />
        </div>
      </div>
    );
  }

  const { identification, enrichment } = data;
  const hasPrice =
    enrichment.price_estimate.range_low ||
    enrichment.price_estimate.range_high;
  const hasSpecs =
    enrichment.specs && Object.keys(enrichment.specs).length > 0;

  return (
    <div
      className="hud-blur"
      style={{
        background: "rgba(0, 0, 0, 0.8)",
        border: `1.5px solid ${color}`,
        borderRadius: 16,
        minWidth: 280,
        maxWidth: 360,
        maxHeight: 320,
        overflowY: "auto",
        overflowX: "hidden",
        color: "#fff",
        fontFamily: "monospace",
        fontSize: "0.8125rem",
        lineHeight: 1.5,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: "0.9375rem",
            }}
          >
            {identification.name}
          </span>
          {identification.color && identification.color !== "unknown" && (
            <span
              style={{
                fontSize: "0.75rem",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              {identification.color}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "rgba(255,255,255,0.5)",
            marginTop: 2,
          }}
        >
          {[identification.brand, identification.category]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {hasPrice && (
          <div style={{ marginTop: 4, color }}>
            ~${enrichment.price_estimate.range_low}
            {enrichment.price_estimate.range_high &&
              ` – $${enrichment.price_estimate.range_high}`}
          </div>
        )}
      </div>

      {/* Summary */}
      {enrichment.summary && (
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {enrichment.summary}
        </div>
      )}

      {/* Specs */}
      {hasSpecs && (
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {Object.entries(enrichment.specs).map(([key, value]) => (
            <span
              key={key}
              style={{
                background: "rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "3px 8px",
                fontSize: "0.6875rem",
                color: "rgba(255,255,255,0.75)",
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.45)" }}>{key}:</span>{" "}
              {value}
            </span>
          ))}
        </div>
      )}

      {/* Search link */}
      {enrichment.search_query && (
        <div style={{ padding: "10px 16px" }}>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(enrichment.search_query)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color,
              textDecoration: "none",
              fontSize: "0.8125rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            Search ↗
          </a>
        </div>
      )}
    </div>
  );
}

export default React.memo(ExpandedCard, (prev, next) =>
  prev.obj.trackId === next.obj.trackId &&
  prev.obj.enrichmentState === next.obj.enrichmentState &&
  prev.obj.enrichmentData === next.obj.enrichmentData
);
