"""
MCP Bridge — connects to external MCP servers, discovers tools,
and routes tool execution to the correct server.
"""

import json
from typing import Optional
from .mcp_client import MCPClient


class MCPBridge:
    """
    Maintains a registry of MCP servers and their tools.
    Provides tool definitions in Claude API format and routes execution.
    """

    def __init__(self):
        # server_name -> MCPClient
        self._clients: dict[str, MCPClient] = {}
        # tool_name -> server_name
        self._tool_registry: dict[str, str] = {}
        # tool_name -> tool definition (MCP format)
        self._tool_definitions: dict[str, dict] = {}

    async def add_server(self, name: str, url: str) -> list[str]:
        """
        Connect to an MCP server, discover its tools, and register them.
        Returns list of discovered tool names.
        """
        client = MCPClient(url)
        await client.connect()
        self._clients[name] = client

        tools = await client.list_tools()
        tool_names = []

        for tool in tools:
            tool_name = tool["name"]
            self._tool_registry[tool_name] = name
            self._tool_definitions[tool_name] = tool
            tool_names.append(tool_name)

        return tool_names

    def is_mcp_tool(self, name: str) -> bool:
        """Check if a tool name belongs to an MCP server."""
        return name in self._tool_registry

    def get_claude_tools(self) -> list[dict]:
        """Return tool definitions in Claude/Anthropic API format."""
        claude_tools = []
        for tool_name, tool_def in self._tool_definitions.items():
            input_schema = tool_def.get("inputSchema", {})
            claude_tools.append({
                "name": tool_name,
                "description": tool_def.get("description", ""),
                "input_schema": {
                    "type": input_schema.get("type", "object"),
                    "properties": input_schema.get("properties", {}),
                    "required": input_schema.get("required", []),
                },
            })
        return claude_tools

    async def execute(self, tool_name: str, arguments: dict) -> dict:
        """
        Execute a tool on the appropriate MCP server.
        Returns the raw MCP tool result (with content array).
        """
        server_name = self._tool_registry.get(tool_name)
        if not server_name:
            raise ValueError(f"Unknown MCP tool: {tool_name}")

        client = self._clients.get(server_name)
        if not client:
            raise ValueError(f"MCP server not connected: {server_name}")

        return await client.call_tool(tool_name, arguments)

    async def close(self):
        """Close all MCP client connections."""
        for client in self._clients.values():
            await client.close()
        self._clients.clear()
        self._tool_registry.clear()
        self._tool_definitions.clear()


# Module-level singleton
_bridge: Optional[MCPBridge] = None


def get_bridge() -> Optional[MCPBridge]:
    """Get the global MCP bridge instance."""
    return _bridge


async def initialize_bridge(servers: list[dict]) -> MCPBridge:
    """
    Initialize the global MCP bridge with a list of servers.
    Each server dict should have 'name' and 'url' keys.
    """
    global _bridge
    _bridge = MCPBridge()

    for server in servers:
        name = server["name"]
        url = server["url"]
        try:
            tool_names = await _bridge.add_server(name, url)
            print(f"  Connected to MCP server: {name} ({url})")
            print(f"    Tools: {', '.join(tool_names)}")
        except Exception as e:
            print(f"  Failed to connect to MCP server {name} ({url}): {e}")

    return _bridge


async def shutdown_bridge():
    """Shut down the global MCP bridge."""
    global _bridge
    if _bridge:
        await _bridge.close()
        _bridge = None
