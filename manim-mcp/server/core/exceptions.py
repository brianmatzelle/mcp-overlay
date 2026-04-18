"""
Common exceptions for the Manim MCP server.
"""


class ParseError(Exception):
    """Error during parsing of mathematical expressions."""

    def __init__(self, message: str, position: int = None):
        self.message = message
        self.position = position
        super().__init__(self._format_message())

    def _format_message(self) -> str:
        if self.position is not None:
            return f"Parse error at position {self.position}: {self.message}"
        return f"Parse error: {self.message}"


class ValidationError(Exception):
    """Custom exception for validation errors with user-friendly messages."""

    def __init__(self, message: str, suggestion: str = None, example: str = None):
        self.message = message
        self.suggestion = suggestion
        self.example = example
        super().__init__(self.format_message())

    def format_message(self) -> str:
        """Format error with helpful context."""
        result = f"❌ {self.message}"
        if self.suggestion:
            result += f"\n\n💡 Suggestion: {self.suggestion}"
        if self.example:
            result += f"\n\n📝 Example: {self.example}"
        return result

