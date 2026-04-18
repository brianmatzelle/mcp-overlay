"""
3D surface plotting tools for advanced visualization.
"""
from typing import Optional
from tools.base import BaseVisualizationTool, ToolMetadata, ToolCategory
from core import (
    validate_range, validate_color_scheme, ValidationError,
    parse_and_validate,
    ast_to_python
)
from core.code_generation import generate_3d_surface_code
from core.renderer import render_manim_scene


class Plot3DSurfaceTool(BaseVisualizationTool):
    """
    Plot a 3D surface function z = f(x, y).
    Uses safe evaluation and template-based code generation.
    """

    # Color scheme mappings
    COLOR_SCHEMES = {
        'blue_to_red': ['BLUE', 'RED'],
        'green_to_yellow': ['GREEN', 'YELLOW'],
        'rainbow': ['BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'RED'],
        'cool': ['BLUE', 'TEAL', 'GREEN'],
        'warm': ['YELLOW', 'ORANGE', 'RED']
    }

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="plot_3d_surface",
            description=(
                "Plot a 3D surface function z = f(x, y) with rotating camera view. "
                "Perfect for showing how functions behave in 3 dimensions! "
                "Supports color gradients, rotation, and custom titles."
            ),
            category=ToolCategory.ALGEBRA_3D,
            use_cases=[
                "Student asks to visualize a 3D function (e.g., 'show me z = x^2 + y^2')",
                "Demonstrating multivariable functions",
                "Showing paraboloids, saddle points, or other 3D shapes",
                "Teaching calculus concepts in 3D"
            ],
            examples=[
                {
                    "function": "x**2 + y**2",
                    "title": "Paraboloid"
                },
                {
                    "function": "sin(x) * cos(y)",
                    "x_range": "-3,3",
                    "y_range": "-3,3",
                    "color_scheme": "rainbow"
                },
                {
                    "function": "x**2 - y**2",
                    "title": "Saddle Point",
                    "color_scheme": "cool"
                }
            ],
            related_tools=["compare_3d_surfaces", "show_3d_transformation"]
        )

    def execute(
        self,
        function: str,
        x_range: str = "-3,3",
        y_range: str = "-3,3",
        z_range: str = "-5,5",
        color_scheme: str = "blue_to_red",
        title: Optional[str] = None,
        show_axes: bool = True,
        rotation_speed: float = 0.2
    ) -> str:
        """
        Execute the plot_3d_surface tool.

        Args:
            function: The function z = f(x,y) (e.g., "x**2 + y**2", "sin(x)*cos(y)")
            x_range: X-axis range as "min,max" (default: "-3,3")
            y_range: Y-axis range as "min,max" (default: "-3,3")
            z_range: Z-axis range as "min,max" (default: "-5,5")
            color_scheme: Color gradient (blue_to_red, green_to_yellow, rainbow, cool, warm)
            title: Custom title for the visualization
            show_axes: Whether to show the 3D axes
            rotation_speed: How fast to rotate the camera (0.1 = slow, 0.5 = fast)

        Returns:
            Status message with video path or error
        """
        try:
            # Parse and validate function using AST
            ast = parse_and_validate(function, allowed_variables={'x', 'y'})
            x_min, x_max = validate_range(x_range, range_name="x_range")
            y_min, y_max = validate_range(y_range, range_name="y_range")
            z_min, z_max = validate_range(z_range, range_name="z_range")
            validated_scheme = validate_color_scheme(color_scheme)

            # Validate rotation speed
            if not 0.0 <= rotation_speed <= 1.0:
                raise ValidationError(
                    f"rotation_speed must be between 0.0 and 1.0, got {rotation_speed}",
                    suggestion="Use a value between 0.1 (slow) and 0.5 (fast)",
                    example="0.2"
                )

            # Convert AST to Python code for Manim (replace x,y with u,v for Manim's Surface)
            parsed_func = ast_to_python(ast)
            # Convert x,y to u,v for the surface parameterization
            surface_func = parsed_func.replace('x', 'u').replace('y', 'v')

            # Get color list from scheme
            colors = self.COLOR_SCHEMES[validated_scheme]

            # Generate Manim code using safe templates
            scene_code = generate_3d_surface_code(
                function=surface_func,
                x_range=(x_min, x_max),
                y_range=(y_min, y_max),
                z_range=(z_min, z_max),
                color_scheme=colors,
                title=title,
                show_axes=show_axes,
                rotation_speed=rotation_speed
            )

            # Render the scene (3D scenes need more time)
            # Use low_quality for faster testing, medium_quality for final output
            return render_manim_scene(scene_code, quality="low_quality", timeout=180)

        except ValidationError as e:
            return str(e)
        except Exception as e:
            return f"❌ Error creating 3D visualization: {str(e)}"
