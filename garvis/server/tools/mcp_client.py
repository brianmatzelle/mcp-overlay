"""
Python MCP client using httpx.
Speaks JSON-RPC 2.0 over the MCP Streamable HTTP transport,
mirroring xr-mcp-app/src/mcp.ts.
"""

import json
import httpx
from typing import Any, Optional

_next_id = 0


def _parse_sse_json(text: str) -> dict:
    """Extract the JSON payload from an SSE response (event: message\\ndata: {...})."""
    for line in text.splitlines():
        if line.startswith("data: "):
            return json.loads(line[6:])
    raise ValueError(f"No data line found in SSE response: {text[:200]}")


def _get_next_id() -> int:
    global _next_id
    _next_id += 1
    return _next_id


class MCPClient:
    """Lightweight MCP client for connecting to MCP servers over HTTP."""

    def __init__(self, url: str):
        self.url = url
        self.session_id: Optional[str] = None
        self._http = httpx.AsyncClient(timeout=60.0, follow_redirects=True)

    async def _rpc(
        self,
        method: str,
        params: dict | None = None,
        is_notification: bool = False,
    ) -> Any:
        body: dict[str, Any] = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
        }
        if not is_notification:
            body["id"] = _get_next_id()

        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.session_id:
            headers["mcp-session-id"] = self.session_id

        resp = await self._http.post(self.url, json=body, headers=headers)

        # If we get a 404 with a stale session, re-initialize and retry once
        if resp.status_code == 404 and self.session_id and method != "initialize":
            self.session_id = None
            await self.connect()
            headers.pop("mcp-session-id", None)
            if self.session_id:
                headers["mcp-session-id"] = self.session_id
            resp = await self._http.post(self.url, json=body, headers=headers)

        # Capture session ID
        sid = resp.headers.get("mcp-session-id")
        if sid:
            self.session_id = sid

        if is_notification:
            return None

        resp.raise_for_status()

        # Handle both JSON and SSE response formats.
        # TypeScript MCP servers return application/json directly.
        # Python FastMCP servers return text/event-stream (SSE).
        content_type = resp.headers.get("content-type", "")
        if "text/event-stream" in content_type:
            data = _parse_sse_json(resp.text)
        else:
            data = resp.json()

        if "error" in data and data["error"]:
            raise RuntimeError(data["error"].get("message", str(data["error"])))
        return data.get("result")

    async def connect(self) -> dict:
        """Initialize the MCP session."""
        result = await self._rpc("initialize", {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "garvis-mcp-bridge", "version": "1.0.0"},
        })
        # Send initialized notification (fire-and-forget)
        try:
            await self._rpc("notifications/initialized", {}, is_notification=True)
        except Exception:
            pass
        return result

    async def list_tools(self) -> list[dict]:
        """List available tools from the MCP server."""
        result = await self._rpc("tools/list")
        return result.get("tools", [])

    async def call_tool(self, name: str, arguments: dict | None = None) -> dict:
        """Call a tool on the MCP server."""
        return await self._rpc("tools/call", {
            "name": name,
            "arguments": arguments or {},
        })

    async def close(self):
        """Close the HTTP client."""
        await self._http.aclose()
