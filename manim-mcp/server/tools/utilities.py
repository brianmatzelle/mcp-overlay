"""
Utility tools for the MCP server.
"""
from tools.base import BaseUtilityTool
from core.renderer import render_manim_scene


class ShowVideoTool(BaseUtilityTool):
    """Display a rendered video in the chat interface."""

    @property
    def name(self) -> str:
        return "show_video"

    @property
    def description(self) -> str:
        return (
            "Display a Manim video in the chat interface. "
            "Takes a relative video path and returns a special format "
            "that the frontend will render as a video player."
        )

    def execute(self, video_path: str) -> str:
        """
        Display a video.

        Args:
            video_path: The relative path to the video file from media/videos/
                       (e.g., "tmpXXXXXX/720p30/Scene.mp4")

        Returns:
            A special format that the frontend will render as a video player
        """
        # Return in a format the frontend will detect and render as video
        return f"[DISPLAY_VIDEO:{video_path}]"


class RenderCustomSceneTool(BaseUtilityTool):
    """Render arbitrary Manim scene code for custom visualizations."""

    @property
    def name(self) -> str:
        return "render_custom_scene"

    @property
    def description(self) -> str:
        return (
            "Render custom Manim scene code to video. Use this when the specialized "
            "tools (plot_function, compare_functions, etc.) cannot produce the desired "
            "visualization. The code must contain a complete Scene class with a "
            "construct method. Returns the video path on success."
        )

    def execute(self, code: str, quality: str = "medium_quality") -> str:
        """
        Render custom Manim code.

        Args:
            code: Complete Python code containing a Manim Scene class.
                  Must include 'from manim import *' and a class inheriting from Scene.
            quality: Render quality - low_quality, medium_quality, high_quality,
                     or production_quality (default: medium_quality)

        Returns:
            Status message with video path or error
        """
        if "class " not in code or "Scene" not in code:
            return (
                "❌ Invalid code: Must contain a class inheriting from Scene.\n"
                "Example:\n"
                "from manim import *\n"
                "class MyScene(Scene):\n"
                "    def construct(self):\n"
                "        ..."
            )

        if "from manim import" not in code:
            code = "from manim import *\n\n" + code

        valid_qualities = {"low_quality", "medium_quality", "high_quality", "production_quality"}
        if quality not in valid_qualities:
            quality = "medium_quality"

        return render_manim_scene(code, quality=quality)


class GreetTool(BaseUtilityTool):
    """Simple greeting tool for testing."""

    @property
    def name(self) -> str:
        return "greet"

    @property
    def description(self) -> str:
        return "Greet someone by name."

    def execute(self, name: str) -> str:
        """
        Greet someone.

        Args:
            name: Name of the person to greet

        Returns:
            Greeting message
        """
        return f"Hello, {name}!"


class ListMobjectsTool(BaseUtilityTool):
    """List available Manim objects (shapes, text, etc.)."""

    @property
    def name(self) -> str:
        return "list_mobjects"

    @property
    def description(self) -> str:
        return (
            "List available Manim Mobjects (shapes, objects, text, etc.). "
            "Helpful when a user asks 'what shapes can I create?' or "
            "'what objects are available in Manim?'"
        )

    def execute(self) -> str:
        """
        List available Manim Mobjects.

        Returns:
            A categorized list of available Mobjects
        """
        mobjects = {
            "Basic Shapes": [
                "Circle", "Square", "Triangle", "Rectangle", "RoundedRectangle",
                "Polygon", "RegularPolygon", "Star", "Ellipse"
            ],
            "Lines & Arrows": [
                "Line", "Arrow", "Vector", "DoubleArrow", "DashedLine",
                "TangentLine", "Elbow", "CurvedArrow"
            ],
            "Text & Math": [
                "Text", "MarkupText", "Tex", "MathTex", "Title", "Code"
            ],
            "3D Objects": [
                "Sphere", "Cube", "Cone", "Cylinder", "Torus", "Prism"
            ],
            "Graphs & Plots": [
                "Axes", "NumberPlane", "ComplexPlane", "Graph", "BarChart",
                "Line", "CoordinateSystem"
            ],
            "Special Objects": [
                "VGroup", "VMobject", "SVGMobject", "ImageMobject",
                "NumberLine", "DecimalNumber", "Integer", "Variable"
            ]
        }

        result = "📦 Available Manim Mobjects:\n\n"
        for category, items in mobjects.items():
            result += f"**{category}**\n"
            result += ", ".join(items) + "\n\n"

        return result


class ListAnimationsTool(BaseUtilityTool):
    """List available Manim animations."""

    @property
    def name(self) -> str:
        return "list_animations"

    @property
    def description(self) -> str:
        return (
            "List available Manim animations. "
            "Helpful when a user asks 'what animations can I use?' or "
            "'how can I animate objects?'"
        )

    def execute(self) -> str:
        """
        List available Manim animations.

        Returns:
            A categorized list of available animations
        """
        animations = {
            "Creation": [
                "Create", "Uncreate", "DrawBorderThenFill", "Write", "Unwrite"
            ],
            "Fading": [
                "FadeIn", "FadeOut", "FadeInFrom", "FadeOutAndShift",
                "FadeInFromPoint", "FadeOutToPoint"
            ],
            "Growth": [
                "GrowFromCenter", "GrowFromEdge", "GrowFromPoint",
                "SpinInFromNothing"
            ],
            "Indication": [
                "Indicate", "Flash", "ShowPassingFlash", "Wiggle",
                "FocusOn", "Circumscribe", "ShowCreationThenDestruction"
            ],
            "Movement": [
                "Shift", "MoveAlongPath", "Rotate", "Rotating",
                "MoveToTarget", "ApplyMethod", "ApplyPointwiseFunction"
            ],
            "Transform": [
                "Transform", "ReplacementTransform", "TransformFromCopy",
                "ClockwiseTransform", "CounterclockwiseTransform"
            ]
        }

        result = "🎬 Available Manim Animations:\n\n"
        for category, items in animations.items():
            result += f"**{category}**\n"
            result += ", ".join(items) + "\n\n"

        return result
