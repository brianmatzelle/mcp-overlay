# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision

**mcp-overlay** is building a WebXR application where an AI assistant (Garvis) overlays the user's real-world vision with MCP App UIs that annotate objects in real time.

**Concrete example:** In a grocery store, look at different brands of chicken. Garvis detects them via computer vision, researches them via MCP tools (web search, nutrition APIs), and renders floating MCP App UI panels anchored to each product in AR space — all triggered by voice or gaze.

The subprojects below are building blocks toward this unified goal, each contributing essential capabilities that will be composed together. **`xr-mcp-app/`** is the integration point where these capabilities converge.

## Repository Overview

Monorepo containing six subprojects, each with its own CLAUDE.md for project-specific details:

- **`xr-mcp-app/`** — **[XR + MCP Integration]** The unified app. Renders MCP tool results as native 3D overlays in WebXR (Quest 3 AR), triggered exclusively by Garvis voice commands. Browser mode is a simple launcher (title + Enter AR button). React + Three.js + @react-three/xr frontend, voice connection to Garvis server.
- **`garvis/`** — **[XR + Voice + Detection]** XR voice assistant for Meta Quest 3 / WebXR. Real-time bidirectional audio (Deepgram STT → Claude LLM → Eleven Labs TTS) over WebSocket, with YOLOv8 object detection and DeepFace face detection rendered as AR overlays. Python FastAPI + FastMCP backend, React + Three.js + WebXR frontend.
- **`mcp-app-sandbox/`** — **[MCP App UI Rendering]** Browser-based MCP server interaction tool. Connect to any MCP server, execute tools, view MCP App UIs in sandboxed iframes, chat with Claude-powered agent. Also hosts MCP servers: `mta-subway/` (port 3001), `citibike/` (port 3002), `crackstreams/` (port 3003). React + Vite frontend, Express backend.
- **`vision-research-server/`** — **[Vision + MCP Tool]** FastMCP server providing `research-visible-objects` tool. YOLOv8 object detection + Claude Vision enrichment in parallel. Returns JSON with detection coords, class, identification, and enrichment. Python FastAPI + FastMCP backend (port 3004).
- **`vision-explorer2/`** — **[Standalone Vision App]** Real-time object detection web app. Client-side YOLO v8 inference via ONNX Runtime Web, with Claude Vision enrichment over WebSocket. React + Zustand + Tailwind frontend (pnpm), FastAPI backend. Standalone — not integrated into `run.sh`.
- **`manim-mcp/`** — **[Tool Patterns + Streaming]** AI math tutoring platform. Renders Manim animations from math expressions via MCP tools, streams Claude responses via SSE. Python FastAPI + FastMCP backend, Next.js 15 frontend, AWS infrastructure.

## XR MCP App Architecture — `xr-mcp-app/`

The integration app that composes capabilities from the other subprojects. Dual-mode rendering: browser (DOM) and XR (3D).

### Architecture
```
App.tsx (useVoiceAssistant for XR)
├── Browser mode: title + "Enter AR" button (launcher only, no auto-loading)
└── Canvas > XR
      └── <XRScene />                 (3D — only renders in AR session)
            ├── <Window> + <ChatWindow3D />        (draggable, left side)
            ├── <Window> + <VoiceIndicator3D />    (draggable, bottom of FOV)
            ├── <Window> + <SubwayArrivals3D />    (draggable, voice-triggered, right side)
            └── <Window> + <CitiBikeStatus3D />    (draggable, voice-triggered)
```

All XR panels are draggable, resizable `Window` components (ported from garvis `Window.tsx`). Users can grab the title bar to reposition any window in 3D space and use the resize handle to scale. Positions persist to localStorage. MCP tool results only appear when triggered by voice through Garvis — the app is voice-first.

### Voice-Triggered MCP Flow (XR Mode)
```
User speaks → Mic (16kHz PCM) → WebSocket → Garvis server (port 8000)
→ Deepgram STT → Claude LLM (with MCP tools from bridge)
→ Claude calls MCP tool → MCP Bridge → HTTP to MTA (port 3001) or Citibike (port 3002)
→ Tool result sent to client: {"type": "mcp_tool_result", "tool_name": "...", "content": [...]}
→ Claude generates spoken response → ElevenLabs TTS → MP3 audio to client
→ Client renders: SubwayArrivals3D / CitiBikeStatus3D + ChatWindow3D + audio playback
```

### Key Files
- `xr-mcp-app/src/App.tsx` — Top-level: XR store, useVoiceAssistant (XR), voice-only MCP panel layout
- `xr-mcp-app/src/hooks/useVoiceAssistant.ts` — XR hook: bridges GarvisClient events → React state (messages, mcpToolResults map keyed by tool name, voice status)
- `xr-mcp-app/src/voice/garvis-client.ts` — WebSocket voice client: mic capture, PCM streaming, TTS playback, MCP tool result handling
- `xr-mcp-app/src/components/XRWindow.tsx` — Draggable, resizable 3D window container (ported from garvis `Window.tsx`). Drag via title bar pointer events, resize via bottom-right handle, camera-follow visor/yaw modes, localStorage persistence via `storageKey` prop
- `xr-mcp-app/src/components/SubwayArrivals3D.tsx` — Parses subway JSON → 3D text: station name, colored line circle, direction arrows, arrival times
- `xr-mcp-app/src/components/CitiBikeStatus3D.tsx` — Parses citibike JSON → 3D text: station name, classic/ebike counts (color-coded), docks, capacity bar, status badges
- `xr-mcp-app/src/components/ChatWindow3D.tsx` — 3D chat transcript with status bar, color-coded user/assistant messages
- `xr-mcp-app/src/components/VoiceIndicator3D.tsx` — Status sphere (green/yellow/blue/gray/red) with pulse animation. Camera-following handled by parent Window
- `xr-mcp-app/src/design-system.ts` — Garvis design tokens (colors, spacing, typography, radii, opacity, animation, zLayers, windowDefaults) + `PointerEvent3D`/`HorizontalMode` types + `createRoundedRectGeometry`
- `xr-mcp-app/src/mcp.ts` — Lightweight fetch-based MCP client (JSON-RPC 2.0, session management)

### Design Decisions
- **No XRDomOverlay**: Quest 3 silently ignores `dom-overlay` (it's a handheld AR feature). All XR UI must be Three.js 3D objects.
- **Draggable windows**: `Window` component (ported from garvis `Window.tsx`) supports drag (title bar pointer events with `setPointerCapture`), resize (bottom-right handle, distance-based scaling 0.5x–2.0x), close button, and localStorage persistence. Camera-follow via `useFrame()` + `lerp`/`slerp` smoothing with visor (camera-locked HUD) and yaw (world-horizontal) modes. During drag, position updates instantly; when idle, lerps smoothly (0.15 factor).
- **Multi-tool result state**: `useVoiceAssistant` stores `mcpToolResults` as a `Record<string, MCPToolResult>` keyed by tool name, so multiple MCP panels (subway, citibike, etc.) can coexist simultaneously. Each panel auto-shows when new data arrives and can be independently closed.
- **Data-driven 3D rendering**: Instead of embedding HTML iframes in XR, we parse the MCP tool result `content[0].text` JSON and render it as `<Text>` and `<mesh>` primitives. This is pure WebGL and works reliably on Quest 3.
- **Design tokens from Garvis**: `design-system.ts` inlines a minimal subset of `garvis/xr-client/src/design-system/tokens.ts` and `primitives.ts` to avoid cross-project imports.
- **No React StrictMode**: Removed from `main.tsx` because StrictMode double-fires effects, which creates duplicate WebSocket connections to the voice server.
- **Connection deduplication**: `useVoiceAssistant` uses a `connectingRef` guard to prevent duplicate WebSocket connections during async connect handshake. Server-side `_processing` flag in `VoicePipeline` prevents overlapping speech-end handling.

## Building Blocks for Unified Vision

How each subproject contributes to the goal of AR-overlaid MCP App UIs. See each subproject's own CLAUDE.md for detailed file references and conventions.

- **WebXR Rendering** (`garvis/`): AR passthrough with React Three Fiber + `@react-three/xr`. `pixelToPlane()` maps 2D detection coordinates to 3D-space overlays.
- **Object Detection** (`garvis/`): Client captures frames → base64 JPEG → server. YOLOv8 (80 COCO classes) + DeepFace faces → 3D bounding boxes with labels.
- **Voice Pipeline** (`garvis/`): Real-time STT → LLM → TTS over WebSocket. Deepgram STT with VAD, Claude with tool calling, ElevenLabs TTS. Binary frames = audio, JSON frames = control.
- **MCP Bridge** (`garvis/`): Server-side client connects to external MCP servers at startup, discovers tools, routes Claude tool calls via HTTP JSON-RPC 2.0. Configured in `garvis/server/config.py`.
- **Vision Research** (`vision-research-server/`): `research-visible-objects` MCP tool — YOLOv8 detection + Claude Vision enrichment in parallel. Garvis auto-injects latest camera frame.
- **Live Sports Streaming** (`mcp-app-sandbox/crackstreams/`): `search-streams` and `show-stream` tools. Provider registry pattern, HLS proxy with CDN selection.
- **MCP App UI Rendering** (`mcp-app-sandbox/`): `AppRenderer` from `@mcp-ui/client` renders HTML apps in double-iframe sandbox. `registerAppTool()` returns `structuredContent.resource.uri` pointing to bundled HTML.
- **Agentic Tool Loop** (`mcp-app-sandbox/` + `manim-mcp/`): Backend Claude API + MCP tool execution with SSE streaming. Up to 10 turns (sandbox) or 100 (manim).
- **Client ECS State** (`garvis/`): Koota entity-component-system. Traits: ChatHistory, VoiceState, ActiveVideo, VisorConfig.

### MCP Server Integration Patterns
- **Python**: FastMCP (`@mcp.tool()`) with `mcp.http_app()` mounted on FastAPI at `/mcp`. Used by garvis, vision-research-server, crackstreams, manim-mcp.
- **JS/TS**: `@modelcontextprotocol/sdk` `McpServer` + `StreamableHTTPServerTransport`. Used by mta-subway, citibike.
- **Browser clients**: Lightweight JSON-RPC 2.0 over fetch with `mcp-session-id` header (no SDK dependency). See `mcp-app-sandbox/src/mcp.ts` and `xr-mcp-app/src/mcp.ts`.
- **Garvis** acts as both MCP server (native tools) and MCP client (bridge to 4 external servers).

## Quick Start Commands

### All Services (from repo root)
```bash
./run.sh                       # Start all 6 services, Ctrl+C stops all
# MTA (3001) + Citibike (3002) + CrackStreams (3003) + Vision Research (3004) + Garvis (8000) + XR app (5174)
```

### Garvis (from `garvis/`)
```bash
./run-all.sh                   # Start both server (8000) and client (5173)
cd server && uv sync && uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
cd xr-client && npm install && npm run dev
cd xr-client && npm run lint   # ESLint
```

### Manim MCP (from `manim-mcp/`)
```bash
./start-app.sh                 # tmux session with server + web client
cd server && uv sync && uv run uvicorn server:app --host 0.0.0.0 --port 8000 --reload
cd server && uv run pytest     # Tests
cd server && uv run ruff check . && uv run black .  # Lint + format
cd web-client && npm install && npm run dev          # Next.js dev (port 3000)
```

### XR MCP App (from `xr-mcp-app/`)
```bash
npm run dev                    # Vite dev server (HTTPS, port 5174)
npm run build                  # tsc -b && vite build
npx tsc -b                     # Type check only
# Requires: MTA MCP server on port 3001, Citibike MCP server on port 3002, Garvis server on port 8000 (for voice)
```

### MCP App Sandbox (from `mcp-app-sandbox/`)
```bash
npm run dev                    # Vite (5180) + Express API (5181) concurrently
npm run build                  # tsc && vite build
cd mta-subway && npm run dev   # MTA MCP server (port 3001)
cd citibike && npm run dev     # Citibike MCP server (port 3002)
cd crackstreams && uv run uvicorn main:app --host 0.0.0.0 --port 3003 --reload  # CrackStreams MCP server
```

### Vision Research Server (from `vision-research-server/`)
```bash
uv sync && uv run uvicorn server:app --host 0.0.0.0 --port 3004 --reload
```

### Vision Explorer 2 (from `vision-explorer2/`, standalone)
```bash
cd frontend && pnpm install && pnpm dev    # Port 5173
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000
# Note: backend port 8000 conflicts with Garvis — cannot run simultaneously
```

## Cross-Project Conventions

**Two-process architecture:** Most projects run a backend (Python FastAPI or Express) and a frontend (React/Next.js) separately. Frontend dev servers proxy API/WebSocket requests to the backend. `xr-mcp-app` proxies via Vite config: `/mcp` → MTA (3001), `/citibike-mcp` → Citibike (3002), `/crackstreams-mcp` → CrackStreams (3003), `/proxy` → CrackStreams HLS proxy (3003), `/ws/voice` + `/detect` → Garvis (8000).

**Port allocations:**
| Port | Service |
|------|---------|
| 3001 | MTA Subway MCP server |
| 3002 | Citibike MCP server |
| 3003 | CrackStreams MCP server |
| 3004 | Vision Research MCP server |
| 5173 | Garvis xr-client / vision-explorer2 frontend |
| 5174 | xr-mcp-app (HTTPS) |
| 5180 | mcp-app-sandbox frontend |
| 5181 | mcp-app-sandbox Express API |
| 8000 | Garvis server / vision-explorer2 backend (conflict — pick one) |

**Tool result display markers:** Garvis uses `[DISPLAY_STREAM:url]` and Manim MCP uses `[DISPLAY_VIDEO:path]` — string patterns in tool results that frontends detect and render as media.

**Streaming protocols:** Garvis uses WebSocket (binary PCM audio frames + JSON control messages). Manim MCP and MCP App Sandbox use SSE with shared event types (`text_delta`, `tool_use_start`, `tool_execution_complete`, `complete`, `error`).

**Python projects** use `uv` for dependency management (Python 3.11–3.13 for Garvis, 3.12+ for Manim MCP). **Node.js projects** use npm, except vision-explorer2 which uses pnpm.

## Testing & Linting

| Project | Tests | Lint/Format |
|---------|-------|-------------|
| garvis/server | `uv run pytest` | — |
| garvis/xr-client | — | `npm run lint` (ESLint) |
| manim-mcp/server | `uv run pytest` (or `uv run pytest -k test_name`) | `uv run ruff check .` + `uv run black .` |
| manim-mcp/web-client | — | `npm run lint` (ESLint) |
| vision-explorer2/frontend | `pnpm vitest run` | `pnpm lint` + `pnpm tsc --noEmit` |
| vision-explorer2/backend | `python -m pytest tests/ -x` | `ruff check .` |
| xr-mcp-app | — | `npx tsc -b` (type check only) |
| mcp-app-sandbox | — (none configured) | — (none configured) |
| vision-research-server | — | — |

## Environment Variables

Each project requires its own `.env` file (gitignored). Key vars:
- `ANTHROPIC_API_KEY` — Required by Garvis, Manim MCP, MCP App Sandbox, Vision Research, and Vision Explorer 2
- `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY` — Garvis only
- Auth0, AWS, S3 vars — Manim MCP only (see `manim-mcp/server/.env` and `manim-mcp/web-client/.env.local.example`)

## Known Gotchas

- **Python version constraints**: Garvis requires 3.11–3.13 (TensorFlow doesn't support 3.14). Vision-research-server supports 3.11–3.14. Manim MCP requires 3.12+. Use `uv python pin 3.13` if you hit TensorFlow errors.
- **Port 8000 conflict**: Garvis server and vision-explorer2 backend both default to port 8000 — cannot run simultaneously. `./run.sh` excludes vision-explorer2.
- **HTTPS required for getUserMedia**: WebXR mic/camera access requires HTTPS. localhost is exempt. xr-mcp-app Vite config handles HTTPS for dev.
- **Quest 3 ignores dom-overlay**: `dom-overlay` is a handheld AR feature. All XR UI must be Three.js 3D objects — no HTML overlays in immersive mode.
- **No React StrictMode**: Removed from xr-mcp-app because StrictMode double-fires effects, creating duplicate WebSocket connections.
- **YOLO model path** (vision-explorer2): ONNX model files must be in `public/models/`, not `src/` — Vite doesn't bundle them.
- **Vision LLM JSON parsing**: Claude Vision sometimes wraps JSON responses in markdown code fences — strip before parsing.
- **Deepgram STT normalization**: Server normalizes "Jarvis"/"Travis" → "Garvis" in transcriptions.
- **First detection request is slow**: YOLOv8 and DeepFace models download on first use.
- **vision-explorer2 uses pnpm** (not npm like other Node.js projects in this repo).
- **WebXR Raw Camera Access** (`camera-access` feature) is NOT yet available on Quest browser as of v85. The session rejects it with `Feature 'camera-access' is not supported for mode: immersive-ar`. The `useXRCamera` hook auto-falls back to getUserMedia. Code is ready for when Meta ships it.

## Remote Debugging Quest 3 Browser

Read JavaScript console logs from the Quest 3 browser directly via ADB + Chrome DevTools Protocol. Requires the Quest to be plugged in via USB.

### Setup
```bash
adb devices                                          # Verify Quest is connected
adb forward tcp:9222 localabstract:chrome_devtools_remote  # Forward DevTools port
curl -s http://localhost:9222/json | python3 -m json.tool   # List open tabs (find page ID)
```

### Read console logs (Node.js)
Requires `ws` package (`npm install ws` in /tmp or globally). Replace `PAGE_ID` with the `id` from the tab listing above.
```bash
NODE_PATH=/tmp/node_modules node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/PAGE_ID', { perMessageDeflate: false });
ws.on('open', () => {
  ws.send(JSON.stringify({id: 1, method: 'Runtime.enable'}));
  ws.send(JSON.stringify({id: 2, method: 'Log.enable'}));
  setTimeout(() => { ws.close(); process.exit(0); }, 10000);  // Collect for 10s
});
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = msg.params.args.map(a => a.value ?? a.description ?? String(a.type)).join(' ');
    console.log('[CONSOLE.' + msg.params.type + ']', args);
  } else if (msg.method === 'Log.entryAdded') {
    console.log('[LOG]', msg.params.entry.level, msg.params.entry.text);
  }
});
ws.on('error', (e) => console.error('WS error:', e.message));
"
```

### Execute JS on Quest browser remotely
```bash
# Evaluate any expression in the page context:
ws.send(JSON.stringify({ id: 99, method: 'Runtime.evaluate', params: { expression: 'document.title' } }));
```

### Key details
- `Runtime.enable` captures `console.log/warn/error` → `Runtime.consoleAPICalled` events
- `Log.enable` captures browser-level warnings (like unsupported WebXR features) → `Log.entryAdded` events
- Page IDs can change when the tab reloads — re-query `/json` if connection fails with 500
- Only captures logs emitted **after** connecting; historical logs are not available
