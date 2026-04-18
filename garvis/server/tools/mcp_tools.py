"""
MCP tool definitions for Garvis server.
"""

from typing import Optional
from fastmcp import FastMCP

# Module-level reference to the MCP instance (set after registration)
_mcp_instance: Optional[FastMCP] = None

# Tools to exclude from Claude (utility tools not meant for conversation)
EXCLUDED_TOOLS = {"ping"}


def get_claude_tools() -> list[dict]:
    """
    Dynamically extract tool definitions from registered MCP tools,
    merged with any tools discovered via the MCP bridge.
    Returns tools in Claude/Anthropic format.
    """
    from .mcp_bridge import get_bridge

    claude_tools = []

    # Native FastMCP tools
    if _mcp_instance is not None:
        for tool in _mcp_instance._tool_manager._tools.values():
            if tool.name in EXCLUDED_TOOLS:
                continue
            claude_tools.append({
                "name": tool.name,
                "description": tool.description or "",
                "input_schema": {
                    "type": "object",
                    "properties": tool.parameters.get("properties", {}),
                    "required": tool.parameters.get("required", [])
                }
            })

    # MCP bridge tools (from external MCP servers)
    bridge = get_bridge()
    if bridge:
        claude_tools.extend(bridge.get_claude_tools())

    return claude_tools


def get_tool_names() -> list[str]:
    """Get list of all registered tool names."""
    if _mcp_instance is None:
        return []
    return [t.name for t in _mcp_instance._tool_manager._tools.values()]


def register_tools(mcp: FastMCP):
    global _mcp_instance
    _mcp_instance = mcp
    """Register all MCP tools with the FastMCP instance"""

    @mcp.tool()
    async def ping():
        """Ping endpoint for health checks"""
        return {
            "status": "pong",
            "service": "Garvis Voice Server",
            "version": "0.1.0",
        }
