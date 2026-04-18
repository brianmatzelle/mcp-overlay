# Repository Guidelines

## Project Structure & Module Organization
- `server/`: FastAPI + FastMCP backend (Manim rendering, MCP tools).
- `web-client/`: Next.js 15 frontend (chat UI with MCP tool loop).
- `docs/`: Architecture and deployment notes.

## Build, Test, and Development Commands
- `./start-app.sh`: tmux session for server + web client.
- `cd server && uv sync`: Install server deps.
- `cd server && uv run uvicorn server:app --host 0.0.0.0 --port 8000 --reload`: Run backend.
- `cd server && uv run pytest`: Run server tests.
- `cd server && uv run ruff check . && uv run black .`: Lint/format.
- `cd web-client && npm install && npm run dev`: Run Next.js dev server (3000).
- `cd web-client && npm run lint`: Lint frontend.

## Coding Style & Naming Conventions
- Python 3.12+ with `ruff` and `black`.
- Tools live in `server/tools/` and should be registered in `server/tools/__init__.py`.
- Keep tool responses compatible with `[DISPLAY_VIDEO:{path}]` pattern.

## Testing Guidelines
- Use `pytest` for server logic and parser tests.
- Frontend uses ESLint; add tests only where they add value.

## Commit & Pull Request Guidelines
- Note any changes to MCP tool contracts, rendering pipeline, or media paths.
- Include a short sample output or screenshot for UI/animation changes.

## Configuration & Environment Notes
- Server uses `.env` for API keys and infra settings.
- Web client reads config from `web-client/config.json` and `.env.local`.
