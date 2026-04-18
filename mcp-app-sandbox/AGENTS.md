# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript frontend (MCP client + AppRenderer).
- `server/`: Express API for agentic chat loop.
- `mta-subway/`, `citibike/`, `crackstreams/`: Example MCP servers.

## Build, Test, and Development Commands
- `npm run dev`: Vite (5180) + Express API (5181).
- `npm run build`: TypeScript + Vite build.
- `cd mta-subway && npm run dev`: Run MTA MCP server (3001).
- `cd citibike && npm run dev`: Run Citibike MCP server (3002).
- `cd crackstreams && uv run uvicorn main:app --host 0.0.0.0 --port 3003 --reload`: Run CrackStreams server.

## Coding Style & Naming Conventions
- TypeScript strict mode enabled.
- Keep MCP client logic in `src/mcp.ts` and avoid SDK usage in the browser.
- Follow existing component naming in `src/` and keep file names aligned with exports.

## Testing Guidelines
- No test framework configured. If you add tests, document the command in this file.

## Commit & Pull Request Guidelines
- Note any MCP protocol changes or new tools.
- Include UI screenshots when the AppRenderer or chat UI changes.

## Configuration & Environment Notes
- `ANTHROPIC_API_KEY` is required for `/api/chat`.
