# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Garvis is an immersive AI voice assistant for Meta Quest 3 / WebXR. It uses real-time bidirectional audio streaming via WebSocket, connecting Deepgram (STT) → Claude (LLM with tool calling) → Eleven Labs (TTS). Additional features include live sports streaming with HLS proxy, face detection via DeepFace+RetinaFace, and object detection via YOLOv8.

## Commands

### Server (Python, in `server/`)
```bash
uv sync                                                        # Install dependencies
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload   # Run dev server
uv run pytest                                                  # Run tests
```

### Client (TypeScript, in `xr-client/`)
```bash
npm install        # Install dependencies
npm run dev        # Dev server at https://localhost:5173
npm run build      # tsc -b && vite build
npm run lint       # ESLint
```

### Both
```bash
./run-all.sh       # Starts server (port 8000) + client (port 5173)
```

### Environment Setup
```bash
cp server/env.example server/.env   # Then add API keys (Anthropic, Deepgram, Eleven Labs)
```

## Architecture

### Two-process system
- **`server/`** — Python FastAPI + FastMCP backend (port 8000)
- **`xr-client/`** — React + Three.js + WebXR frontend (port 5173, Vite)

The client's Vite config proxies `/ws/voice`, `/health`, `/mcp`, `/detect-faces`, and `/detect` to the server, avoiding CORS/mixed-content issues.

### Voice Pipeline (`server/voice/`)
The core real-time conversation loop lives in `VoicePipeline` (`pipeline.py`):
1. Client sends PCM 16-bit 16kHz audio over WebSocket binary frames
2. `DeepgramSTT` streams audio for transcription with VAD-based speech-end detection
3. On speech end, transcript goes to `ClaudeLLM` (with conversation history + MCP tools)
4. Claude may call tools (`SEARCH_CONTENT`, `SHOW_CONTENT`) — results can contain `[DISPLAY_STREAM:url]` markers
5. Response text streams to `ElevenLabsTTS`, which sends MP3 chunks back over WebSocket
6. Stream URLs are extracted from tool results and sent as JSON `stream_url` messages

WebSocket protocol: binary frames = audio; JSON frames = control messages (`start/stop/interrupt/config`), transcripts, status updates, stream URLs, errors.

### MCP Tools (`server/tools/`)
Tools are registered with FastMCP and exposed at `/mcp`. `SEARCH_CONTENT` searches content providers, `SHOW_CONTENT` resolves a stream URL. The tool system is extensible via `providers/` (abstract `ContentProvider` base class with `search()` and `get_stream_info()`).

### Client State (`xr-client/src/ecs/`)
Uses **Koota** entity-component-system for global state: `ChatHistory`, `VoiceState`, `ActiveVideo`, `VisorConfig` traits. The `useVoiceAssistant` hook bridges the WebSocket client (`garvis-client.ts`) to ECS state mutations.

### XR Rendering
React Three Fiber + `@react-three/xr` for WebXR. Key UI surfaces: `ChatWindow` (HUD overlay), `VideoWindow` (3D video panel with HLS.js). Camera-based detection (`useXRCamera`, `useFaceDetection`) sends frames to server endpoints and renders bounding box overlays.

## Code Conventions

- **Python**: PEP 8, type hints, async/await for all I/O, docstrings on public functions
- **TypeScript**: Strict mode, functional components with hooks, explicit types
- **Voice pipeline components** follow a pattern: `__init__(on_output callback)`, `connect()`, `disconnect()`, `process(data)` (see `CONTRIBUTING.md`)
- **MCP tools** are async, return dicts with `status`/`data` fields, registered via `@mcp.tool()` decorator
- Python requires 3.11–3.13 (TensorFlow constraint)

## Key Configuration

- `server/config.py` — All env vars, CORS origins, Claude system prompt (Garvis personality)
- `xr-client/vite.config.ts` — HTTPS via basicSsl, all proxy routes to server
- STT normalizes "Jarvis"/"Travis" → "Garvis" in `pipeline.py`
