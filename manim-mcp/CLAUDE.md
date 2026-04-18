# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Manim MCP is an AI-powered math tutoring platform that renders mathematical visualizations using Manim (the math animation library) via the Model Context Protocol (MCP). It consists of a FastAPI/FastMCP backend server and a Next.js frontend.

## Development Commands

### Running the full stack
```bash
./start-app.sh    # Launches tmux session "manim-mcp" with server (top) and web client (bottom)
```

### Server (Python/FastAPI)
```bash
cd server
uv sync                    # Install dependencies
uv sync --group dev        # Install with dev dependencies (pytest, ruff, black)
uv run uvicorn server:app --host 0.0.0.0 --port 8000 --reload  # Run dev server
uv run pytest              # Run all tests (no tests exist yet; deps are configured)
uv run pytest tests/test_parser.py          # Run a single test file
uv run pytest -k test_function_name         # Run a single test by name
uv run ruff check .        # Lint
uv run black .             # Format
```

### Web Client (Next.js)
```bash
cd web-client
npm install                # Install dependencies
npm run dev                # Dev server (port 3000, uses Turbopack)
npm run build              # Production build
npm run lint               # ESLint
```

### Docker (server only)
```bash
cd server
docker build -t manim-mcp-server .    # ~7.2GB image (includes LaTeX, ffmpeg, Cairo)
docker run -p 8000:8000 manim-mcp-server
```

## Architecture

### Two-Service Architecture
- **`server/`** — Python FastAPI app exposing MCP tools. Uses FastMCP to register tools that parse math expressions, generate Manim code, render videos, and upload to S3.
- **`web-client/`** — Next.js 15 app (React 19) deployed on Vercel. Chat interface that streams Claude API responses with MCP tool access.

### MCP Endpoint Setup
In `server/server.py`, FastMCP creates an HTTP app at path `/math`, which is then mounted on FastAPI at `/mcp`. The combined MCP endpoint is **`/mcp/math`**. Tools are registered at startup via `register_all_tools(mcp)` from `tools/__init__.py`.

### Server Request Flow (math expression → video)
1. **Parse** (`core/expression_parser.py`) — SymPy `parse_expr()` converts user input to AST. Whitelist of allowed functions/variables, complexity limit of 1000 atoms.
2. **Generate** (`core/code_generation.py`) — Jinja2 templates convert AST to Manim Python code.
3. **Render** (`core/renderer.py`) — Subprocess execution of `manim` CLI with 120s timeout. Outputs to `server/media/`.
4. **Store** (`core/s3_storage.py`) — Upload to S3, return CloudFront URL.

### Server Tool System
Tools live in `server/tools/` and inherit from `BaseVisualizationTool` or `BaseUtilityTool` (defined in `tools/base.py`). A `registry` singleton manages discovery and registration.

**Adding a new tool:**
1. Create a class in the appropriate directory (`tools/algebra/` for 2D, `tools/three_d/` for 3D, `tools/utilities.py` for utilities)
2. Inherit from `BaseVisualizationTool` or `BaseUtilityTool`, implement `metadata` property and `execute` method
3. Import and register in `tools/__init__.py` via `registry.register_tool()`

**Currently active tools (2):**
- `show_video` — Returns `[DISPLAY_VIDEO:{path}]` marker that the frontend detects to render an inline video player
- `render_custom_scene` — Renders arbitrary Manim Python code; validates Scene class presence, runs `manim` CLI with configurable quality (low/medium/high/production), 120s timeout

**Commented-out tools (8)** in `tools/__init__.py` — ready to re-enable:
- Utilities: `greet`, `list_mobjects`, `list_animations`
- 2D Algebra: `plot_function`, `compare_functions`, `show_transformation`
- 3D: `plot_3d_surface`, `compare_3d_surfaces`, `show_3d_transformation`

### Web Client Key Files
- `src/app/api/chat/route.ts` — Chat API route that streams Claude responses via SSE, dynamically fetches MCP tools, runs tool call loop (up to 100 iterations)
- `src/components/ChatInterface.tsx` — Main chat UI with SSE parsing, tool call display, inline video player (triggered by `[DISPLAY_VIDEO:{path}]` pattern)
- `src/lib/mcp-client.ts` — `MCPHTTPClient` wrapping `@modelcontextprotocol/sdk` with `StreamableHTTPClientTransport`
- `src/lib/config.ts` — Loads `config.json` (at `web-client/config.json`), provides `getMCPServerURL()` with env var override support
- `src/hooks/useChat.ts` — Chat state management hook (messages, conversations, localStorage persistence)

### Chat SSE Streaming Protocol
The `/api/chat` route streams events to the frontend. Key event types: `text_start`, `text_delta`, `text_stop`, `tool_use_start`, `tool_use_stop`, `tool_input_delta`, `tool_execution_start`, `tool_execution_complete`, `tool_execution_error`, `complete`, `error`. The frontend in `ChatInterface.tsx` parses these to render streaming text and tool call status.

### Video Display Flow
When Claude calls `render_custom_scene`, the tool renders a Manim video and returns the file path. Claude then calls `show_video` with that path, which returns a `[DISPLAY_VIDEO:{path}]` string. The frontend detects this pattern in message text and renders an inline video player via the `/api/video` route.

### Infrastructure
- **Auth**: Auth0 (JWT verification on server via `core/auth.py`, Next.js middleware on client) — currently commented out
- **Database**: PostgreSQL on RDS (SQLAlchemy ORM)
- **Storage**: S3 bucket → CloudFront CDN for rendered videos
- **Deployment**: Server on AWS ECS Fargate (behind ALB), web client on Vercel

## Key Configuration

- **Server env vars**: loaded via `python-dotenv` from `.env` files (gitignored)
- **Web client config**: `web-client/config.json` defines MCP server URL, AI model, system prompt, UI settings
- **MCP server URL override**: Set `NEXT_PUBLIC_MCP_SERVER_URL` env var (e.g., `http://localhost:8000` for local dev) — the endpoint path from config is appended automatically
- **Web client env vars**: See `web-client/.env.local.example` for required vars (`ANTHROPIC_API_KEY`, Auth0 vars)
- Python requires >=3.12, managed with `uv`
- Node.js managed via nvm
