# Repository Guidelines

## Project Structure & Module Organization
- `server/`: FastAPI + FastMCP backend (voice pipeline, MCP tools, detection).
- `xr-client/`: React + Three.js WebXR client.
- `run-all.sh`: Convenience script to start both services.

## Build, Test, and Development Commands
- `./run-all.sh`: Start server (8000) and client (5173).
- `cd server && uv sync`: Install server deps.
- `cd server && uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload`: Run API + WebSocket.
- `cd server && uv run pytest`: Run server tests.
- `cd xr-client && npm install && npm run dev`: Run XR client.
- `cd xr-client && npm run lint`: Lint client.

## Coding Style & Naming Conventions
- Python: PEP8, type hints, docstrings for public APIs, async for I/O.
- TypeScript: strict mode, functional components with hooks, explicit types over `any`.
- Keep filenames aligned with exported component/class names.

## Testing Guidelines
- Server uses `pytest`. Name tests `test_*.py`.
- Client has linting only; add tests where it adds value.

## Commit & Pull Request Guidelines
- Keep commits focused and short.
- PRs should include: summary, why, ports/services touched, and logs/screenshots for XR/vision changes.

## Configuration & Environment Notes
- Configure `server/.env` from `server/env.example`.
- Required keys: `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`.
