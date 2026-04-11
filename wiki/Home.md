# MCP Overlay Wiki

**MCP Overlay** is a WebXR platform where an AI assistant named **Garvis** overlays the user's real-world vision with interactive MCP App UIs that annotate objects in real time — all running on Meta Quest 3.

**The vision:** You walk into a grocery store, look at different brands of chicken, and Garvis detects them via computer vision, researches them via MCP tools (web search, nutrition APIs), and renders floating UI panels anchored to each product in AR space — triggered by voice or gaze.

---

## Wiki Pages

### Core Concepts
- **[Architecture Overview](Architecture-Overview.md)** — How the six subprojects fit together, system diagrams, data flow
- **[Getting Started](Getting-Started.md)** — Prerequisites, setup, running all services

### Subprojects
- **[Garvis](Garvis.md)** — XR voice assistant: real-time STT/TTS, object detection, MCP bridge (the brain)
- **[XR MCP App](XR-MCP-App.md)** — The unified AR app: 3D panels, voice-triggered MCP, gaze anchoring (the eyes)
- **[MCP App Sandbox](MCP-App-Sandbox.md)** — Browser-based MCP interaction tool + hosted MCP servers (the workbench)
- **[Vision Servers](Vision-Servers.md)** — Vision Research Server + Vision Explorer 2: YOLO detection + Claude enrichment
- **[Manim MCP](Manim-MCP.md)** — AI math tutoring: Manim animations rendered from MCP tool calls

### Deep Dives
- **[Voice Pipeline](Voice-Pipeline.md)** — End-to-end: microphone → Deepgram STT → Claude LLM → ElevenLabs TTS → speaker
- **[MCP Integration Patterns](MCP-Integration-Patterns.md)** — Protocol usage across the repo: Python, JS, browser clients, bridge
- **[WebXR Rendering](WebXR-Rendering.md)** — 3D UI system: draggable windows, gaze anchoring, Quest 3 constraints

---

## Subproject Map

| Subproject | Role | Tech | Port(s) |
|---|---|---|---|
| **garvis/** | Voice + detection server, XR client | Python FastAPI, React + Three.js | 8000, 5173 |
| **xr-mcp-app/** | Unified AR experience | React + Three.js + WebXR | 5174 |
| **mcp-app-sandbox/** | MCP interaction tool + hosted servers | React + Express | 5180, 5181 |
| **mta-subway/** | NYC subway arrivals MCP server | TypeScript + MCP SDK | 3001 |
| **citibike/** | Citi Bike availability MCP server | TypeScript + MCP SDK | 3002 |
| **crackstreams/** | Live sports streaming MCP server | Python FastMCP | 3003 |
| **vision-research-server/** | Object detection + enrichment MCP tool | Python FastMCP + YOLOv8 | 3004 |
| **vision-explorer2/** | Standalone client-side YOLO app | React + ONNX Runtime | 5173, 8000 |
| **manim-mcp/** | Math tutoring with Manim animations | Next.js + Python FastMCP | 3000, 8000 |

---

## Quick Start

```bash
# Clone and start everything
git clone git@github.com:brianmatzelle/mcp-overlay.git
cd mcp-overlay
./run.sh    # Starts all 6 services, Ctrl+C stops all
```

See [Getting Started](Getting-Started.md) for full setup instructions.

---

## Key Technologies

- **WebXR** — Immersive AR on Meta Quest 3 via `@react-three/xr`
- **MCP (Model Context Protocol)** — Standardized tool calling between AI and services
- **React Three Fiber** — React renderer for Three.js 3D graphics
- **Claude** — Anthropic's LLM for reasoning, tool calling, and vision
- **Deepgram** — Real-time speech-to-text with voice activity detection
- **ElevenLabs** — Low-latency text-to-speech streaming
- **YOLOv8** — Real-time object detection (server-side and client-side ONNX)
- **FastMCP / MCP SDK** — MCP server implementations in Python and TypeScript
