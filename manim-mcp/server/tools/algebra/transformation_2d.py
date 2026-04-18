"""
2D function transformation tools for algebra visualization.
"""
from typing import Optional
from tools.base import BaseVisualizationTool, ToolMetadata, ToolCategory
from core import (
    validate_range, ValidationError,
    parse_and_validate,
    ast_to_python, ast_to_display_string
)
from core.code_generation import generate_transformation_code
from core.renderer import render_manim_scene


class ShowTransformationTool(BaseVisualizationTool):
    """
    Visualize how one function transforms into another.
    Uses safe evaluation and template-based code generation.
    """

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="show_transformation",
            description=(
                "Show how a function transforms into another function with animation. "
                "Perfect for teaching function transformations! "
                "Shows original function in blue, transformed function in red, with smooth animation."
            ),
            category=ToolCategory.ALGEBRA_2D,
            use_cases=[
                "Student asks to see how a function changes (e.g., 'show how x^2 becomes x^2 + 2')",
                "Teaching vertical or horizontal shifts",
                "Demonstrating stretches and compressions",
                "Explaining transformations with educational context"
            ],
            examples=[
                {
                    "original": "x^2",
                    "transformed": "x^2 + 2",
                    "explain": "Vertical shift up 2 units"
                },
                {
                    "original": "sin(x)",
                    "transformed": "2*sin(x)",
                    "x_range": "-6.28,6.28",
                    "explain": "Vertical stretch by factor of 2"
                },
                {
                    "original": "x",
                    "transformed": "x + 3",
                    "explain": "Horizontal shift left 3 units"
                }
            ],
            related_tools=["plot_function", "compare_functions"]
        )

    def execute(
        self,
        original: str,
        transformed: str,
        x_range: str = "-5,5",
        y_range: str = "-5,5",
        explain: Optional[str] = None
    ) -> str:
        """
        Execute the show_transformation tool.

        Args:
            original: Original function (e.g., "x^2")
            transformed: Transformed function (e.g., "x^2 + 2")
            x_range: X-axis range as "min,max" (default: "-5,5")
            y_range: Y-axis range as "min,max" (default: "-5,5")
            explain: Optional explanation of the transformation
                    (e.g., "vertical shift up 2 units")

        Returns:
            Status message with video path or error
        """
        try:
            # Parse and validate functions using AST
            ast_orig = parse_and_validate(original, allowed_variables={'x'})
            ast_trans = parse_and_validate(transformed, allowed_variables={'x'})
            x_min, x_max = validate_range(x_range, range_name="x_range")
            y_min, y_max = validate_range(y_range, range_name="y_range")

            # Convert AST to Python code for Manim
            parsed_orig = ast_to_python(ast_orig)
            parsed_trans = ast_to_python(ast_trans)

            # Get display versions
            orig_display = ast_to_display_string(ast_orig)
            trans_display = ast_to_display_string(ast_trans)

            # Generate Manim code using safe templates
            scene_code = generate_transformation_code(
                original_function=parsed_orig,
                transformed_function=parsed_trans,
                original_display=orig_display,
                transformed_display=trans_display,
                x_range=(x_min, x_max),
                y_range=(y_min, y_max),
                explanation=explain
            )

            # Render the scene
            return render_manim_scene(scene_code, quality="medium_quality")

        except ValidationError as e:
            return str(e)
        except Exception as e:
            return f"❌ Error creating transformation: {str(e)}"
