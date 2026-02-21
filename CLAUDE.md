# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision

**mcp-overlay** is building a WebXR application where an AI assistant (Garvis) overlays the user's real-world vision with MCP App UIs that annotate objects in real time.

**Concrete example:** In a grocery store, look at different brands of chicken. Garvis detects them via computer vision, researches them via MCP tools (web search, nutrition APIs), and renders floating MCP App UI panels anchored to each product in AR space — all triggered by voice or gaze.

The subprojects below are building blocks toward this unified goal, each contributing essential capabilities that will be composed together. **`xr-mcp-app/`** is the integration point where these capabilities converge.

## Repository Overview

Monorepo containing four subprojects, each with its own CLAUDE.md for project-specific details:

- **`xr-mcp-app/`** — **[XR + MCP Integration]** The unified app. Renders MCP tool results as native 3D overlays in WebXR (Quest 3 AR). Browser mode shows HTML MCP App UIs via AppRenderer; XR mode renders the same data as Three.js 3D text panels that follow the camera. React + Three.js + @react-three/xr frontend, connects to MCP servers via lightweight browser client.
- **`garvis/`** — **[XR + Voice + Detection]** XR voice assistant for Meta Quest 3 / WebXR. Real-time bidirectional audio (Deepgram STT → Claude LLM → Eleven Labs TTS) over WebSocket, with YOLOv8 object detection and DeepFace face detection rendered as AR overlays. Python FastAPI + FastMCP backend, React + Three.js + WebXR frontend.
- **`mcp-app-sandbox/`** — **[MCP App UI Rendering]** Browser-based MCP server interaction tool. Connect to any MCP server, execute tools, view MCP App UIs in sandboxed iframes, chat with Claude-powered agent. React + Vite frontend, Express backend.
- **`manim-mcp/`** — **[Tool Patterns + Streaming]** AI math tutoring platform. Renders Manim animations from math expressions via MCP tools, streams Claude responses via SSE. Python FastAPI + FastMCP backend, Next.js 15 frontend, AWS infrastructure.

## XR MCP App Architecture — `xr-mcp-app/`

The integration app that composes capabilities from the other subprojects. Dual-mode rendering: browser (DOM) and XR (3D).

### Dual-Mode Architecture
```
App.tsx (useMCPData for browser + useVoiceAssistant for XR)
├── Browser mode: <MCPAppPanel />     (DOM — AppRenderer + iframe, auto-loads)
└── Canvas > XR
      └── <XRScene />                 (3D — only renders in AR session)
            ├── <ChatWindow3D />        (conversation transcript, left side)
            ├── <VoiceIndicator3D />    (status sphere, bottom of FOV)
            └── <XRWindow> + <SubwayArrivals3D />  (voice-triggered or auto-loaded, right side)
```

Browser mode uses `useMCPData()` to auto-load subway data via direct MCP client. XR mode uses `useVoiceAssistant()` to connect to Garvis — user speaks, Claude calls MCP tools via the server-side bridge, and results render as 3D panels. Voice-triggered results take priority over auto-loaded data.

### Voice-Triggered MCP Flow (XR Mode)
```
User speaks → Mic (16kHz PCM) → WebSocket → Garvis server (port 8000)
→ Deepgram STT → Claude LLM (with MCP tools from bridge)
→ Claude calls subway-arrivals → MCP Bridge → HTTP to MTA server (port 3001)
→ Tool result sent to client: {"type": "mcp_tool_result", "tool_name": "...", "content": [...]}
→ Claude generates spoken response → ElevenLabs TTS → MP3 audio to client
→ Client renders: SubwayArrivals3D + ChatWindow3D + audio playback
```

### Key Files
- `xr-mcp-app/src/App.tsx` — Top-level: XR store, useMCPData (browser), useVoiceAssistant (XR), dual-panel layout
- `xr-mcp-app/src/hooks/useMCPData.ts` — Browser hook: MCP client connect, callTool, returns toolResult + toolResultContent (JSON) + appHtml
- `xr-mcp-app/src/hooks/useVoiceAssistant.ts` — XR hook: bridges GarvisClient events → React state (messages, mcpToolResult, voice status)
- `xr-mcp-app/src/voice/garvis-client.ts` — WebSocket voice client: mic capture, PCM streaming, TTS playback, MCP tool result handling
- `xr-mcp-app/src/components/XRWindow.tsx` — Camera-following 3D window (visor mode). useFrame lerp/slerp positioning
- `xr-mcp-app/src/components/SubwayArrivals3D.tsx` — Parses subway JSON → 3D text: station name, colored line circle, direction arrows, arrival times
- `xr-mcp-app/src/components/ChatWindow3D.tsx` — 3D chat transcript with status bar, color-coded user/assistant messages
- `xr-mcp-app/src/components/VoiceIndicator3D.tsx` — Floating status sphere (green/yellow/blue/gray/red) with pulse animation
- `xr-mcp-app/src/MCPAppPanel.tsx` — Browser-mode wrapper: useMCPData props → AppRenderer
- `xr-mcp-app/src/design-system.ts` — Garvis design tokens subset (colors, spacing, typography, radii, opacity, animation, zLayers) + createRoundedRectGeometry
- `xr-mcp-app/src/mcp.ts` — Lightweight fetch-based MCP client (JSON-RPC 2.0, session management)

### Design Decisions
- **No XRDomOverlay**: Quest 3 silently ignores `dom-overlay` (it's a handheld AR feature). All XR UI must be Three.js 3D objects.
- **Camera-follow visor mode**: XRWindow positions content at fixed distance from camera using `useFrame()` + `lerp`/`slerp` smoothing (from Garvis `Window.tsx:374-432`).
- **Data-driven 3D rendering**: Instead of embedding HTML iframes in XR, we parse the MCP tool result `content[0].text` JSON and render it as `<Text>` and `<mesh>` primitives. This is pure WebGL and works reliably on Quest 3.
- **Design tokens from Garvis**: `design-system.ts` inlines a minimal subset of `garvis/xr-client/src/design-system/tokens.ts` and `primitives.ts` to avoid cross-project imports.
- **No React StrictMode**: Removed from `main.tsx` because StrictMode double-fires effects, which creates duplicate WebSocket connections to the voice server.
- **Connection deduplication**: `useVoiceAssistant` uses a `connectingRef` guard to prevent duplicate WebSocket connections during async connect handshake. Server-side `_processing` flag in `VoicePipeline` prevents overlapping speech-end handling.

## Building Blocks for Unified Vision

How each subproject contributes to the goal of AR-overlaid MCP App UIs:

### WebXR Rendering Pipeline — from `garvis/`
AR passthrough with React Three Fiber + `@react-three/xr`. `createXRStore()` configures the XR session. Camera-relative overlay positioning at configurable distance/offset. `pixelToPlane()` maps 2D detection coordinates to 3D-space planes with labels.
- `garvis/xr-client/src/App.tsx` — XR store creation, scene graph root
- `garvis/xr-client/src/components/XRCameraFeed.tsx` — Camera feed, bounding box overlays, pixelToPlane coordinate math

### Object Detection — from `garvis/`
Client captures frames at configurable FPS, sends base64 JPEG to server. YOLOv8 detects 80 COCO classes; DeepFace detects faces. Results rendered as 3D bounding boxes with labels and confidence scores.
- `garvis/server/tools/vision/detect.py` — YOLOv8 object detection endpoint
- `garvis/server/tools/vision/face_detect.py` — DeepFace face detection endpoint
- `garvis/xr-client/src/hooks/useDetection.ts` — Client-side detection loop and state
- `garvis/xr-client/src/hooks/useFaceDetection.ts` — Client-side face detection loop

### Voice Pipeline — from `garvis/`
Real-time STT → LLM → TTS loop over WebSocket. Deepgram STT with VAD for speech-end detection, Claude LLM with tool calling, Eleven Labs TTS streaming MP3. Binary frames for audio, JSON frames for control.
- `garvis/server/voice/pipeline.py` — Core pipeline orchestration. MCP tool routing via bridge, sends `mcp_tool_result` WebSocket messages for renderable tools. `_processing` guard prevents duplicate speech-end handling.
- `garvis/xr-client/src/voice/garvis-client.ts` — WebSocket client, mic capture, TTS playback

### MCP Bridge — from `garvis/`
Server-side MCP client that connects to external MCP servers at startup, discovers their tools, and makes them available to Claude alongside native Garvis tools. When Claude calls an MCP tool, the bridge routes execution to the correct server via HTTP JSON-RPC 2.0.
- `garvis/server/tools/mcp_client.py` — Python MCP client (httpx, JSON-RPC 2.0, session management)
- `garvis/server/tools/mcp_bridge.py` — MCPBridge class: server registry, tool discovery, execution routing. Module-level singleton with `initialize_bridge()`/`shutdown_bridge()`
- `garvis/server/tools/mcp_tools.py` — `get_claude_tools()` merges native FastMCP tools + MCP bridge tools
- `garvis/server/config.py` — `MCP_SERVERS` list (defaults to MTA on `localhost:3001/mcp`), `CLAUDE_SYSTEM_PROMPT` references MCP tools
- `garvis/server/main.py` — Bridge init in lifespan (after providers, before yield), shutdown on exit

### MCP App UI Rendering — from `mcp-app-sandbox/`
`AppRenderer` component from `@mcp-ui/client` renders HTML apps in double-iframe sandbox. Apps can call tools and read resources back through the host via postMessage relay. `registerAppTool()` pattern returns `structuredContent.resource.uri` pointing to bundled HTML.
- `mcp-app-sandbox/src/App.tsx` — AppRenderer integration, tool execution flow
- `mcp-app-sandbox/public/sandbox_proxy.html` — Sandbox iframe proxy protocol
- `mcp-app-sandbox/mta-subway/server.ts` — registerAppTool + registerAppResource pattern
- `mcp-app-sandbox/mta-subway/src/mcp-app.ts` — MCP App lifecycle (ontoolresult, callServerTool)

### Lightweight MCP Client (Browser) — from `mcp-app-sandbox/`
Browser-side JSON-RPC 2.0 over fetch with session management via `mcp-session-id` header. No SDK dependency in browser, keeping bundle small.
- `mcp-app-sandbox/src/mcp.ts` — Full client implementation

### Agentic Tool Loop — from `mcp-app-sandbox/` + `manim-mcp/`
Backend agent loop: Claude API + MCP tool execution with SSE streaming. Detects `structuredContent.resource.uri` to fetch HTML for MCP App rendering.
- `mcp-app-sandbox/server/api.ts` — Express agentic loop (up to 10 turns)
- `manim-mcp/web-client/src/app/api/chat/route.ts` — Next.js SSE streaming chat route (up to 100 iterations)

### Tool Registry Pattern — from `manim-mcp/`
`BaseVisualizationTool`/`BaseUtilityTool` with `ToolMetadata` (name, description, category, use_cases, examples, related_tools). Singleton registry with `register_all_with_mcp()` for bulk registration.
- `manim-mcp/server/tools/base.py` — Base tool classes and metadata schema
- `manim-mcp/server/tools/__init__.py` — Registry and registration

### Client ECS State — from `garvis/`
Koota entity-component-system for global client state. Traits: ChatHistory, VoiceState, ActiveVideo, VisorConfig. Extensible for adding new state like detected objects and active annotation overlays.
- `garvis/xr-client/src/ecs/traits.ts` — Trait definitions
- `garvis/xr-client/src/ecs/actions.ts` — State mutation actions

### MCP Server Integration Patterns
Python backends use FastMCP (`@mcp.tool()` decorator). In manim-mcp, `mcp.http_app(path="/math")` is mounted on FastAPI at `/mcp`. JS/TS clients use `@modelcontextprotocol/sdk` with `StreamableHTTPClientTransport`. Garvis server acts as both an MCP server (native tools) and MCP client (bridge to external servers like MTA).
- `garvis/server/tools/mcp_tools.py` — FastMCP tool definitions (SEARCH_CONTENT, SHOW_CONTENT) + bridge tool merging
- `garvis/server/tools/mcp_bridge.py` — Python MCP client bridge (connects to external MCP servers at startup)
- `manim-mcp/server/server.py` — FastMCP + FastAPI mount pattern
- `manim-mcp/web-client/src/lib/mcp-client.ts` — MCPHTTPClient wrapper

## Quick Start Commands

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
# Requires: MTA MCP server on port 3001, Garvis server on port 8000 (for voice)
```

### MCP App Sandbox (from `mcp-app-sandbox/`)
```bash
npm run dev                    # Vite (5180) + Express API (5181) concurrently
npm run build                  # tsc && vite build
cd mta-subway && npm run dev   # Example MCP server (port 3001)
```

## Cross-Project Conventions

**Two-process architecture:** Most projects run a backend (Python FastAPI or Express) and a frontend (React/Next.js) separately. Frontend dev servers proxy API/WebSocket requests to the backend. `xr-mcp-app` proxies `/mcp` → MTA server (port 3001) and `/ws/voice` → Garvis server (port 8000) via Vite config.

**Tool result display markers:** Garvis uses `[DISPLAY_STREAM:url]` and Manim MCP uses `[DISPLAY_VIDEO:path]` — string patterns in tool results that frontends detect and render as media.

**Streaming protocols:** Garvis uses WebSocket (binary PCM audio frames + JSON control messages). Manim MCP and MCP App Sandbox use SSE with shared event types (`text_delta`, `tool_use_start`, `tool_execution_complete`, `complete`, `error`).

**Python projects** use `uv` for dependency management (Python 3.11–3.13 for Garvis, 3.12+ for Manim MCP). **Node.js projects** use npm.

## Environment Variables

Each project requires its own `.env` file (gitignored). Key vars:
- `ANTHROPIC_API_KEY` — Required by all three projects
- `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY` — Garvis only
- Auth0, AWS, S3 vars — Manim MCP only (see `manim-mcp/server/.env` and `manim-mcp/web-client/.env.local.example`)
