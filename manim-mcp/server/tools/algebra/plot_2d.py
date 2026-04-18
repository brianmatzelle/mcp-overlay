"""
2D function plotting tools for algebra visualization.
"""
from typing import Optional, List, Tuple
from tools.base import BaseVisualizationTool, ToolMetadata, ToolCategory
from core import (
    validate_range, validate_color, ValidationError,
    parse_and_validate, safe_eval_at_point,
    ast_to_python, ast_to_display_string
)
from core.code_generation import generate_2d_plot_code
from core.renderer import render_manim_scene
import numpy as np


class PlotFunctionTool(BaseVisualizationTool):
    """
    Plot a mathematical function with educational annotations.
    Uses safe evaluation and template-based code generation.
    """

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="plot_function",
            description=(
                "Plot a mathematical function with educational annotations. "
                "Perfect for answering student questions about algebra! "
                "Supports highlighting key points, showing slope, and custom titles."
            ),
            category=ToolCategory.ALGEBRA_2D,
            use_cases=[
                "Student asks to visualize a specific function (e.g., 'show me f(x) = 3x + 1')",
                "Demonstrating why a function passes through or misses certain points",
                "Showing slope visualization for linear functions (rise over run)",
                "Highlighting intercepts or specific coordinates on a graph"
            ],
            examples=[
                {
                    "function": "3*x + 1",
                    "x_range": "-5,5",
                    "highlight_points": "origin,y_intercept"
                },
                {
                    "function": "x^2",
                    "x_range": "-3,3",
                    "y_range": "-1,10",
                    "color": "RED",
                    "title": "Parabola"
                },
                {
                    "function": "sin(x)",
                    "x_range": "-6.28,6.28",
                    "show_equation": True
                }
            ],
            related_tools=["compare_functions", "show_transformation"]
        )

    def execute(
        self,
        function: str,
        x_range: str = "-5,5",
        y_range: str = "-5,5",
        highlight_points: Optional[str] = None,
        show_slope: bool = False,
        show_equation: bool = True,
        color: str = "BLUE",
        title: Optional[str] = None
    ) -> str:
        """
        Execute the plot_function tool.

        Args:
            function: The function to plot (e.g., "3x + 1", "x^2", "sin(x)")
            x_range: X-axis range as "min,max" (default: "-5,5")
            y_range: Y-axis range as "min,max" (default: "-5,5")
            highlight_points: Comma-separated points to highlight: "origin", "y_intercept",
                             "x_intercept", or coordinates like "2,5"
            show_slope: Show slope visualization for linear functions
            show_equation: Display the equation on the graph
            color: Function color (BLUE, RED, GREEN, YELLOW, etc.)
            title: Custom title for the visualization

        Returns:
            Status message with video path or error
        """
        try:
            # Parse and validate function (combined operation)
            ast = parse_and_validate(function, allowed_variables={'x'})
            x_min, x_max = validate_range(x_range, range_name="x_range")
            y_min, y_max = validate_range(y_range, range_name="y_range")
            validated_color = validate_color(color)

            # Convert AST to Python code for Manim
            parsed_func = ast_to_python(ast)

            # Calculate key points using safe evaluation
            key_points = self._calculate_key_points(ast, (x_min, x_max))

            # Parse highlight points
            points_to_highlight = self._parse_highlight_points(
                highlight_points, key_points
            )

            # Prepare title
            display_title = None
            if title:
                display_title = title
            elif show_equation:
                func_display = ast_to_display_string(ast)
                display_title = f'Graph of f(x) = {func_display}'

            # Prepare slope data for linear functions
            slope_data = None
            if show_slope:
                slope_data = self._calculate_slope_data(
                    ast, x_min, x_max
                )

            # Generate Manim code using safe templates
            scene_code = generate_2d_plot_code(
                function=parsed_func,
                x_range=(x_min, x_max),
                y_range=(y_min, y_max),
                color=validated_color,
                title=display_title,
                highlight_points=points_to_highlight,
                show_slope=show_slope and slope_data is not None,
                slope_data=slope_data
            )

            # Render the scene
            return render_manim_scene(scene_code, quality="medium_quality")

        except ValidationError as e:
            return str(e)
        except Exception as e:
            return f"❌ Error creating visualization: {str(e)}"

    def _calculate_key_points(
        self,
        ast,
        x_range: Tuple[float, float]
    ) -> dict:
        """
        Calculate key points like intercepts for a function using safe evaluation.

        Args:
            ast: Function AST
            x_range: Tuple of (x_min, x_max) for searching x-intercepts

        Returns:
            Dictionary mapping point names to (x, y) coordinates
        """
        points = {}

        try:
            # Y-intercept (x=0) using safe evaluation
            y_int = safe_eval_at_point(ast, 0)
            points['y_intercept'] = (0, float(y_int))
        except:
            pass

        try:
            # Try to find x-intercept (y=0) by sampling
            x_vals = np.linspace(x_range[0], x_range[1], 1000)
            y_vals = []

            # Evaluate safely at each point
            for x in x_vals:
                try:
                    y = safe_eval_at_point(ast, x)
                    y_vals.append(y)
                except:
                    y_vals.append(np.nan)

            y_vals = np.array(y_vals)

            # Find sign changes (indicates zero crossing)
            for i in range(len(y_vals) - 1):
                if not np.isnan(y_vals[i]) and not np.isnan(y_vals[i+1]):
                    if y_vals[i] * y_vals[i+1] < 0:
                        points['x_intercept'] = (float(x_vals[i]), 0.0)
                        break
        except:
            pass

        # Always include origin as reference
        points['origin'] = (0, 0)

        return points

    def _parse_highlight_points(
        self,
        highlight_str: Optional[str],
        key_points: dict
    ) -> List[Tuple[float, float]]:
        """
        Parse highlight points string into coordinates.

        Args:
            highlight_str: Comma-separated point identifiers or coordinates
            key_points: Dictionary of named key points

        Returns:
            List of (x, y) tuples
        """
        if not highlight_str:
            return []

        points = []
        for point in highlight_str.split(','):
            point = point.strip()

            # Check if it's a named point
            if point in key_points:
                points.append(key_points[point])
            else:
                # Try to parse as coordinates
                try:
                    coords = point.split()
                    if len(coords) == 2:
                        x, y = map(float, coords)
                        points.append((x, y))
                except:
                    # Skip invalid points
                    pass

        return points

    def _calculate_slope_data(
        self,
        ast,
        x_min: float,
        x_max: float
    ) -> Optional[dict]:
        """
        Calculate slope visualization data for linear functions.

        Args:
            ast: Function AST
            x_min: Start of x range
            x_max: End of x range

        Returns:
            Dictionary with slope data or None if calculation fails
        """
        try:
            # Calculate rise and run
            y_start = safe_eval_at_point(ast, x_min)
            y_end = safe_eval_at_point(ast, x_min + 1)

            return {
                'x_start': x_min,
                'x_end': x_min + 1,
                'y_start': float(y_start),
                'y_end': float(y_end)
            }
        except:
            return None
