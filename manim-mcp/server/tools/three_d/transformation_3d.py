"""
3D surface transformation tools for advanced visualization.
"""
from typing import Optional
from tools.base import BaseVisualizationTool, ToolMetadata, ToolCategory
from core import (
    validate_range, ValidationError,
    parse_and_validate,
    ast_to_python
)
from core.code_generation import generate_3d_transformation_code
from core.renderer import render_manim_scene


class Show3DTransformationTool(BaseVisualizationTool):
    """
    Visualize how one 3D surface transforms into another.
    Uses safe evaluation and template-based code generation.
    """

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="show_3d_transformation",
            description=(
                "Show how a 3D surface transforms into another surface with animation. "
                "Perfect for teaching 3D transformations! "
                "Shows original surface in blue, transformed surface in red, with smooth animation and rotating camera."
            ),
            category=ToolCategory.ALGEBRA_3D,
            use_cases=[
                "Student asks to see how a 3D function changes (e.g., 'show how x^2 + y^2 becomes x^2 + y^2 + 2')",
                "Teaching vertical shifts in 3D",
                "Demonstrating scaling transformations",
                "Explaining 3D transformations with educational context"
            ],
            examples=[
                {
                    "original": "x**2 + y**2",
                    "transformed": "x**2 + y**2 + 2",
                    "explain": "Vertical shift up 2 units"
                },
                {
                    "original": "sin(x)*cos(y)",
                    "transformed": "2*sin(x)*cos(y)",
                    "explain": "Vertical stretch by factor of 2"
                },
                {
                    "original": "x**2 + y**2",
                    "transformed": "x**2 - y**2",
                    "explain": "From paraboloid to saddle point"
                }
            ],
            related_tools=["plot_3d_surface", "compare_3d_surfaces"]
        )

    def execute(
        self,
        original: str,
        transformed: str,
        x_range: str = "-3,3",
        y_range: str = "-3,3",
        z_range: str = "-5,5",
        explain: Optional[str] = None
    ) -> str:
        """
        Execute the show_3d_transformation tool.

        Args:
            original: Original function z = f(x,y) (e.g., "x**2 + y**2")
            transformed: Transformed function (e.g., "x**2 + y**2 + 2")
            x_range: X-axis range as "min,max" (default: "-3,3")
            y_range: Y-axis range as "min,max" (default: "-3,3")
            z_range: Z-axis range as "min,max" (default: "-5,5")
            explain: Optional explanation of the transformation
                    (e.g., "vertical shift up 2 units")

        Returns:
            Status message with video path or error
        """
        try:
            # Parse and validate functions using AST
            ast_orig = parse_and_validate(original, allowed_variables={'x', 'y'})
            ast_trans = parse_and_validate(transformed, allowed_variables={'x', 'y'})
            x_min, x_max = validate_range(x_range, range_name="x_range")
            y_min, y_max = validate_range(y_range, range_name="y_range")
            z_min, z_max = validate_range(z_range, range_name="z_range")

            # Convert AST to Python code for Manim
            parsed_orig = ast_to_python(ast_orig)
            parsed_trans = ast_to_python(ast_trans)

            # Convert x,y to u,v for the surface parameterization
            surface_orig = parsed_orig.replace('x', 'u').replace('y', 'v')
            surface_trans = parsed_trans.replace('x', 'u').replace('y', 'v')

            # Generate Manim code using safe templates
            scene_code = generate_3d_transformation_code(
                original_function=surface_orig,
                transformed_function=surface_trans,
                x_range=(x_min, x_max),
                y_range=(y_min, y_max),
                z_range=(z_min, z_max),
                explanation=explain
            )

            # Render the scene (3D scenes need more time)
            # Use low_quality for faster testing, medium_quality for final output
            return render_manim_scene(scene_code, quality="low_quality", timeout=180)

        except ValidationError as e:
            return str(e)
        except Exception as e:
            return f"❌ Error creating 3D transformation: {str(e)}"
