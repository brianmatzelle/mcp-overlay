# Getting Started

## Prerequisites

### Required
- **Node.js** (v18+) and **npm**
- **Python 3.11–3.13** (TensorFlow doesn't support 3.14)
- **uv** — Python package manager ([install](https://docs.astral.sh/uv/getting-started/installation/))

### API Keys
Each subproject needs its own `.env` file (gitignored). You'll need:

| Key | Used By | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Garvis, Vision Research, MCP App Sandbox, Manim MCP | Claude LLM + Vision |
| `DEEPGRAM_API_KEY` | Garvis | Real-time speech-to-text |
| `ELEVENLABS_API_KEY` | Garvis | Text-to-speech |

### Hardware (for full XR experience)
- **Meta Quest 3** with developer mode enabled
- USB cable for ADB debugging (optional but very helpful)

## Quick Start — All Services

From the repo root:

```bash
./run.sh
```

This starts six services in order:
1. MTA Subway MCP server → `localhost:3001`
2. Citibike MCP server → `localhost:3002`
3. CrackStreams MCP server → `localhost:3003`
4. Vision Research MCP server → `localhost:3004`
5. Garvis voice server → `localhost:8000`
6. XR MCP App → `https://localhost:5174`

Press `Ctrl+C` to stop all services.

## Running Services Individually

### Garvis (Voice + Detection Server)

```bash
cd garvis/server
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Garvis XR client (standalone, without xr-mcp-app):
```bash
cd garvis/xr-client
npm install
npm run dev    # → https://localhost:5173
```

### XR MCP App (Unified AR Frontend)

```bash
cd xr-mcp-app
npm install
npm run dev    # → https://localhost:5174
```

Requires: Garvis on 8000, MTA on 3001, Citibike on 3002.

### MCP Servers

```bash
# MTA Subway
cd mcp-app-sandbox/mta-subway && npm install && npm run dev    # → :3001

# Citibike
cd mcp-app-sandbox/citibike && npm install && npm run dev      # → :3002

# CrackStreams
cd mcp-app-sandbox/crackstreams
uv sync && uv run uvicorn main:app --host 0.0.0.0 --port 3003 --reload

# Vision Research
cd vision-research-server
uv sync && uv run uvicorn server:app --host 0.0.0.0 --port 3004 --reload
```

### MCP App Sandbox (Browser Tool)

```bash
cd mcp-app-sandbox
npm install
npm run dev    # → Vite on :5180, Express API on :5181
```

### Manim MCP (Math Tutoring)

```bash
cd manim-mcp
./start-app.sh    # tmux session with server + web client
# Or manually:
cd server && uv sync && uv run uvicorn server:app --host 0.0.0.0 --port 8000 --reload
cd web-client && npm install && npm run dev    # → :3000
```

### Vision Explorer 2 (Standalone)

```bash
cd vision-explorer2/frontend && pnpm install && pnpm dev      # → :5173
cd vision-explorer2/backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000
```

**Note:** Vision Explorer 2 uses port 8000 for its backend, which conflicts with Garvis. Don't run both.

## Testing & Linting

| Project | Tests | Lint |
|---|---|---|
| garvis/server | `uv run pytest` | — |
| garvis/xr-client | — | `npm run lint` |
| manim-mcp/server | `uv run pytest` | `uv run ruff check . && uv run black .` |
| vision-explorer2/frontend | `pnpm vitest run` | `pnpm lint && pnpm tsc --noEmit` |
| xr-mcp-app | — | `npx tsc -b` (type check) |

## Accessing on Quest 3

1. Connect Quest 3 to the same WiFi network as your dev machine
2. Find your machine's local IP (e.g., `192.168.1.100`)
3. In Quest browser, navigate to `https://192.168.1.100:5174`
4. Accept the self-signed certificate warning
5. Tap "Enter AR" to start the immersive experience

### Remote Debugging

```bash
# Connect Quest via USB
adb devices
adb forward tcp:9222 localabstract:chrome_devtools_remote

# List open tabs
curl -s http://localhost:9222/json | python3 -m json.tool

# Read console logs (requires `npm install ws` in /tmp)
# See CLAUDE.md "Remote Debugging Quest 3 Browser" section for full script
```

## Known Gotchas

- **Python 3.14**: Garvis requires 3.11–3.13 (TensorFlow). Use `uv python pin 3.13` if needed
- **HTTPS required**: WebXR mic/camera needs HTTPS. The Vite dev server handles this automatically
- **Quest 3 ignores dom-overlay**: All XR UI must be Three.js 3D objects — no HTML in immersive mode
- **First detection is slow**: YOLO and DeepFace models download on first use
- **YOLO model path** (Vision Explorer 2): ONNX files must be in `public/models/`, not `src/`
- **vision-explorer2 uses pnpm**, not npm like other Node projects
- **WebXR Raw Camera Access**: Not yet available on Quest browser as of v85. Falls back to getUserMedia

---

**Next:** [Architecture Overview](Architecture-Overview.md) | [Garvis](Garvis.md)
