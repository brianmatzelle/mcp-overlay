# Repository Guidelines

## Project Structure & Module Organization
This is a monorepo of WebXR + MCP experiments. Each subproject is self-contained with its own backend/frontend and local instructions.

- `xr-mcp-app/`: WebXR integration app (React + Three.js). Main integration target.
- `garvis/`: XR voice assistant with vision detection (FastAPI + React/Three).
- `mcp-app-sandbox/`: MCP app renderer + sample MCP servers (`mta-subway/`, `citibike/`, `crackstreams/`).
- `vision-research-server/`: MCP tool for researching visible objects.
- `vision-explorer2/`: Standalone vision app (pnpm frontend + FastAPI backend).
- `manim-mcp/`: Manim rendering + streaming tutor (FastAPI + Next.js).

## Build, Test, and Development Commands
Run from repo root unless noted.

- `./run.sh`: Starts core services (MTA, Citibike, CrackStreams, Vision Research, Garvis, XR app).
- `cd xr-mcp-app && npm run dev`: Vite dev server (HTTPS, port 5174).
- `cd garvis && ./run-all.sh`: Starts Garvis server (8000) and client (5173).
- `cd mcp-app-sandbox && npm run dev`: Vite (5180) + Express API (5181).
- `cd manim-mcp && ./start-app.sh`: tmux session for server + web client.

## Coding Style & Naming Conventions
- TypeScript/JavaScript: 2-space indentation; follow existing React/Three patterns in each app.
- Python: follow existing `ruff`/`black` usage where configured.
- Naming: use descriptive component names (`SubwayArrivals3D`, `CitiBikeStatus3D`) and keep file names aligned with exports.
- Formatting tools are per-project; do not assume a root-level formatter.

## Testing Guidelines
Testing is project-specific and unevenly configured.

- `manim-mcp/server`: `uv run pytest`
- `garvis/server`: `uv run pytest`
- `vision-explorer2/frontend`: `pnpm vitest run`
- `vision-explorer2/backend`: `python -m pytest tests/ -x`
- Type checks: `cd xr-mcp-app && npx tsc -b`

If you add tests, mirror existing naming in the target project (e.g., `test_*.py` for Python).

## Commit & Pull Request Guidelines
Git history uses short, descriptive, non-conventional messages (e.g., “stable”, “added research tool…”). Keep messages brief and specific to the change.

For PRs:
- Describe what changed and why, and list any services touched.
- Note required services/ports and any new env vars.
- Include screenshots or short clips for XR/UI changes.

## Configuration & Environment Notes
Each subproject expects its own `.env` file. Common keys include `ANTHROPIC_API_KEY`, and Garvis also needs `DEEPGRAM_API_KEY` and `ELEVENLABS_API_KEY`.

Port collisions exist (notably 8000 for Garvis and vision-explorer2 backend). Avoid running those simultaneously.
