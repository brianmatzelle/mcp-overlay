// lib/constants.ts

export const YOLO_CONFIDENCE_THRESHOLD = 0.5;    // detection display threshold
export const ENRICHMENT_CONFIDENCE_THRESHOLD = 0.6;  // gate for LLM enrichment calls
export const FRAME_SAMPLE_INTERVAL_MS = 100; // 10fps
export const STABILITY_THRESHOLD_MS = 500;  // 0.5 seconds before enrichment
export const GRACE_PERIOD_MS = 1000; // 1 second before unmounting
export const MAX_OVERLAYS = 3;
export const SMOOTHING_FACTOR = 0.7;
export const WEBSOCKET_URL = "ws://localhost:8000/enrich";
export const YOLO_MODEL_PATH = "/models/yolov8n.onnx";
export const YOLO_INPUT_SIZE = 640;

// Class-specific accent colors for COCO classes
export const CLASS_COLORS: Record<string, string> = {
  person: "#3B82F6",       // blue
  cup: "#F97316",          // orange
  bottle: "#14B8A6",       // teal
  laptop: "#22C55E",       // green
  cell_phone: "#A855F7",   // purple
  book: "#EC4899",         // pink
  keyboard: "#EAB308",     // yellow
  mouse: "#6366F1",        // indigo
  chair: "#78716C",        // stone
  backpack: "#EF4444",     // red
};

// Deterministic color fallback for unlisted classes
export function getClassColor(label: string): string {
  if (CLASS_COLORS[label]) return CLASS_COLORS[label];
  let hash = 0;
  for (const char of label) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return `hsl(${hash % 360}, 70%, 55%)`;
}
