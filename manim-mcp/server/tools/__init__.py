"""
Tool registration and exports.

This module automatically imports all available tools and provides
a simple function to register them with a FastMCP server.
"""
from fastmcp import FastMCP
from tools.base import registry, ToolCategory
from tools.utilities import ShowVideoTool, RenderCustomSceneTool, GreetTool, ListMobjectsTool, ListAnimationsTool
from tools.algebra.plot_2d import PlotFunctionTool
from tools.algebra.compare_2d import CompareFunctionsTool
from tools.algebra.transformation_2d import ShowTransformationTool
from tools.three_d.plot_3d import Plot3DSurfaceTool
from tools.three_d.compare_3d import Compare3DSurfacesTool
from tools.three_d.transformation_3d import Show3DTransformationTool


# Register all available tools
def register_all_tools(mcp: FastMCP) -> None:
    """
    Register all available tools with a FastMCP server.

    This function should be called once during server initialization
    to make all tools available to MCP clients.

    Args:
        mcp: FastMCP server instance

    Example:
        >>> from fastmcp import FastMCP
        >>> from tools import register_all_tools
        >>> mcp = FastMCP("My Server")
        >>> register_all_tools(mcp)
    """
    # Utility tools
    registry.register_tool(ShowVideoTool())
    registry.register_tool(RenderCustomSceneTool())
    # registry.register_tool(GreetTool())
    # registry.register_tool(ListMobjectsTool())
    # registry.register_tool(ListAnimationsTool())

    # Algebra 2D tools
    # registry.register_tool(PlotFunctionTool())
    # registry.register_tool(CompareFunctionsTool())
    # registry.register_tool(ShowTransformationTool())

    # 3D Visualization tools
    # registry.register_tool(Plot3DSurfaceTool())
    # registry.register_tool(Compare3DSurfacesTool())
    # registry.register_tool(Show3DTransformationTool())

    # Future: Add more tools here as they're implemented

    # Register all tools with MCP
    registry.register_all_with_mcp(mcp)

    print(f" Registered {len(registry.tools)} tools with MCP server")
    print(f"   - Utilities: 5")
    print(f"   - Algebra 2D: 3")
    print(f"   - 3D Visualization: 3")
    print(f"   - Future categories: Coming soon!")


# Export commonly used items
__all__ = [
    'register_all_tools',
    'registry',
    'ToolCategory',
]
