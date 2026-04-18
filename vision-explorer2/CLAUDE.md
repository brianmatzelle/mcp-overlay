# Vision Explorer

Real-time object detection web app with AR-style overlays. YOLO runs in-browser for speed, a Vision LLM identifies and enriches objects in a single call, and results are rendered as live HUD overlays on the camera feed.

## Architecture

Monorepo with two independent services:

- `frontend/` — React 18 + TypeScript + Vite. YOLO v8-nano runs client-side via ONNX Runtime Web (WebGPU). Three stacked layers: `<video>` (camera), `<canvas>` (bounding boxes), React overlay divs (pills/cards).
- `backend/` — FastAPI (Python 3.11+). Single WebSocket endpoint at `/enrich`. Receives cropped images, calls Vision LLM (Claude API) which returns both identification AND enrichment in a single structured JSON response. No external enrichment APIs.

Communication is exclusively over WebSocket — no REST endpoints. The frontend sends crops only when an object passes the enrichment gate (confidence > 0.85, stable 2s, not already enriched).

## Key files

- `frontend/src/hooks/useYOLO.ts` — ONNX model loading + inference loop at 10fps
- `frontend/src/hooks/useTracking.ts` — IoU-based tracker for persistent track IDs + EMA smoothing
- `frontend/src/hooks/useEnrichment.ts` — WebSocket client + enrichment cache by track ID
- `frontend/src/lib/yolo.ts` — YOLO pre/post processing (resize to 640x640, NCHW transpose, NMS)
- `frontend/src/lib/tracker.ts` — Simple IoU matching tracker (50% IoU threshold)
- `frontend/src/components/ObjectOverlay.tsx` — Overlay lifecycle: detected → enriching → ready → expanded
- `backend/main.py` — FastAPI app + WebSocket handler
- `backend/vision_llm.py` — Claude API vision call returning identification + enrichment as structured JSON

## Bash commands

```bash
# Frontend
cd frontend
pnpm install
pnpm dev                    # → http://localhost:5173

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000   # → ws://localhost:8000/enrich

# Typecheck frontend
cd frontend && pnpm tsc --noEmit

# Run single test (prefer this over full suite)
cd frontend && pnpm vitest run src/lib/tracker.test.ts
cd backend && python -m pytest tests/test_websocket.py -x

# Lint
cd frontend && pnpm eslint src/
cd backend && ruff check .
```

## Environment variables

Backend requires:
- `ANTHROPIC_API_KEY` — for Vision LLM calls (Claude claude-sonnet-4-20250514)

No other API keys required. The Vision LLM handles both identification and enrichment in a single call.

## Tech decisions

- **pnpm** not npm/yarn for frontend packages
- **Zustand** for state management (not Redux, not React Context for perf-critical tracking state)
- **Tailwind CSS** for styling. Dark HUD theme with `backdrop-filter: blur(8px)` and semi-transparent backgrounds
- **Single Vision LLM call** for both identification and enrichment — no external APIs (Wikipedia, SerpAPI, etc.). The LLM returns name, brand, model, summary, price estimate, specs, and search query all in one response
- **ONNX Runtime Web** with WebGPU preferred, WASM fallback. Model file at `frontend/public/models/yolov8n.onnx`
- YOLO input: 640×640, NCHW format, pixels normalized to [0,1]. Output tensor shape `[1, 84, 8400]` post-processed with NMS
- Video feed plays natively at 30fps in `<video>` — JS only samples at 10fps for YOLO. IMPORTANT: never block or process the video element for display

## Critical performance rules

- Cap at **8 simultaneous overlays** (highest confidence wins)
- **React.memo** aggressively on overlay components — bounding box updates are frequent
- Track ID **grace period of 1 second** before unmounting (prevents flicker)
- EMA smoothing factor **0.7** for bounding box positions
- Vision LLM calls gated: confidence > 0.85 AND stable 2s AND not already sent. Never send same track ID twice
- WebSocket auto-reconnect with exponential backoff (1s, 2s, 4s, max 10s)

## Patterns to follow

- The Vision LLM call in `vision_llm.py` returns both identification and enrichment in one structured JSON response. Always strip markdown code fences before parsing. On parse failure, retry once then fall back to YOLO label only.
- Frontend overlay states follow strict lifecycle: `"none"` → `"pending"` → `"ready"` | `"error"`. Render differently at each state.
- Class-specific accent colors are deterministic by COCO label. Use the `getClassColor()` helper in `lib/constants.ts`. Don't hardcode colors in components.
- All TypeScript interfaces live in `frontend/src/types/index.ts`. Import from there.
- The expanded card uses `search_query` from the LLM response to generate a Google search link. No direct Amazon/Wikipedia linking.

## Testing approach

- Frontend: Vitest for unit tests on tracker, smoothing, YOLO post-processing logic. Avoid testing React components that depend on camera/WebGL.
- Backend: pytest with httpx.AsyncClient for WebSocket tests. Mock the Anthropic API calls in tests.
- Always run relevant tests after changes. Run typecheck before committing frontend changes.

## Common pitfalls

- YOLO ONNX model must be served from `public/models/` — Vite won't bundle it. Don't move it to `src/`.
- `getUserMedia` requires HTTPS in production (localhost is exempt). Camera `facingMode: "environment"` falls back gracefully.
- WebSocket messages are JSON strings, not binary. Always `JSON.parse`/`JSON.stringify`.
- The Vision LLM sometimes wraps JSON in markdown code fences — always strip those before parsing.
- CORS: backend must allow frontend origin. FastAPI middleware handles this.
