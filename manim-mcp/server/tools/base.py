"""
Base classes for MCP tools.
All visualization tools inherit from these classes.
"""
from abc import ABC, abstractmethod
from enum import Enum
from dataclasses import dataclass
from typing import Dict, Any, List, Optional, Callable
from fastmcp import FastMCP


class ToolCategory(Enum):
    """Categories for organizing tools."""
    ALGEBRA_2D = "algebra_2d"
    ALGEBRA_3D = "algebra_3d"
    CALCULUS = "calculus"
    LINEAR_ALGEBRA = "linear_algebra"
    DISCRETE_MATH = "discrete_math"
    UTILITIES = "utilities"


@dataclass
class ToolMetadata:
    """Metadata describing when and how to use a tool."""
    name: str
    description: str
    category: ToolCategory
    use_cases: List[str]
    examples: List[Dict[str, Any]]
    related_tools: List[str] = None

    def __post_init__(self):
        if self.related_tools is None:
            self.related_tools = []


class BaseVisualizationTool(ABC):
    """
    Base class for all visualization tools.

    Subclasses must implement:
    - metadata property: Describes the tool
    - execute method: Implements the tool logic
    """

    @property
    @abstractmethod
    def metadata(self) -> ToolMetadata:
        """Return tool metadata."""
        pass

    @abstractmethod
    def execute(self, **kwargs) -> str:
        """
        Execute the tool with given parameters.

        Args:
            **kwargs: Tool-specific parameters

        Returns:
            Result string (usually video path or error message)
        """
        pass

    def register(self, mcp: FastMCP) -> None:
        """
        Register this tool with the FastMCP server.

        Args:
            mcp: FastMCP server instance
        """
        # Directly register the execute method with FastMCP
        # FastMCP will introspect the method signature automatically
        decorated = mcp.tool(name=self.metadata.name, description=self.metadata.description)(self.execute)


class BaseUtilityTool(ABC):
    """
    Base class for utility tools (non-visualization).

    Examples: list_tools, show_video, etc.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Return tool name."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Return tool description."""
        pass

    @abstractmethod
    def execute(self, **kwargs) -> str:
        """
        Execute the tool.

        Returns:
            Result string
        """
        pass

    def register(self, mcp: FastMCP) -> None:
        """Register this utility tool with FastMCP."""
        # Directly register the execute method
        decorated = mcp.tool(name=self.name, description=self.description)(self.execute)


class ToolRegistry:
    """Registry for managing all available tools."""

    def __init__(self):
        self.tools: List[BaseVisualizationTool | BaseUtilityTool] = []
        self._by_name: Dict[str, BaseVisualizationTool | BaseUtilityTool] = {}
        self._by_category: Dict[ToolCategory, List[BaseVisualizationTool]] = {}

    def register_tool(self, tool: BaseVisualizationTool | BaseUtilityTool) -> None:
        """
        Register a tool in the registry.

        Args:
            tool: Tool instance to register
        """
        self.tools.append(tool)

        if isinstance(tool, BaseVisualizationTool):
            name = tool.metadata.name
            category = tool.metadata.category

            self._by_name[name] = tool

            if category not in self._by_category:
                self._by_category[category] = []
            self._by_category[category].append(tool)
        elif isinstance(tool, BaseUtilityTool):
            self._by_name[tool.name] = tool

    def get_tool(self, name: str) -> Optional[BaseVisualizationTool | BaseUtilityTool]:
        """Get a tool by name."""
        return self._by_name.get(name)

    def get_tools_by_category(self, category: ToolCategory) -> List[BaseVisualizationTool]:
        """Get all tools in a category."""
        return self._by_category.get(category, [])

    def register_all_with_mcp(self, mcp: FastMCP) -> None:
        """
        Register all tools with a FastMCP server instance.

        Args:
            mcp: FastMCP server instance
        """
        for tool in self.tools:
            tool.register(mcp)

    def get_tools_summary(self, category: Optional[ToolCategory] = None) -> str:
        """
        Get a formatted summary of available tools.

        Args:
            category: Optional category to filter by

        Returns:
            Formatted string describing available tools
        """
        if category:
            tools = self.get_tools_by_category(category)
            result = f"## {category.value.replace('_', ' ').title()} Tools\n\n"
        else:
            tools = [t for t in self.tools if isinstance(t, BaseVisualizationTool)]
            result = "## All Available Tools\n\n"

        if not tools:
            return result + "No tools available in this category.\n"

        for tool in tools:
            if not isinstance(tool, BaseVisualizationTool):
                continue

            meta = tool.metadata
            result += f"### {meta.name}\n"
            result += f"**Category:** {meta.category.value}\n"
            result += f"**Description:** {meta.description}\n\n"

            if meta.use_cases:
                result += "**Use Cases:**\n"
                for use_case in meta.use_cases:
                    result += f"- {use_case}\n"
                result += "\n"

            if meta.examples:
                result += "**Examples:**\n"
                for i, example in enumerate(meta.examples, 1):
                    result += f"{i}. `{meta.name}("
                    params = ", ".join(f"{k}='{v}'" if isinstance(v, str) else f"{k}={v}"
                                      for k, v in example.items())
                    result += params + ")`\n"
                result += "\n"

            if meta.related_tools:
                result += f"**Related Tools:** {', '.join(meta.related_tools)}\n\n"

            result += "---\n\n"

        return result


# Global registry instance
registry = ToolRegistry()
