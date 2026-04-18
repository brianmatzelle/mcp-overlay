# Vision Explorer — Build Plan

> **Context-window strategy**: Each phase is self-contained. When starting a phase, tell the AI: "Read CLAUDE.md and plan.md, then implement Phase X.Y." Paste in any additional files listed under "Read first" for that phase. Clear context between phases.

---

## How to use this plan

1. Start a fresh context for each phase (or sub-phase if noted)
2. Paste the prompt from that phase's **AI prompt** block
3. The AI should read the files listed, then produce only what's listed under **Deliverables**
4. Run the **Verify** step before moving on
5. Check the box when done

---

## Phase 1 — Project Scaffolding

> One-time setup. Creates the skeleton both services live in. Do this whole phase in one context.

### 1a — Frontend scaffold

**AI prompt:**
```
Read CLAUDE.md. Scaffold the frontend for Vision Explorer.

Create the following structure using pnpm + Vite + React 18 + TypeScript + Tailwind CSS:

frontend/
  public/models/          (empty dir, gitkeep)
  src/
    components/           (empty)
    hooks/                (empty)
    lib/                  (empty)
    types/                (empty)
    styles/
      globals.css         (Tailwind directives + dark HUD base styles)
    App.tsx               (minimal: just a black fullscreen div for now)
    main.tsx              (standard Vite React entry)
  index.html
  vite.config.ts          (with ONNX WASM headers — see note)
  tailwind.config.ts
  tsconfig.json
  package.json

IMPORTANT vite.config.ts note: ONNX Runtime Web requires these response headers for SharedArrayBuffer (needed for WASM threads):
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
Add a vite plugin that sets these headers in dev server.

Install these packages:
  onnxruntime-web
  zustand
  react@18
  react-dom@18
  typescript
  tailwindcss
  @types/react
  @types/react-dom

After scaffolding, run: cd frontend && pnpm tsc --noEmit
```

**Deliverables:**
- [ ] `frontend/` directory fully scaffolded
- [ ] `pnpm install` succeeds
- [ ] `pnpm tsc --noEmit` passes

---

### 1b — Backend scaffold

**AI prompt:**
```
Read CLAUDE.md. Scaffold the backend for Vision Explorer.

Create the following structure:

backend/
  main.py           (minimal FastAPI app with placeholder /enrich WebSocket that echoes back)
  vision_llm.py     (stub: async function returning hardcoded dict)
  models.py         (empty for now)
  config.py         (loads ANTHROPIC_API_KEY from env)
  requirements.txt

requirements.txt must include:
  fastapi>=0.104.0
  uvicorn[standard]>=0.24.0
  websockets>=12.0
  anthropic>=0.40.0
  pydantic>=2.5.0
  python-dotenv>=1.0.0

The WebSocket echo stub should accept a JSON message and send it back with {"status": "ok"} merged in.
Add CORS middleware allowing http://localhost:5173.
```

**Deliverables:**
- [ ] `backend/` directory scaffolded
- [ ] `pip install -r requirements.txt` succeeds
- [ ] `uvicorn main:app --reload --port 8000` starts without errors

---

## Phase 2 — Types & Constants

> Foundation layer. Everything else imports from these files. Do in one context.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (sections 3.6, 4.4, 14, 15)

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md.

Create two files that every other file in the project will import from.

1. frontend/src/types/index.ts
   Implement ALL interfaces from section 14 of the design doc exactly as written:
   - Detection
   - TrackedObject (extends Detection, adds smoothedX/Y/W/H, firstSeen, lastSeen, enrichmentState, enrichmentData, isExpanded)
   - EnrichmentResponse
   - Identification
   - Enrichment (with summary, price_estimate, specs as Record<string,string>, search_query)
   - WebSocketMessage

2. frontend/src/lib/constants.ts
   Implement ALL constants from section 15:
   - YOLO_CONFIDENCE_THRESHOLD = 0.85
   - FRAME_SAMPLE_INTERVAL_MS = 100
   - STABILITY_THRESHOLD_MS = 2000
   - GRACE_PERIOD_MS = 1000
   - MAX_OVERLAYS = 8
   - SMOOTHING_FACTOR = 0.7
   - WEBSOCKET_URL = "ws://localhost:8000/enrich"
   - YOLO_MODEL_PATH = "/models/yolov8n.onnx"
   - YOLO_INPUT_SIZE = 640

   Also implement the CLASS_COLORS map and getClassColor() function from section 10 of the design doc.

Run: cd frontend && pnpm tsc --noEmit
```

**Deliverables:**
- [ ] `frontend/src/types/index.ts`
- [ ] `frontend/src/lib/constants.ts`
- [ ] Typecheck passes

---

## Phase 3 — Camera Feed

> Produces first visual: live camera in the browser. Can demo after this.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (sections 3.1, 3.2)

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md (sections 3.1 and 3.2).
Read frontend/src/types/index.ts and frontend/src/lib/constants.ts.

Implement camera feed in two files:

1. frontend/src/hooks/useCamera.ts
   - Calls getUserMedia with: facingMode "environment", width ideal 1280, height ideal 720, frameRate ideal 30
   - Returns: { videoRef, stream, error, isReady }
   - Handles permission denied: sets error message "Camera access required. Please allow camera in browser settings."
   - Cleans up stream tracks on unmount

2. frontend/src/components/CameraFeed.tsx
   - Renders <video> element that fills its container (100% width/height, object-fit cover)
   - Uses useCamera hook
   - If error: shows fullscreen dark overlay with the error message centered in white text
   - Sets video.srcObject = stream when ready
   - video element must have: autoPlay playsInline muted
   - NEVER process or draw on the video element itself

3. Update frontend/src/App.tsx
   - Black fullscreen container (w-screen h-screen bg-black overflow-hidden relative)
   - Render <CameraFeed /> inside it

Run: cd frontend && pnpm tsc --noEmit
```

**Deliverables:**
- [ ] `frontend/src/hooks/useCamera.ts`
- [ ] `frontend/src/components/CameraFeed.tsx`
- [ ] `frontend/src/App.tsx` updated
- [ ] Typecheck passes
- [ ] **Demo checkpoint**: `pnpm dev` → camera feed visible at localhost:5173

---

## Phase 4 — YOLO Library (Pre/Post Processing)

> Pure logic, no React. Write and test in isolation.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (sections 3.4, 3.5)

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md (sections 3.4 and 3.5).
Read frontend/src/types/index.ts and frontend/src/lib/constants.ts.

Implement YOLO pre/post processing in frontend/src/lib/yolo.ts.

The file must export:

1. preprocessFrame(imageData: ImageData): Float32Array
   - Resize imageData to 640x640 (use offscreen canvas)
   - Normalize pixels to [0, 1]
   - Transpose to NCHW: shape [1, 3, 640, 640]
   - Return as Float32Array

2. postprocessOutput(output: Float32Array, origWidth: number, origHeight: number): RawDetection[]
   - Input tensor shape: [1, 84, 8400] (flattened to Float32Array)
   - First 4 rows: cx, cy, w, h (normalized to YOLO 640x640 space)
   - Rows 4–83: class scores for 80 COCO classes
   - Steps:
     a. For each of 8400 anchors: find max class score and its index
     b. Filter: keep only anchors where max score > YOLO_CONFIDENCE_THRESHOLD (0.85)
     c. Convert cx/cy/w/h to x/y/w/h (top-left) scaled to origWidth/origHeight
     d. Apply NMS (IoU threshold 0.45): for overlapping boxes of same class, keep highest score
   - Return RawDetection[] where each has: { label: string, confidence: number, x, y, w, h }

3. Export COCO_CLASSES: string[] (all 80 COCO class names in order)

Also implement in frontend/src/lib/smoothing.ts:
   smoothBox(prev: {x,y,w,h}, curr: {x,y,w,h}, factor = SMOOTHING_FACTOR): {x,y,w,h}
   Uses EMA: result = prev * factor + curr * (1 - factor)

Then write frontend/src/lib/yolo.test.ts (Vitest):
   - Test preprocessFrame: output length = 1*3*640*640, all values in [0,1]
   - Test postprocessOutput: with a synthetic tensor that has one clear detection, returns it correctly
   - Test smoothBox: verify EMA math

Run: cd frontend && pnpm vitest run src/lib/yolo.test.ts
```

**Deliverables:**
- [ ] `frontend/src/lib/yolo.ts`
- [ ] `frontend/src/lib/smoothing.ts`
- [ ] `frontend/src/lib/yolo.test.ts`
- [ ] Tests pass

---

## Phase 5 — IoU Tracker

> Pure logic. Write and test in isolation before wiring to React.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (section 3.4 tracking paragraph), `frontend/src/types/index.ts`

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md (section 3.4, the tracking paragraph).
Read frontend/src/types/index.ts and frontend/src/lib/constants.ts.

Implement frontend/src/lib/tracker.ts:

Export a class SimpleTracker with:
  - nextId: number (starts at 1)
  - activeTracks: Map<number, {label, x, y, w, h, confidence}>

  update(detections: RawDetection[]): Detection[]
    For each detection:
      1. Find best matching active track: same label AND IoU > 0.5
      2. If match found: inherit that track's ID
      3. If no match: assign nextId++, add to activeTracks
    Remove stale tracks (those not matched in this frame)
    Return Detection[] with trackId assigned

  iou(a: {x,y,w,h}, b: {x,y,w,h}): number
    Standard intersection-over-union calculation

Where RawDetection = { label, confidence, x, y, w, h } (no trackId yet)
And Detection = RawDetection + { trackId: number } (from types/index.ts)

Write frontend/src/lib/tracker.test.ts (Vitest):
  - Same object across two frames inherits the same trackId
  - New object gets a new trackId
  - Object that disappears is not returned in next frame
  - IoU calculation: overlapping boxes, non-overlapping boxes, partial overlap

Run: cd frontend && pnpm vitest run src/lib/tracker.test.ts
```

**Deliverables:**
- [ ] `frontend/src/lib/tracker.ts`
- [ ] `frontend/src/lib/tracker.test.ts`
- [ ] Tests pass

---

## Phase 6 — useYOLO Hook + BoundingBoxCanvas

> Wires ONNX Runtime Web into React. Produces bounding boxes on canvas.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (sections 3.3, 3.4), all files in `frontend/src/lib/`

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md (sections 3.3, 3.4).
Read these files:
  frontend/src/types/index.ts
  frontend/src/lib/constants.ts
  frontend/src/lib/yolo.ts
  frontend/src/lib/tracker.ts
  frontend/src/lib/smoothing.ts

Implement:

1. frontend/src/hooks/useYOLO.ts
   - Loads YOLO model from YOLO_MODEL_PATH using onnxruntime-web
   - Prefers WebGPU execution provider, falls back to wasm
   - Sets ort.env.wasm.numThreads = 4
   - Accepts videoRef: RefObject<HTMLVideoElement>
   - Runs inference loop at FRAME_SAMPLE_INTERVAL_MS (100ms) using requestAnimationFrame + setTimeout
   - Each frame: drawImage video to offscreen canvas → preprocessFrame → run session → postprocessOutput
   - Maintains a SimpleTracker instance (imported from lib/tracker.ts)
   - Applies smoothBox from lib/smoothing.ts to each tracked detection
   - Returns: { detections: Detection[], isModelLoaded: boolean, error: string | null }
   - IMPORTANT: The offscreen canvas (for YOLO sampling) is separate from the display canvas
   - IMPORTANT: Never block or interfere with the <video> element display

2. frontend/src/components/BoundingBoxCanvas.tsx
   - Props: { detections: Detection[], videoWidth: number, videoHeight: number }
   - Renders a <canvas> that covers the video (position absolute, same dimensions)
   - On each detections change: clear canvas, draw bounding box rectangles
   - Use getClassColor(label) from lib/constants.ts for stroke color
   - Box style: strokeStyle = class color, lineWidth 2, no fill
   - Draw label text above each box in the same color

3. Update frontend/src/App.tsx
   - Add useYOLO hook
   - Add BoundingBoxCanvas overlaid on CameraFeed (stacked with position absolute)
   - Pass detections from useYOLO to BoundingBoxCanvas

Run: cd frontend && pnpm tsc --noEmit
Demo: Objects should have colored boxes around them in the browser.
```

**Deliverables:**
- [ ] `frontend/src/hooks/useYOLO.ts`
- [ ] `frontend/src/components/BoundingBoxCanvas.tsx`
- [ ] `frontend/src/App.tsx` updated
- [ ] Typecheck passes
- [ ] **Demo checkpoint**: Colored bounding boxes track objects in real-time

> **Note**: The actual ONNX model file (`yolov8n.onnx`) must be placed at `frontend/public/models/yolov8n.onnx` manually. Download from Ultralytics or use `yolo export model=yolov8n.pt format=onnx`.

---

## Phase 7 — Zustand Store + useTracking Hook

> Central state that all overlay components will read from.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (sections 3.6, 3.11), `frontend/src/types/index.ts`

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md (sections 3.6, 3.11).
Read frontend/src/types/index.ts and frontend/src/lib/constants.ts.

Implement Zustand store and tracking hook:

1. frontend/src/hooks/useTracking.ts
   This hook bridges raw YOLO detections into the full TrackedObject state.

   Accepts: rawDetections: Detection[] (from useYOLO)

   Maintains internal state (via useRef or Zustand):
     - trackedObjects: Map<number, TrackedObject>

   On each new rawDetections array:
     - For each detection: upsert into trackedObjects
       - If new trackId: create TrackedObject with firstSeen = Date.now(), enrichmentState "none"
       - If existing: update x/y/w/h, confidence, lastSeen
     - Apply grace period (GRACE_PERIOD_MS = 1000ms):
       - TrackIds not in this frame: start or continue grace period timer
       - If grace period expires: remove from trackedObjects
       - If trackId reappears during grace period: cancel its timer
     - Cap to MAX_OVERLAYS (8) highest-confidence objects

   Returns: TrackedObject[] (array, capped at 8)

2. Create frontend/src/store/useStore.ts (Zustand)
   Store shape:
   {
     trackedObjects: Map<number, TrackedObject>
     setTrackedObjects: (objects: TrackedObject[]) => void
     updateEnrichment: (trackId: number, data: EnrichmentResponse) => void
     setEnrichmentState: (trackId: number, state: TrackedObject['enrichmentState']) => void
     toggleExpanded: (trackId: number) => void
   }

   IMPORTANT: Use Zustand's immer middleware or manual map updates. Maps in Zustand need careful handling to trigger re-renders — convert to new Map on each update.

Run: cd frontend && pnpm tsc --noEmit
```

**Deliverables:**
- [ ] `frontend/src/hooks/useTracking.ts`
- [ ] `frontend/src/store/useStore.ts`
- [ ] Typecheck passes

---

## Phase 8 — Overlay Components (Pill + HUD Styling)

> First real UI. Produces floating pills over the camera feed. Demo-able.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (sections 3.7, 3.8, 3.9, 3.10), `frontend/src/types/index.ts`

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md (sections 3.7, 3.8, 3.9, 3.10).
Read frontend/src/types/index.ts and frontend/src/lib/constants.ts.

Implement the overlay component system:

1. frontend/src/components/CollapsedPill.tsx
   Props: { obj: TrackedObject }

   Visual states:
   - enrichmentState "none":    "<label> <confidence%>" e.g. "cup 91%"
   - enrichmentState "pending": "<label> <confidence%> ◌" (animated spinner character or CSS spin)
   - enrichmentState "ready":   "<name> ●" where name = obj.enrichmentData.identification.name
   - enrichmentState "error":   "<label> ⚠"

   Style:
   - Dark pill: bg rgba(0,0,0,0.75), backdrop-filter blur(8px)
   - Border: 1.5px solid using getClassColor(obj.label)
   - Border-radius: 12px
   - Padding: 6px 12px
   - Font: monospace, text-sm, white
   - Fade in on mount: opacity 0 → 1 over 200ms CSS transition

2. frontend/src/components/ObjectOverlay.tsx
   Props: { obj: TrackedObject }

   - Absolutely positioned div at (obj.smoothedX, obj.smoothedY)
   - Width = obj.smoothedW (for positioning reference)
   - GPU layer: transform translate3d(0,0,0)
   - Smooth movement: CSS transition "left 100ms linear, top 100ms linear"
   - zIndex: obj.isExpanded ? 100 : 30
   - onClick: call store.toggleExpanded(obj.trackId)
   - Renders CollapsedPill (expanded card comes in Phase 12)
   - Wrap with React.memo

3. frontend/src/components/OverlayLayer.tsx
   - Position absolute, full size, pointer-events none (except children)
   - Reads trackedObjects from Zustand store
   - Renders one ObjectOverlay per TrackedObject
   - Applies simple collision avoidance:
     Sort overlays by confidence (descending). For each pill, check if its
     rendered position overlaps a previous pill. If yes, nudge downward by
     pill height + 8px. Use a simple rect intersection check.
   - Children have pointer-events auto

4. Update frontend/src/styles/globals.css
   - Import JetBrains Mono from Google Fonts (or use font-mono Tailwind class)
   - Add .hud-blur class: backdrop-filter blur(8px) -webkit-backdrop-filter blur(8px)
   - Dark scrollbar styles

5. Update frontend/src/App.tsx
   - Wire useTracking into the Zustand store (call setTrackedObjects each frame)
   - Add <OverlayLayer /> as third layer (z-index 30, above canvas)
   - Layer order: CameraFeed → BoundingBoxCanvas → OverlayLayer

Run: cd frontend && pnpm tsc --noEmit
Demo: Floating pills should appear over detected objects with HUD styling.
```

**Deliverables:**
- [ ] `frontend/src/components/CollapsedPill.tsx`
- [ ] `frontend/src/components/ObjectOverlay.tsx`
- [ ] `frontend/src/components/OverlayLayer.tsx`
- [ ] Updated `frontend/src/App.tsx`
- [ ] Typecheck passes
- [ ] **Demo checkpoint**: Styled floating pills tracking objects with HUD aesthetic

---

## Phase 9 — Backend: Models, Config, Vision LLM, WebSocket Handler

> Complete backend in one phase. Simpler now — single LLM call, no enrichment modules.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (sections 4.1, 4.2, 4.3, 4.4)

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md (sections 4.1, 4.2, 4.3, 4.4).

Implement the complete backend:

1. backend/config.py
   - Load ANTHROPIC_API_KEY from env (required, raise ValueError if missing)
   - Load FRONTEND_ORIGIN from env (default "http://localhost:5173")
   - Use python-dotenv to load .env file if present

2. backend/models.py (Pydantic v2 models)
   - EnrichmentRequest: trackId int, label str, confidence float, cropBase64 str
   - Identification: name str, brand str|None, model str|None, color str, category str, description str
   - PriceEstimate: range_low str, range_high str, currency str, note str
   - Enrichment: summary str, price_estimate PriceEstimate, specs dict[str, str], search_query str
   - EnrichmentResponse: trackId int, identification Identification, enrichment Enrichment

3. backend/vision_llm.py
   - Implement call_vision_llm(crop_base64: str, yolo_label: str) -> dict
   - Uses anthropic.AsyncAnthropic() client
   - Model: "claude-sonnet-4-20250514"
   - max_tokens: 600
   - Prompt: exactly as written in design doc section 4.3 — asks for BOTH identification AND enrichment in a single structured JSON response
   - The response includes: identification (name, brand, model, color, category, description) AND enrichment (summary, price_estimate, specs as key-value pairs, search_query)
   - Parse response: strip markdown code fences if present (``` or ```json), then json.loads
   - On JSON parse failure: retry once. If still fails, return a minimal dict:
     {"identification": {"name": yolo_label, "brand": null, "model": null, "color": "unknown", "category": yolo_label, "description": yolo_label}, "enrichment": {"summary": "", "price_estimate": {"range_low": "", "range_high": "", "currency": "USD", "note": ""}, "specs": {}, "search_query": yolo_label}}

4. backend/main.py
   - FastAPI app with CORS middleware (allow origin from config.FRONTEND_ORIGIN)
   - GET / health check returning {"status": "ok"}
   - WebSocket /enrich endpoint:
     a. Accept connection
     b. Loop: receive_json → validate as EnrichmentRequest
     c. call_vision_llm (single call returns identification + enrichment)
     d. send_json with trackId + result
   - Exception handling: print error, continue loop (don't crash on one bad message)
   - ConnectionDisconnect: break loop cleanly

Run: cd backend && python -c "from main import app; print('OK')"
```

**Deliverables:**
- [ ] `backend/config.py`
- [ ] `backend/models.py`
- [ ] `backend/vision_llm.py`
- [ ] `backend/main.py` (complete WebSocket handler)
- [ ] Import check passes

---

## Phase 10 — useEnrichment Hook (Frontend WebSocket)

> Connects frontend to backend. Wires enrichment state into Zustand.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (sections 5.1, 5.2, 5.3), `frontend/src/types/index.ts`, `frontend/src/lib/constants.ts`, `frontend/src/store/useStore.ts`

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md (sections 5.1, 5.2, 5.3).
Read:
  frontend/src/types/index.ts
  frontend/src/lib/constants.ts
  frontend/src/store/useStore.ts
  frontend/src/hooks/useTracking.ts

Implement frontend/src/hooks/useEnrichment.ts

This hook manages the WebSocket connection and all enrichment logic.

Responsibilities:
1. WebSocket connection to WEBSOCKET_URL ("ws://localhost:8000/enrich")
   - Auto-reconnect with exponential backoff: 1s, 2s, 4s, max 10s
   - Reconnect on close or error (not on intentional disconnect)
   - Show connection state: "connected" | "reconnecting" | "disconnected"

2. Enrichment gating — call shouldEnrich() each time trackedObjects updates:
   function shouldEnrich(obj: TrackedObject): boolean {
     return (
       obj.confidence > YOLO_CONFIDENCE_THRESHOLD &&
       Date.now() - obj.firstSeen >= STABILITY_THRESHOLD_MS &&
       obj.enrichmentState === "none"
     )
   }

3. When shouldEnrich returns true for an object:
   a. Call store.setEnrichmentState(trackId, "pending")
   b. Crop bounding box from the sample canvas (accept canvasRef as param)
   c. Encode as JPEG base64: canvas.toDataURL("image/jpeg", 0.85).split(",")[1]
   d. Send WebSocket message (WebSocketMessage interface)

4. On WebSocket message received:
   a. Parse JSON as EnrichmentResponse
   b. Call store.updateEnrichment(trackId, data)
   c. If trackId not found in current trackedObjects: silently drop (object left frame)

5. On WebSocket error for a send:
   a. call store.setEnrichmentState(trackId, "error")

Returns: { connectionStatus: string, reconnectAttempts: number }

Also accept a sampleCanvasRef: RefObject<HTMLCanvasElement | null> parameter — this is the offscreen canvas from useYOLO that already has the current frame drawn. Crop from this canvas.

IMPORTANT: Never send the same trackId twice. The state machine (none → pending → ready/error) prevents this. Trust it.

Update frontend/src/App.tsx:
- Pass sampleCanvasRef from useYOLO to useEnrichment
- Show a subtle connection status indicator (small dot, bottom-right corner): green=connected, yellow=reconnecting, red=disconnected

Run: cd frontend && pnpm tsc --noEmit
```

**Deliverables:**
- [ ] `frontend/src/hooks/useEnrichment.ts`
- [ ] Updated `frontend/src/App.tsx`
- [ ] Typecheck passes
- [ ] **Demo checkpoint**: With backend running, pills update to identified names (e.g., "cup 91%" → "Yeti Rambler ●")

---

## Phase 11 — Expanded Card Component

> The full detail card. Final major UI piece.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (sections 3.7, 3.8, 3.9, 4.4), `frontend/src/types/index.ts`

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md (sections 3.7, 3.8, 3.9, 4.4).
Read:
  frontend/src/types/index.ts
  frontend/src/lib/constants.ts
  frontend/src/components/CollapsedPill.tsx
  frontend/src/components/ObjectOverlay.tsx

Implement:

1. frontend/src/components/ExpandedCard.tsx
   Props: { obj: TrackedObject }

   Layout (dark HUD card, border-radius 16px, min-width 280px, max-width 360px):
   ┌─────────────────────────────────┐
   │ [Name]                  [color] │  ← colored header bar using getClassColor
   │ [brand] · [category]           │
   │ ~$XX – $XX                     │  ← price estimate range
   │─────────────────────────────────│
   │ [Summary, max 3 lines]         │  ← enrichment.summary
   │─────────────────────────────────│
   │ [Spec key: value pills]        │  ← enrichment.specs as key-value pairs
   │─────────────────────────────────│
   │ [Search ↗]                     │  ← opens Google search with enrichment.search_query
   └─────────────────────────────────┘

   The search link opens: https://www.google.com/search?q={encodeURIComponent(search_query)}
   in a new tab with rel="noopener noreferrer".

   Loading skeleton: if enrichmentState is "pending", show animated skeleton divs (bg-gray-700 animate-pulse)

   All sections are conditional — only render if data exists. No empty sections.

2. Update frontend/src/components/ObjectOverlay.tsx
   - Import ExpandedCard
   - When obj.isExpanded is true: render ExpandedCard instead of CollapsedPill
   - Add max-height transition for expand/collapse: 0 → auto over 300ms ease-out
     (Use a wrapper div with overflow-hidden and max-height transition)
   - When expanded: zIndex 100, so card appears above all pills
   - Click outside behavior: add a global click handler that collapses any expanded overlay
     when clicking outside the card (use useEffect + document.addEventListener)

Run: cd frontend && pnpm tsc --noEmit
Demo: Click any enriched pill (●) → full card expands with summary, price, specs, search link.
```

**Deliverables:**
- [ ] `frontend/src/components/ExpandedCard.tsx`
- [ ] Updated `frontend/src/components/ObjectOverlay.tsx`
- [ ] Typecheck passes
- [ ] **Demo checkpoint**: Full working app — detect, enrich, click to expand detailed card

---

## Phase 12 — Error Handling & Reconnection UX

> Robustness. Makes the demo bulletproof.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (section 12), all existing hook files

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md (section 12 — Fallback & Error Handling).
Read:
  frontend/src/hooks/useCamera.ts
  frontend/src/hooks/useYOLO.ts
  frontend/src/hooks/useEnrichment.ts
  frontend/src/components/CollapsedPill.tsx

Implement all error states from design doc section 12:

1. Camera permission denied (already partially done in useCamera.ts)
   - Verify the fullscreen error message works
   - Add a "Retry" button that calls getUserMedia again

2. YOLO model fails to load
   - In useYOLO.ts: catch model load errors, expose modelError: string | null
   - In App.tsx: show an error banner at top of screen with "YOLO model failed to load" + Retry button
   - Retry button: calls a reload function exposed from useYOLO

3. WebSocket reconnection (already in useEnrichment.ts — verify and complete)
   - Exponential backoff: delays = [1000, 2000, 4000, 8000, 10000, 10000, ...]
   - While reconnecting: show "Reconnecting..." text near the status dot
   - Overlays remain mounted and visible during reconnection (don't clear state)
   - When reconnected: reset backoff counter

4. Vision LLM error (backend returns error in enrichment response)
   - If backend sends { error: true, trackId }, set enrichmentState to "error"
   - Pill shows "⚠" icon in error state
   - Clicking an error pill retries: send the crop again (reset state to "none" first)
   - Update useEnrichment.ts to handle this retry flow

5. Unparseable JSON from Vision LLM
   - Backend already retries once and falls back — verify this works
   - Frontend should handle receiving a fallback response gracefully

Run: cd frontend && pnpm tsc --noEmit
```

**Deliverables:**
- [ ] Error states implemented across all hooks and components
- [ ] Retry mechanisms work
- [ ] Typecheck passes

---

## Phase 13 — Polish & Performance

> Final phase. Animations, React.memo, collision avoidance tuning.

**Read first:** `CLAUDE.md`, `docs/design-doc.md` (sections 3.10, 3.11, 6), all component files

**AI prompt:**
```
Read CLAUDE.md and docs/design-doc.md (sections 3.10, 3.11, 6).
Read all files in frontend/src/components/ and frontend/src/hooks/.

Apply performance and polish improvements:

1. React.memo — wrap ALL overlay components aggressively:
   - CollapsedPill: memo with custom comparator (compare trackId + enrichmentState + label + confidence)
   - ExpandedCard: memo (only re-renders when enrichmentData changes)
   - ObjectOverlay: memo (compare smoothedX, smoothedY, smoothedW, smoothedH, enrichmentState, isExpanded)
   - BoundingBoxCanvas: memo

2. Verify collision avoidance in OverlayLayer.tsx:
   - Sort overlays by confidence desc before rendering
   - For each pill, if its top/left overlaps a previously positioned pill, nudge it down
   - Use simple rect intersection: check if two {x, y, w, h} rects overlap
   - Limit nudging: max 3 nudges per pill (avoid infinite downward push)

3. Verify grace period in useTracking.ts:
   - Objects fading out (in grace period) should render at 50% opacity
   - Add a "fadingOut: boolean" field to TrackedObject, or handle in ObjectOverlay via CSS

4. Animation audit:
   - Pill fade-in on first appearance: 200ms, opacity 0→1
   - Expand/collapse: 300ms ease-out via max-height transition
   - Pill position movement: 100ms linear CSS transition
   - Verify none of these cause layout thrash (use transform where possible)

5. Performance audit:
   - Confirm video element is not being read at 30fps (only 10fps sampling)
   - Confirm detections array reference changes only when content changes (use useMemo or stable refs)
   - Confirm BoundingBoxCanvas useEffect dependency array is correct (detections + dimensions)
   - Confirm Zustand selectors use shallow equality where appropriate (use `useShallow` from zustand/react/shallow)

Run: cd frontend && pnpm tsc --noEmit && pnpm eslint src/
```

**Deliverables:**
- [ ] React.memo applied throughout
- [ ] Collision avoidance verified
- [ ] Animations smooth
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] **Final demo checkpoint**: Full polish, smooth animations, handles edge cases

---

## Phase 14 — Backend Tests

> Validates backend correctness before demo.

**Read first:** `CLAUDE.md`, `backend/main.py`, `backend/vision_llm.py`, `backend/models.py`

**AI prompt:**
```
Read CLAUDE.md.
Read:
  backend/main.py
  backend/vision_llm.py
  backend/models.py

Write backend/tests/test_websocket.py (pytest + anyio + httpx AsyncClient):

1. test_health_check: GET / returns {"status": "ok"}

2. test_websocket_enrichment_flow:
   - Mock call_vision_llm to return a valid dict with identification + enrichment
   - Connect to /enrich WebSocket
   - Send a valid EnrichmentRequest JSON
   - Assert response matches EnrichmentResponse schema (has trackId, identification, enrichment)
   - Assert trackId matches the request

3. test_websocket_handles_malformed_json:
   - Connect to /enrich
   - Send invalid JSON string
   - Assert connection stays open (no crash)

4. test_vision_llm_strips_markdown_fences:
   - Mock anthropic client to return response with ```json\n{...}\n```
   - Call call_vision_llm directly
   - Assert result is a valid dict (markdown stripped)

Run: cd backend && python -m pytest tests/ -x -v
```

**Deliverables:**
- [ ] `backend/tests/test_websocket.py`
- [ ] All tests pass

---

## Final Checklist

### Full system test
- [ ] Backend running: `uvicorn main:app --reload --port 8000`
- [ ] Frontend running: `pnpm dev`
- [ ] Camera feed visible
- [ ] Bounding boxes appearing on objects
- [ ] Floating pills with correct labels and confidence
- [ ] Pills transition to enriched names (requires ANTHROPIC_API_KEY)
- [ ] Click pill → expanded card with summary, price estimate, specs, search link
- [ ] Click away → card collapses
- [ ] Disconnect network → reconnecting indicator shown, overlays stay
- [ ] Reconnect → system resumes automatically
- [ ] 8+ objects visible → only 8 highest-confidence overlays shown

### Environment setup reminder
```bash
# Required
export ANTHROPIC_API_KEY=sk-ant-...

# Model file (download separately)
# Place at: frontend/public/models/yolov8n.onnx
```

---

## Phase Quick Reference

| Phase | What it builds | Context clear after? |
|-------|---------------|---------------------|
| 1a | Frontend scaffold | Yes |
| 1b | Backend scaffold | Yes |
| 2 | Types + Constants | Yes |
| 3 | Camera feed | Yes |
| 4 | YOLO lib + tests | Yes |
| 5 | IoU Tracker + tests | Yes |
| 6 | useYOLO + BoundingBoxCanvas | Yes |
| 7 | Zustand store + useTracking | Yes |
| 8 | Overlay pills + HUD styling | Yes |
| 9 | Backend: models + config + vision LLM + WS handler | Yes |
| 10 | useEnrichment hook (WebSocket client) | Yes |
| 11 | Expanded card component | Yes |
| 12 | Error handling + reconnection | Yes |
| 13 | Polish + React.memo + performance | Yes |
| 14 | Backend tests | Yes |
