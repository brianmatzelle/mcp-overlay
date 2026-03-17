# MCP Overlay

A WebXR application where an AI assistant (**Garvis**) overlays your real-world vision with floating UI panels powered by MCP (Model Context Protocol) tools — all in augmented reality on the Meta Quest 3.

## What It Does

Look at something in the real world. Ask Garvis about it. Get instant, spatially-anchored AR overlays with rich information.

**Example:** In a grocery store, look at different brands of chicken. Garvis detects them via computer vision, researches them via MCP tools (web search, nutrition APIs), and renders floating UI panels anchored to each product in AR space — triggered by voice or gaze.

### Key Capabilities

- **Voice-first interaction** — Speak naturally to trigger actions. Real-time STT (Deepgram) → LLM (Claude) → TTS (ElevenLabs) over WebSocket.
- **Gaze-anchored overlays** — Vision research results appear at the exact 3D point you were looking at when you started speaking, not as a static HUD.
- **MCP tool ecosystem** — Extensible via any MCP server. Ship with subway arrivals, Citi Bike status, live sports streams, and vision research tools.
- **Draggable 3D windows** — Every panel is a native Three.js window you can grab, reposition, and resize in 3D space. Positions persist across sessions.
- **Pure WebGL rendering** — No DOM overlays (Quest 3 doesn't support them). All UI is rendered as Three.js geometry and text.

## Architecture

```
User speaks → Mic (16kHz PCM) → WebSocket → Garvis server
  → Deepgram STT → Claude LLM (with MCP tools)
  → Claude calls MCP tool → MCP Bridge → external MCP servers
  → Tool result → client renders 3D panel in AR
  → Claude generates spoken response → ElevenLabs TTS → audio playback
```

```
XR Scene
├── ChatWindow3D          (conversation transcript, draggable)
├── VoiceIndicator3D      (status sphere: listening/thinking/speaking)
├── SubwayArrivals3D      (MCP tool result, voice-triggered)
├── CitiBikeStatus3D      (MCP tool result, voice-triggered)
└── ObjectAnnotations3D   (gaze-anchored vision research results)
```

## Subprojects

| Directory | Purpose | Stack | Port |
|-----------|---------|-------|------|
| `xr-mcp-app/` | Unified XR app — renders MCP results as 3D overlays | React + Three.js + @react-three/xr | 5174 |
| `garvis/` | Voice assistant server + XR client | Python FastAPI + FastMCP, React | 8000 |
| `mcp-app-sandbox/` | Browser-based MCP interaction tool + hosted MCP servers | React + Vite, Express | 5180/5181 |
| `vision-research-server/` | `research-visible-objects` MCP tool (YOLO + Claude Vision) | Python FastAPI + FastMCP | 3004 |
| `vision-explorer2/` | Standalone real-time object detection app | React + ONNX Runtime, FastAPI | 5173 |
| `manim-mcp/` | AI math tutoring with Manim animation rendering | Next.js 15, Python FastAPI | 3000 |

### MCP Servers

| Server | Port | Tools |
|--------|------|-------|
| MTA Subway | 3001 | Subway arrival times |
| Citi Bike | 3002 | Station status, bike availability |
| CrackStreams | 3003 | Live sports stream search + playback |
| Vision Research | 3004 | Object detection + Claude Vision enrichment |

## Quick Start

### Prerequisites

- Node.js 18+ (managed via nvm)
- Python 3.11–3.13 (managed via uv)
- API keys in `.env` files: `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`

### Run Everything

```bash
./run.sh    # Starts all 6 services, Ctrl+C stops all
```

This launches MTA (3001), Citibike (3002), CrackStreams (3003), Vision Research (3004), Garvis (8000), and the XR app (5174).

### Run Individual Services

```bash
# XR app only (needs MCP servers + Garvis running)
cd xr-mcp-app && npm run dev

# Garvis server + client
cd garvis && ./run-all.sh

# Vision research server
cd vision-research-server && uv run uvicorn server:app --host 0.0.0.0 --port 3004 --reload
```

### Accessing the XR App

1. Open `https://localhost:5174` on the Quest 3 browser
2. Tap **Enter AR** to start the immersive session
3. Speak to Garvis to trigger MCP tools

> HTTPS is required for microphone and WebXR camera access. The Vite dev server handles this automatically.

## Tech Stack

**Frontend:** React 19, Three.js, @react-three/fiber, @react-three/xr, TypeScript, Vite

**Backend:** Python FastAPI, FastMCP, Uvicorn

**AI/ML:** Claude (LLM + Vision), Deepgram (STT), ElevenLabs (TTS), YOLOv8 (object detection)

**Protocols:** MCP (JSON-RPC 2.0 over HTTP), WebSocket (voice pipeline), SSE (streaming responses)

## Development

### Type Checking

```bash
cd xr-mcp-app && npx tsc -b
```

### Linting

```bash
cd garvis/xr-client && npm run lint
cd manim-mcp/server && uv run ruff check . && uv run black .
```

### Tests

```bash
cd garvis/server && uv run pytest
cd manim-mcp/server && uv run pytest
```

## Known Gotchas

- **Quest 3 ignores `dom-overlay`** — All XR UI must be Three.js 3D objects, not HTML.
- **Port 8000 conflict** — Garvis and vision-explorer2 both default to 8000. Pick one.
- **Python version** — Garvis requires 3.11–3.13 (TensorFlow constraint). Use `uv python pin 3.13` if needed.
- **WebXR Raw Camera Access** — Not yet available on Quest browser (as of v85). Falls back to getUserMedia.
- **First detection is slow** — YOLOv8 and DeepFace models download on first use.

## Remote Debugging (Quest 3)

```bash
adb devices                                                          # Verify Quest connected
adb forward tcp:9222 localabstract:chrome_devtools_remote             # Forward DevTools
curl -s http://localhost:9222/json | python3 -m json.tool             # List tabs
```

Then connect via Chrome DevTools Protocol to read console logs. See [CLAUDE.md](CLAUDE.md#remote-debugging-quest-3-browser) for the full Node.js script.
