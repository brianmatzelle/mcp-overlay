# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

MCP App Sandbox — a browser-based tool for interacting with MCP (Model Context Protocol) servers. Users can connect to any MCP server, browse/execute tools, view MCP App UIs rendered in sandboxed iframes, and chat with a Claude-powered agent that can call tools on their behalf.

## Development Commands

```bash
# Run the full stack (Vite frontend + Express API server)
npm run dev

# Build for production
npm run build

# Run the example MTA Subway MCP server (from mta-subway/)
cd mta-subway && npm run dev
```

The `dev` command runs Vite on port **5180** and the API server on port **5181** concurrently. Vite proxies `/api` requests to the backend.

The MTA subway server is a separate package with its own `package.json`; run `npm install` in `mta-subway/` independently.

## Architecture

**Three-tier system:**

1. **Frontend** (`src/`) — React 19 + TypeScript, built with Vite. Contains a custom lightweight MCP client (`src/mcp.ts`) that speaks JSON-RPC 2.0 over HTTP (no MCP SDK dependency in-browser to keep the bundle small).

2. **Backend API** (`server/api.ts`) — Express server with a single `POST /api/chat` endpoint. Runs an agentic loop (up to 10 turns): connects to the user's MCP server via `StreamableHTTPClientTransport`, lists tools, converts them to Claude API format, streams responses back via SSE.

3. **Example MCP Server** (`mta-subway/`) — Demonstrates MCP App patterns using `@modelcontextprotocol/ext-apps`. Has its own build pipeline (Vite builds HTML apps into single files, `tsc` compiles server code).

**Key data flows:**

- **Direct tool execution:** User selects tool in sidebar → `MCPClient.callTool()` → if result has `structuredContent.resource.uri`, fetches HTML via `readResource` → renders in `AppRenderer` iframe.
- **AI chat:** User message → `POST /api/chat` → backend streams SSE events (`text_delta`, `tool_use_start`, `tool_execution_complete`, `complete`, `error`) → frontend parses stream and renders inline tool results and MCP App UIs.
- **MCP App UIs:** `@mcp-ui/client`'s `AppRenderer` component sandboxes HTML in an iframe via `public/sandbox_proxy.html`. Apps can call tools and read resources back through the host via callbacks.

## Key Files

- `src/mcp.ts` — Browser-side MCP client (JSON-RPC 2.0 over fetch, session management via `mcp-session-id` header)
- `src/Chat.tsx` — SSE streaming chat component with inline tool call rendering
- `src/App.tsx` — Main UI: connection management, tool sidebar, execution panel, AppRenderer integration
- `server/api.ts` — Backend agentic loop (Claude API + MCP tool execution)
- `mta-subway/server.ts` — Example MCP server with `RegisterAppTool` pattern

## Environment

- Requires `ANTHROPIC_API_KEY` env var for the chat feature
- TypeScript strict mode enabled
- No test framework configured
- No linter configured
