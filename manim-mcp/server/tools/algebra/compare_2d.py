"""
2D function comparison tools for algebra visualization.
"""
from typing import Optional, List
from tools.base import BaseVisualizationTool, ToolMetadata, ToolCategory
from core import (
    validate_functions_list, validate_range, ValidationError,
    parse_and_validate,
    ast_to_python, ast_to_display_string
)
from core.code_generation import generate_comparison_code
from core.renderer import render_manim_scene


class CompareFunctionsTool(BaseVisualizationTool):
    """
    Compare multiple mathematical functions on the same graph.
    Uses safe evaluation and template-based code generation.
    """

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="compare_functions",
            description=(
                "Compare multiple mathematical functions on the same graph. "
                "Perfect for showing how different functions relate to each other! "
                "Each function gets its own color and label."
            ),
            category=ToolCategory.ALGEBRA_2D,
            use_cases=[
                "Student asks to compare multiple functions (e.g., 'compare x, x^2, and x^3')",
                "Showing the difference between linear functions with different slopes",
                "Comparing similar functions to understand transformations",
                "Demonstrating how coefficients affect function behavior"
            ],
            examples=[
                {
                    "functions": "x, x^2, x^3",
                    "x_range": "-2,2",
                    "y_range": "-5,5"
                },
                {
                    "functions": "2*x + 1, 3*x - 2",
                    "labels": "Line A, Line B",
                    "title": "Comparing Linear Functions"
                },
                {
                    "functions": "sin(x), cos(x)",
                    "x_range": "-6.28,6.28",
                    "y_range": "-2,2"
                }
            ],
            related_tools=["plot_function", "show_transformation"]
        )

    def execute(
        self,
        functions: str,
        labels: Optional[str] = None,
        x_range: str = "-5,5",
        y_range: str = "-5,5",
        title: Optional[str] = None
    ) -> str:
        """
        Execute the compare_functions tool.

        Args:
            functions: Comma-separated list of functions (e.g., "x, x^2, x^3")
            labels: Optional comma-separated labels (e.g., "f(x), g(x), h(x)")
                   If not provided, will use f_0(x), f_1(x), etc.
            x_range: X-axis range as "min,max" (default: "-5,5")
            y_range: Y-axis range as "min,max" (default: "-5,5")
            title: Custom title for the comparison visualization

        Returns:
            Status message with video path or error
        """
        try:
            # Validate inputs
            func_list = validate_functions_list(functions)
            x_min, x_max = validate_range(x_range, range_name="x_range")
            y_min, y_max = validate_range(y_range, range_name="y_range")

            # Parse labels if provided
            if labels:
                label_list = [l.strip() for l in labels.split(',')]
                if len(label_list) != len(func_list):
                    raise ValidationError(
                        f"Number of labels ({len(label_list)}) must match number of functions ({len(func_list)})",
                        suggestion="Either provide one label per function, or omit labels to use defaults",
                        example="functions='x, x^2', labels='Linear, Quadratic'"
                    )
            else:
                # Generate default labels
                label_list = [f"f_{{{i}}}(x)" for i in range(len(func_list))]

            # Parse functions to safe format using AST
            asts = [parse_and_validate(f, allowed_variables={'x'}) for f in func_list]
            parsed_funcs = [ast_to_python(ast) for ast in asts]

            # Prepare function data for template
            colors = ["BLUE", "RED", "GREEN", "YELLOW", "PURPLE"]
            func_data = []
            for i, (ast, parsed, label) in enumerate(zip(asts, parsed_funcs, label_list)):
                func_data.append({
                    "expression": parsed,
                    "label": label,
                    "display": ast_to_display_string(ast),
                    "color": colors[i % len(colors)]
                })

            # Generate Manim code using safe templates
            scene_code = generate_comparison_code(
                functions=func_data,
                x_range=(x_min, x_max),
                y_range=(y_min, y_max),
                title=title
            )

            # Render the scene
            return render_manim_scene(scene_code, quality="medium_quality")

        except ValidationError as e:
            return str(e)
        except Exception as e:
            return f"❌ Error creating comparison: {str(e)}"
