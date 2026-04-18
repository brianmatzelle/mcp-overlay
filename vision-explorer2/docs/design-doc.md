# Vision Explorer — Technical Design Document (v2)

> **Purpose**: This document is the complete implementation spec for a real-time object detection web app with AR-style overlays. It is intended to be consumed by an AI coding assistant to build the project end-to-end. Follow this document literally — every architectural decision has been made and justified.

---

## 1. Product Summary

A web app that uses a Mac's camera to detect objects in real-time via YOLO, identifies them in detail via a Vision LLM, enriches them with structured data from external APIs, and renders interactive overlay cards anchored to each object's bounding box on the live camera feed.

**Demo story**: "Three AI systems collaborating in real-time — YOLO for speed, a Vision LLM for recognition, and parallel API calls for enrichment — all rendered as live AR overlays on your camera feed."

---

## 2. System Architecture

```
Mac Camera (30fps native)
    │
    ▼
┌─────────────────────────────────────┐
│  Browser                            │
│                                     │
│  <video> element (30fps display)    │
│         │                           │
│         ▼                           │
│  Canvas frame sample (10fps)        │
│         │                           │
│         ▼                           │
│  YOLO v8-nano (ONNX Runtime Web)    │
│         │                           │
│         ├── Bounding box JSON ──────┼──► React Overlay Layer (immediate render)
│         │                           │
│         ▼                           │
│  Confidence > 0.85 AND              │
│  stable for 2 seconds?              │
│         │                           │
│         ▼ YES                       │
│  Crop bounding box from canvas      │
│  Encode as JPEG base64              │
│         │                           │
└─────────┼───────────────────────────┘
          │ WebSocket
          ▼
┌─────────────────────────────────────┐
│  FastAPI Backend                    │
│                                     │
│  1. Receive crop + trackId + label  │
│  2. Send crop to Vision LLM with   │
│     enrichment prompt               │
│     → identification + enrichment   │
│       in a single structured JSON   │
│  3. Bundle JSON response            │
│                                     │
└─────────┬───────────────────────────┘
          │ WebSocket
          ▼
┌─────────────────────────────────────┐
│  Browser                            │
│                                     │
│  Cache result by track ID           │
│  React overlay updates to enriched  │
│  state. Card ready on user click.   │
│                                     │
└─────────────────────────────────────┘
```

### Key Principle: Separation of Concerns

| Layer | Responsibility | Latency |
|---|---|---|
| YOLO (browser) | Detection + tracking. Emits label, confidence, bounding box, track ID. | ~100ms per sample (10fps) |
| Vision LLM (backend) | Rich identification AND enrichment from cropped image. Returns brand, model, color, category, summary, estimated price, specs — all in one call. | 2–5 seconds, fires once per stable object |
| React overlays (browser) | Rendering. Reads from cache, positions over bounding boxes. | Instant (data already cached) |

### Why a Single LLM Call Instead of Separate Enrichment APIs

The original design used three parallel enrichment modules (Wikipedia, shopping/pricing, specs) called after the Vision LLM identified the object. This approach had serious reliability issues:

- **Wikipedia's REST API** expects exact page titles. A product name like "Yeti Rambler 20oz Tumbler" won't have a Wikipedia page. The API would fail for most specific products.
- **Shopping APIs** (SerpAPI, etc.) require paid API keys, have rate limits, and return inconsistent data. For a hackathon, this adds fragile dependencies.
- **Specs lookups** had no realistic data source — the original design only returned field names without values.

**The fix**: A single, richer Vision LLM call that returns identification AND enrichment data together. The LLM already sees the image and knows the object — asking it to also provide a summary, estimated price range, and relevant specs is trivial and far more reliable than hoping external APIs return useful results.

This also simplifies the backend significantly: no `enrichment/` module folder, no parallel API orchestration, no partial-failure handling across three services.

---

## 3. Frontend Architecture

### 3.1 Layer Stack

Three DOM elements stacked via `position: absolute` inside a single container:

```
┌──────────────────────────────────────────────┐
│  Layer 3: React overlay components (top)     │  z-index: 30
│  Layer 2: Canvas for bounding box drawing    │  z-index: 20
│  Layer 1: <video> element (raw camera feed)  │  z-index: 10
└──────────────────────────────────────────────┘
```

- **Layer 1 (`<video>`)**: Displays the raw camera feed at 30fps via `getUserMedia`. Never touched or processed directly for display.
- **Layer 2 (`<canvas>`)**: Draws thin colored bounding box rectangles. Updated at 10fps from YOLO output. Transparent background.
- **Layer 3 (React)**: Absolutely positioned `<div>` components anchored to bounding box coordinates. Each div contains the overlay card for one tracked object.

### 3.2 Camera Initialization

```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: "environment", // prefer rear camera if available, falls back to front
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  }
});
videoElement.srcObject = stream;
```

### 3.3 Frame Sampling Loop

Run at 10fps (every 100ms), decoupled from the video's native frame rate:

```typescript
const SAMPLE_INTERVAL_MS = 100; // 10fps
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

function sampleFrame() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Feed imageData to YOLO model
  const detections = await runYOLO(imageData);
  updateTrackedObjects(detections);
  requestAnimationFrame(() => setTimeout(sampleFrame, SAMPLE_INTERVAL_MS));
}
```

### 3.4 YOLO Integration (ONNX Runtime Web)

**Model**: YOLOv8-nano (`yolov8n.onnx`), ~6MB, runs at 20–30fps on Apple Silicon via WebGPU.

**Setup**:
```typescript
import * as ort from "onnxruntime-web";

// Prefer WebGPU, fall back to WASM
ort.env.wasm.numThreads = 4;
const session = await ort.InferenceSession.create("/models/yolov8n.onnx", {
  executionProviders: ["webgpu", "wasm"]
});
```

**Input preprocessing**: Resize frame to 640x640, normalize pixel values to [0, 1], transpose to NCHW format (1, 3, 640, 640).

**Output format**: YOLO returns a tensor of shape `[1, 84, 8400]` (for COCO 80-class). Post-process with NMS (non-max suppression) to get final detections:

```typescript
interface Detection {
  trackId: number;      // persistent ID from tracker
  label: string;        // COCO class name e.g. "cup", "laptop"
  confidence: number;   // 0.0 – 1.0
  x: number;            // top-left x (pixels, relative to video dimensions)
  y: number;            // top-left y
  w: number;            // width
  h: number;            // height
}
```

**Tracking**: Use a simple IoU-based tracker to assign persistent track IDs across frames. If a detection overlaps >50% IoU with a previous frame's detection of the same class, it inherits the track ID. Otherwise, assign a new ID.

> If a proper tracker like ByteTrack is too complex to implement in-browser for the hackathon, a simple IoU-matching tracker is sufficient. The key requirement is that track IDs persist across frames for the same physical object.

### 3.5 Bounding Box Smoothing

Raw YOLO boxes jitter frame-to-frame. Apply exponential moving average before rendering:

```typescript
const SMOOTHING = 0.7; // higher = smoother but more lag

function smooth(prev: Detection, curr: Detection): Detection {
  return {
    ...curr,
    x: prev.x * SMOOTHING + curr.x * (1 - SMOOTHING),
    y: prev.y * SMOOTHING + curr.y * (1 - SMOOTHING),
    w: prev.w * SMOOTHING + curr.w * (1 - SMOOTHING),
    h: prev.h * SMOOTHING + curr.h * (1 - SMOOTHING),
  };
}
```

### 3.6 Tracked Objects State

Central state store (React context or Zustand):

```typescript
interface TrackedObject {
  trackId: number;
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
  firstSeen: number;           // timestamp when first detected
  lastSeen: number;            // timestamp of most recent detection
  enrichmentState: "none" | "pending" | "ready";
  enrichmentData: EnrichmentData | null;
  isExpanded: boolean;
}

// Map<trackId, TrackedObject>
const trackedObjects = new Map<number, TrackedObject>();
```

### 3.7 Overlay Component

Each tracked object renders as an absolutely positioned div:

```tsx
function ObjectOverlay({ obj }: { obj: TrackedObject }) {
  return (
    <div
      style={{
        position: "absolute",
        left: obj.x,
        top: obj.y,
        transform: "translate3d(0, 0, 0)", // force GPU layer
        transition: "left 100ms linear, top 100ms linear", // smooth movement
        zIndex: obj.isExpanded ? 100 : 30,
      }}
      onClick={() => toggleExpand(obj.trackId)}
    >
      {obj.isExpanded ? (
        <ExpandedCard obj={obj} />
      ) : (
        <CollapsedPill obj={obj} />
      )}
    </div>
  );
}
```

### 3.8 Overlay States & Visual Design

Every detected object goes through this lifecycle:

```
State 1: DETECTED (instant, from YOLO)
┌─────────────┐
│ cup  91%    │   Colored pill. Class-specific accent color.
└─────────────┘   No network call. Appears in < 1 frame.

State 2: ENRICHING (crop sent to backend)
┌─────────────────┐
│ cup  91%  ◌     │   Subtle animated spinner appended.
└─────────────────┘   Indicates backend processing in progress.

State 3: READY (backend responded, data cached)
┌──────────────────┐
│ Yeti Rambler  ●  │   Pill text updates to identified name.
└──────────────────┘   Filled dot = clickable for details.

State 4: EXPANDED (user clicked)
┌─────────────────────────┐
│ Yeti Rambler 20oz       │   Full card with all enrichment data.
│ Navy · Stainless Steel  │   Summary, estimated price, specs.
│ ⭐ 4.8 · ~$25–35        │   Click again or click away to collapse.
│                         │
│ Double-wall vacuum      │
│ insulated tumbler...    │
│                         │
│ [Search Amazon]         │
└─────────────────────────┘
```

### 3.9 Visual Theme

- **Dark HUD aesthetic**: Semi-transparent dark backgrounds (`rgba(0, 0, 0, 0.75)`) with `backdrop-filter: blur(8px)`.
- **Class-specific accent colors**: Assign a color per COCO class. Examples: `person` = blue, `cup` = orange, `laptop` = green, `book` = purple, `bottle` = teal. The accent color is used for the pill border, bounding box stroke, and expanded card header.
- **Typography**: Monospace font for labels and confidence (e.g., `JetBrains Mono` or `SF Mono`). Sans-serif for expanded card body text.
- **Rounded corners**: `border-radius: 12px` for pills, `16px` for expanded cards.
- **Animations**: Pills fade in over 200ms on detection. Expand/collapse uses `max-height` transition over 300ms with `ease-out`.

### 3.10 Overlay Limit & Collision

- **Cap at 8 simultaneous overlays**. If YOLO detects more than 8 objects, render only the 8 with highest confidence. This keeps the UI clean and React rendering fast.
- **Collision avoidance**: If two collapsed pills overlap (check bounding box intersection), nudge the lower-confidence pill downward by the height of the pill + 8px margin. Simple vertical stacking — no need for complex layout algorithms.

### 3.11 Track ID Grace Period

When a track ID disappears from YOLO results (object occluded or left frame):

```
YOLO reports trackId 42   → overlay visible, full opacity
YOLO drops trackId 42     → start 1-second timer
                             overlay fades to 50% opacity via CSS transition
  ├── trackId 42 reappears → cancel timer, restore opacity to 100%
  └── 1 second expires     → unmount overlay, clear enrichment cache entry
```

This prevents flickering when a hand briefly passes in front of an object.

---

## 4. Backend Architecture (FastAPI)

### 4.1 Project Structure

```
backend/
├── main.py              # FastAPI app, WebSocket endpoint
├── vision_llm.py        # Vision LLM client — handles identification + enrichment
├── models.py             # Pydantic models
├── config.py             # API keys, model config
└── requirements.txt
```

### 4.2 WebSocket Endpoint

Single endpoint handles all communication:

```python
# main.py
from fastapi import FastAPI, WebSocket
import json

app = FastAPI()

@app.websocket("/enrich")
async def enrich(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            # data schema:
            # {
            #   "trackId": 42,
            #   "label": "cup",
            #   "confidence": 0.91,
            #   "cropBase64": "/9j/4AAQ..."  (JPEG base64)
            # }

            # Single Vision LLM call: identification + enrichment
            result = await call_vision_llm(
                crop_base64=data["cropBase64"],
                yolo_label=data["label"]
            )

            # Send bundle
            await websocket.send_json({
                "trackId": data["trackId"],
                **result,
            })
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()
```

### 4.3 Vision LLM Call (Identification + Enrichment in One)

A single call to the Vision LLM returns both identification and enrichment. This is more reliable than separate API calls because the LLM already sees the image and can provide contextually accurate summaries, price estimates, and specs without needing exact Wikipedia page titles or shopping API matches.

```python
# vision_llm.py
import anthropic
import json

client = anthropic.AsyncAnthropic()

async def call_vision_llm(crop_base64: str, yolo_label: str) -> dict:
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=600,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": crop_base64,
                    }
                },
                {
                    "type": "text",
                    "text": f"""YOLO detected this as: "{yolo_label}".

Identify the specific item in this image and provide enrichment data. Return ONLY a JSON object with this exact structure:

{{
  "identification": {{
    "name": "Full product/item name (be as specific as possible)",
    "brand": "Brand name if identifiable, else null",
    "model": "Model name/number if identifiable, else null",
    "color": "Primary color",
    "category": "General category (e.g. drinkware, electronics, furniture, clothing)",
    "description": "One-sentence description"
  }},
  "enrichment": {{
    "summary": "2-3 sentence informative summary about this item or product line. Include what it's known for, key features, or interesting context.",
    "price_estimate": {{
      "range_low": "$XX",
      "range_high": "$XX",
      "currency": "USD",
      "note": "Brief note on pricing (e.g. 'retail price' or 'varies by size')"
    }},
    "specs": {{
      "key1": "value1",
      "key2": "value2"
    }},
    "search_query": "Best search query to find this product online"
  }}
}}

For the "specs" field, include 3-5 key specifications relevant to the item category. Examples:
- Drinkware: material, capacity, insulation_type, dishwasher_safe
- Electronics: processor, ram, storage, display_size, battery_life
- Furniture: material, dimensions, weight_capacity
- Books: author, genre, page_count, year_published
- Clothing: material, fit_type, care_instructions

If you cannot identify the specific product, provide your best guess based on what you see. For price estimates, give a reasonable range for this type of item.

Return raw JSON only, no markdown fences."""
                }
            ]
        }]
    )
    return json.loads(response.content[0].text)
```

### 4.4 Response Schema (Backend → Frontend)

```typescript
interface EnrichmentResponse {
  trackId: number;
  identification: {
    name: string;
    brand: string | null;
    model: string | null;
    color: string;
    category: string;
    description: string;
  };
  enrichment: {
    summary: string;
    price_estimate: {
      range_low: string;
      range_high: string;
      currency: string;
      note: string;
    };
    specs: Record<string, string>;
    search_query: string;
  };
}
```

> **Note on `search_query`**: Instead of linking directly to Amazon/Wikipedia (which requires API calls that may fail), the LLM returns a search query string. The expanded card renders this as a "Search" button that opens `https://www.google.com/search?q={encodeURIComponent(search_query)}` in a new tab. This is zero-dependency and always works.

---

## 5. Data Flow & Enrichment Gating

### 5.1 When to Send a Crop to Backend

An object must meet ALL of these conditions before a crop is sent:

1. **Confidence > 0.85** — avoids noisy detections
2. **Stable for 2+ seconds** — `Date.now() - trackedObject.firstSeen >= 2000`
3. **Not already enriched** — `enrichmentState === "none"` (never send the same track ID twice)

```typescript
function shouldEnrich(obj: TrackedObject): boolean {
  return (
    obj.confidence > 0.85 &&
    Date.now() - obj.firstSeen >= 2000 &&
    obj.enrichmentState === "none"
  );
}
```

### 5.2 Crop and Send

When gating conditions are met:

```typescript
async function cropAndSend(obj: TrackedObject) {
  obj.enrichmentState = "pending";

  // Crop the bounding box region from the sample canvas
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = obj.w;
  cropCanvas.height = obj.h;
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(sampleCanvas, obj.x, obj.y, obj.w, obj.h, 0, 0, obj.w, obj.h);

  // Encode as JPEG base64
  const base64 = cropCanvas.toDataURL("image/jpeg", 0.85).split(",")[1];

  // Send over WebSocket
  websocket.send(JSON.stringify({
    trackId: obj.trackId,
    label: obj.label,
    confidence: obj.confidence,
    cropBase64: base64,
  }));
}
```

### 5.3 Receive and Cache

```typescript
websocket.onmessage = (event) => {
  const response: EnrichmentResponse = JSON.parse(event.data);
  const obj = trackedObjects.get(response.trackId);
  if (obj) {
    obj.enrichmentState = "ready";
    obj.enrichmentData = response;
    // Trigger React re-render
  }
};
```

---

## 6. Performance Budget

| Resource | Target | Mitigation |
|---|---|---|
| Camera feed | 30fps display | Native `<video>`, never touched by JS |
| YOLO inference | 10fps (100ms per frame) | Sample at 10fps, not 30. WebGPU backend. |
| Canvas draws | 10fps | Only draw bounding box rectangles, minimal ops |
| React overlays | ≤ 8 simultaneous | Cap overlay count. Use `React.memo` aggressively. |
| Vision LLM calls | ≤ 5 per minute | 2-second stability gate + cache by track ID |
| WebSocket messages | ≤ 10/sec average | Only enrichment requests/responses, not frame data |
| Memory | < 500MB total | YOLO nano model is ~6MB. No iframe overhead. |

### Critical: The video feed is never processed for display

The `<video>` element plays the camera stream natively at full frame rate. JavaScript only samples frames at 10fps via canvas for YOLO input. The user always sees a smooth 30fps video regardless of YOLO processing speed.

---

## 7. Tech Stack

| Component | Technology |
|---|---|
| Camera access | `navigator.mediaDevices.getUserMedia` |
| Video display | HTML5 `<video>` element |
| YOLO model | YOLOv8-nano via ONNX Runtime Web (WebGPU) |
| Frame sampling | HTML5 `<canvas>` 2D context |
| Frontend framework | React 18 + TypeScript |
| State management | Zustand (lightweight) or React Context |
| Styling | Tailwind CSS, dark HUD theme |
| WebSocket client | Native `WebSocket` API |
| Backend framework | FastAPI (Python 3.11+) |
| WebSocket server | FastAPI WebSocket |
| Vision LLM | Anthropic Claude API (claude-sonnet-4-20250514) |
| Build tool | Vite |
| Package manager | pnpm |

> **Note**: No external enrichment APIs required. The Vision LLM handles both identification and enrichment, eliminating dependencies on Wikipedia API, SerpAPI, etc.

---

## 8. File Structure

```
vision-explorer/
├── frontend/
│   ├── public/
│   │   └── models/
│   │       └── yolov8n.onnx           # YOLO model file (~6MB)
│   ├── src/
│   │   ├── App.tsx                     # Root component, layer stack
│   │   ├── main.tsx                    # Entry point
│   │   ├── components/
│   │   │   ├── CameraFeed.tsx          # <video> element + getUserMedia
│   │   │   ├── BoundingBoxCanvas.tsx   # Canvas overlay for box drawing
│   │   │   ├── OverlayLayer.tsx        # React overlay container
│   │   │   ├── ObjectOverlay.tsx       # Single overlay (pill + expanded card)
│   │   │   ├── CollapsedPill.tsx       # Compact label + confidence
│   │   │   └── ExpandedCard.tsx        # Full enrichment card
│   │   ├── hooks/
│   │   │   ├── useCamera.ts            # Camera stream management
│   │   │   ├── useYOLO.ts             # ONNX model loading + inference
│   │   │   ├── useTracking.ts          # Track ID assignment + smoothing
│   │   │   └── useEnrichment.ts        # WebSocket + enrichment cache
│   │   ├── lib/
│   │   │   ├── yolo.ts                # YOLO pre/post processing
│   │   │   ├── tracker.ts             # Simple IoU tracker
│   │   │   ├── smoothing.ts           # Bounding box EMA
│   │   │   └── constants.ts           # Confidence threshold, colors, etc.
│   │   ├── types/
│   │   │   └── index.ts               # TypeScript interfaces
│   │   └── styles/
│   │       └── globals.css             # Tailwind + HUD theme overrides
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/
│   ├── main.py                         # FastAPI app + WebSocket endpoint
│   ├── vision_llm.py                   # Vision LLM client (identification + enrichment)
│   ├── models.py                       # Pydantic request/response models
│   ├── config.py                       # Environment vars, API keys
│   └── requirements.txt
│
└── README.md
```

---

## 9. Startup & Run Instructions

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
# → http://localhost:5173
```

### Backend

```bash
cd backend
pip install -r requirements.txt
# Set environment variables:
# ANTHROPIC_API_KEY=sk-...
uvicorn main:app --reload --port 8000
# → ws://localhost:8000/enrich
```

### Requirements (backend/requirements.txt)

```
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
websockets>=12.0
anthropic>=0.40.0
pydantic>=2.5.0
```

> **Note**: `httpx` is no longer required — no external API calls from the backend.

---

## 10. Class-Specific Accent Colors

Assign deterministic colors by COCO class. These are used for bounding box strokes, pill borders, and expanded card headers.

```typescript
const CLASS_COLORS: Record<string, string> = {
  person: "#3B82F6",     // blue
  cup: "#F97316",        // orange
  bottle: "#14B8A6",     // teal
  laptop: "#22C55E",     // green
  cell_phone: "#A855F7", // purple
  book: "#EC4899",       // pink
  keyboard: "#EAB308",   // yellow
  mouse: "#6366F1",      // indigo
  chair: "#78716C",      // stone
  backpack: "#EF4444",   // red
};

// Fallback for unlisted classes:
function getClassColor(label: string): string {
  if (CLASS_COLORS[label]) return CLASS_COLORS[label];
  // Deterministic hash to color
  let hash = 0;
  for (const char of label) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return `hsl(${hash % 360}, 70%, 55%)`;
}
```

---

## 11. Pre-Cached Demo Strategy

Before the demo starts, place all demo objects in front of the camera and let the system enrich them. By the time judges arrive, every overlay is in State 3 (READY) and expands instantly.

**Recommended demo objects** (choose 5–6 that you'll definitely have on the table):

- Coffee mug / tumbler
- Laptop
- Phone
- Water bottle
- Book
- Headphones / earbuds
- Keyboard
- A plant or small object

If a judge introduces a new object during the demo, it still works — the pill appears instantly (State 1), and the enriched card arrives in 3–5 seconds. This is fine and actually demonstrates the system working in real-time.

---

## 12. Fallback & Error Handling

| Failure | Behavior |
|---|---|
| Camera permission denied | Show fullscreen message: "Camera access required. Please allow camera in browser settings." |
| YOLO model fails to load | Show error banner. Provide a "Retry" button that reloads the ONNX session. |
| WebSocket disconnects | Auto-reconnect with exponential backoff (1s, 2s, 4s, max 10s). Show subtle "Reconnecting..." indicator. Overlays remain in their current state (don't unmount). |
| Vision LLM returns error | Set enrichment state to "error". Pill shows label + "⚠" icon. User can click to retry. |
| Vision LLM returns unparseable JSON | Retry once. If still fails, fall back to displaying YOLO label only (no enrichment). |
| Object never reaches confidence threshold | It simply never gets an overlay. This is correct behavior. |

---

## 13. Implementation Priority (Hackathon Build Order)

Build in this order. Each step produces a working demo that's incrementally better:

### Phase 1: Camera + YOLO (Target: 2 hours)
- [ ] Camera feed in `<video>` element
- [ ] Canvas frame sampling at 10fps
- [ ] YOLO model loaded and running via ONNX Runtime Web
- [ ] Bounding boxes drawn on canvas overlay
- [ ] **Demo checkpoint**: Camera with colored rectangles around objects

### Phase 2: React Overlays (Target: 2 hours)
- [ ] React overlay layer with absolutely positioned divs
- [ ] Collapsed pill component showing label + confidence
- [ ] Bounding box smoothing (EMA)
- [ ] Track ID assignment (IoU tracker)
- [ ] Grace period for disappearing objects
- [ ] Dark HUD styling with class accent colors
- [ ] **Demo checkpoint**: Camera with styled floating pills that track objects smoothly

### Phase 3: Backend + Vision LLM (Target: 1.5 hours)
- [ ] FastAPI WebSocket endpoint
- [ ] Enrichment gating logic (confidence + stability + dedup)
- [ ] Crop and send over WebSocket
- [ ] Vision LLM call returning identification + enrichment in one response
- [ ] Response cached by track ID in frontend
- [ ] Pill updates to show identified name when ready
- [ ] **Demo checkpoint**: Pills that start as "cup 91%" and update to "Yeti Rambler ●"

### Phase 4: Expanded Cards (Target: 1.5 hours)
- [ ] Expanded card component with all enrichment data
- [ ] Display summary, price estimate, specs, search link
- [ ] Click to expand/collapse
- [ ] Loading skeleton for in-progress enrichment
- [ ] **Demo checkpoint**: Full working demo — click any object for detailed info card

### Phase 5: Polish (Target: 1 hour)
- [ ] Overlay collision avoidance nudging
- [ ] Expand/collapse animations
- [ ] Error states and reconnection
- [ ] Pre-cache demo objects
- [ ] Performance tuning (React.memo, reduce re-renders)

> **Note**: Phase 3 is now faster (1.5 hours instead of 2) because there are no enrichment modules to build. Phase 4 is also simpler since all data comes from one source in a consistent format.

---

## 14. TypeScript Interfaces (Complete)

```typescript
// types/index.ts

export interface Detection {
  trackId: number;
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TrackedObject extends Detection {
  firstSeen: number;
  lastSeen: number;
  smoothedX: number;
  smoothedY: number;
  smoothedW: number;
  smoothedH: number;
  enrichmentState: "none" | "pending" | "ready" | "error";
  enrichmentData: EnrichmentResponse | null;
  isExpanded: boolean;
}

export interface EnrichmentResponse {
  trackId: number;
  identification: Identification;
  enrichment: Enrichment;
}

export interface Identification {
  name: string;
  brand: string | null;
  model: string | null;
  color: string;
  category: string;
  description: string;
}

export interface Enrichment {
  summary: string;
  price_estimate: {
    range_low: string;
    range_high: string;
    currency: string;
    note: string;
  };
  specs: Record<string, string>;
  search_query: string;
}

export interface WebSocketMessage {
  trackId: number;
  label: string;
  confidence: number;
  cropBase64: string;
}
```

---

## 15. Constants

```typescript
// lib/constants.ts

export const YOLO_CONFIDENCE_THRESHOLD = 0.85;
export const FRAME_SAMPLE_INTERVAL_MS = 100;       // 10fps
export const STABILITY_THRESHOLD_MS = 2000;         // 2 seconds before enrichment
export const GRACE_PERIOD_MS = 1000;                // 1 second before unmounting
export const MAX_OVERLAYS = 8;
export const SMOOTHING_FACTOR = 0.7;
export const WEBSOCKET_URL = "ws://localhost:8000/enrich";
export const YOLO_MODEL_PATH = "/models/yolov8n.onnx";
export const YOLO_INPUT_SIZE = 640;
```
