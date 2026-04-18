import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { EnrichmentResponse, WebSocketMessage } from "../types/index";
import {
  WEBSOCKET_URL,
  ENRICHMENT_CONFIDENCE_THRESHOLD,
  STABILITY_THRESHOLD_MS,
} from "../lib/constants";
import { useStore } from "../store/useStore";

// Exponential backoff delays in ms (last value repeats)
const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 10000];

type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export function useEnrichment(
  sampleCanvasRef: RefObject<HTMLCanvasElement | null>
): { connectionStatus: ConnectionStatus; reconnectAttempts: number } {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(false);

  // Read the Map directly — stable reference per store update (no new array allocation).
  const trackedObjects = useStore((s) => s.trackedObjects);
  const setEnrichmentState = useStore((s) => s.setEnrichmentState);
  const updateEnrichment = useStore((s) => s.updateEnrichment);

  // Keep latest action refs to avoid stale closures in WS callbacks
  const updateEnrichmentRef = useRef(updateEnrichment);
  const setEnrichmentStateRef = useRef(setEnrichmentState);
  useEffect(() => {
    updateEnrichmentRef.current = updateEnrichment;
    setEnrichmentStateRef.current = setEnrichmentState;
  });

  // connectRef allows the close handler to call back into the latest connect fn
  const connectRef = useRef<() => void>(() => {});

  // WebSocket lifecycle — mounts once
  useEffect(() => {
    isMountedRef.current = true;

    function connect() {
      if (!isMountedRef.current) return;

      const ws = new WebSocket(WEBSOCKET_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        reconnectAttemptsRef.current = 0;
        setReconnectAttempts(0);
        setConnectionStatus("connected");
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(event.data as string);
          // Backend sends { error: true, trackId } on Vision LLM failure
          if (data.error && data.trackId != null) {
            setEnrichmentStateRef.current(data.trackId, "error");
            return;
          }
          updateEnrichmentRef.current(
            (data as EnrichmentResponse).trackId,
            data as EnrichmentResponse
          );
        } catch (err) {
          console.error("Failed to parse enrichment response:", err);
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        // Exponential backoff reconnect
        const attempts = reconnectAttemptsRef.current;
        const delay =
          BACKOFF_DELAYS[Math.min(attempts, BACKOFF_DELAYS.length - 1)];
        reconnectAttemptsRef.current += 1;
        setReconnectAttempts(reconnectAttemptsRef.current);
        setConnectionStatus("reconnecting");
        reconnectTimeoutRef.current = setTimeout(() => {
          connectRef.current();
        }, delay);
      };

      ws.onerror = () => {
        // onclose fires after onerror — reconnect handled there
      };
    }

    connectRef.current = connect;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      const ws = wsRef.current;
      if (ws) {
        // Null out onclose so the close handler doesn't schedule a reconnect
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  // Enrichment gating — runs each time trackedObjects changes (10fps cadence)
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const sampleCanvas = sampleCanvasRef.current;
    if (!sampleCanvas || sampleCanvas.width === 0 || sampleCanvas.height === 0)
      return;

    for (const obj of trackedObjects.values()) {
      // Gating conditions: high confidence, stable 2s, not yet enriched
      if (
        obj.confidence <= ENRICHMENT_CONFIDENCE_THRESHOLD ||
        Date.now() - obj.firstSeen < STABILITY_THRESHOLD_MS ||
        obj.enrichmentState !== "none"
      ) {
        continue;
      }

      // Mark pending immediately to prevent double-send
      setEnrichmentStateRef.current(obj.trackId, "pending");

      // Crop bounding box from the sample canvas with 20% padding for context
      const padX = obj.w * 0.2;
      const padY = obj.h * 0.2;
      const srcX = Math.max(0, Math.round(obj.x - padX));
      const srcY = Math.max(0, Math.round(obj.y - padY));
      const srcRight = Math.min(sampleCanvas.width, Math.round(obj.x + obj.w + padX));
      const srcBottom = Math.min(sampleCanvas.height, Math.round(obj.y + obj.h + padY));
      const cropW = Math.max(1, srcRight - srcX);
      const cropH = Math.max(1, srcBottom - srcY);
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) continue;

      cropCtx.drawImage(
        sampleCanvas,
        srcX,
        srcY,
        cropW,
        cropH,
        0,
        0,
        cropW,
        cropH
      );

      const base64 = cropCanvas.toDataURL("image/jpeg", 0.85).split(",")[1];

      const message: WebSocketMessage = {
        trackId: obj.trackId,
        label: obj.label,
        confidence: obj.confidence,
        cropBase64: base64,
      };

      try {
        ws.send(JSON.stringify(message));
      } catch (err) {
        console.error(
          `Failed to send enrichment request for track ${obj.trackId}:`,
          err
        );
        setEnrichmentStateRef.current(obj.trackId, "error");
      }
    }
  }, [trackedObjects, sampleCanvasRef]);

  return { connectionStatus, reconnectAttempts };
}
