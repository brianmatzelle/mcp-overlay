"""
3D surface comparison tools for advanced visualization.
"""
from typing import Optional, List
from tools.base import BaseVisualizationTool, ToolMetadata, ToolCategory
from core import (
    validate_functions_list, validate_range, ValidationError,
    parse_and_validate,
    ast_to_python
)
from core.code_generation import generate_3d_comparison_code
from core.renderer import render_manim_scene


class Compare3DSurfacesTool(BaseVisualizationTool):
    """
    Compare multiple 3D surfaces side by side.
    Uses safe evaluation and template-based code generation.
    """

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="compare_3d_surfaces",
            description=(
                "Compare multiple 3D surfaces side by side with rotating camera view. "
                "Great for showing how different 3D functions differ! "
                "Each surface gets its own color and label."
            ),
            category=ToolCategory.ALGEBRA_3D,
            use_cases=[
                "Student asks to compare 3D functions (e.g., 'compare x^2 + y^2 and x^2 - y^2')",
                "Showing paraboloid vs saddle point",
                "Comparing different 3D shapes",
                "Teaching multivariable calculus concepts"
            ],
            examples=[
                {
                    "functions": "x**2 + y**2, x**2 - y**2",
                    "labels": "Paraboloid, Saddle"
                },
                {
                    "functions": "sin(x)*cos(y), cos(x)*sin(y)",
                    "title": "Trigonometric Surfaces"
                },
                {
                    "functions": "x*y, x**2*y",
                    "labels": "Linear, Quadratic"
                }
            ],
            related_tools=["plot_3d_surface", "show_3d_transformation"]
        )

    def execute(
        self,
        functions: str,
        labels: Optional[str] = None,
        x_range: str = "-3,3",
        y_range: str = "-3,3",
        z_range: str = "-5,5",
        title: Optional[str] = None
    ) -> str:
        """
        Execute the compare_3d_surfaces tool.

        Args:
            functions: Comma-separated list of z functions
                      (e.g., "x**2 + y**2, x**2 - y**2")
            labels: Optional comma-separated labels (e.g., "Paraboloid, Saddle")
                   If not provided, will use "Surface 1", "Surface 2", etc.
            x_range: X-axis range as "min,max" (default: "-3,3")
            y_range: Y-axis range as "min,max" (default: "-3,3")
            z_range: Z-axis range as "min,max" (default: "-5,5")
            title: Custom title for the comparison visualization

        Returns:
            Status message with video path or error
        """
        try:
            # Validate inputs
            func_list = validate_functions_list(functions)

            # Limit to 3 surfaces for clarity
            if len(func_list) > 3:
                raise ValidationError(
                    f"Too many surfaces to compare ({len(func_list)})",
                    suggestion="Limit to 3 surfaces for visual clarity",
                    example="x**2 + y**2, x**2 - y**2, x*y"
                )

            x_min, x_max = validate_range(x_range, range_name="x_range")
            y_min, y_max = validate_range(y_range, range_name="y_range")
            z_min, z_max = validate_range(z_range, range_name="z_range")

            # Parse labels if provided
            if labels:
                label_list = [l.strip() for l in labels.split(',')]
                if len(label_list) != len(func_list):
                    raise ValidationError(
                        f"Number of labels ({len(label_list)}) must match number of functions ({len(func_list)})",
                        suggestion="Either provide one label per function, or omit labels to use defaults",
                        example="functions='x**2, y**2', labels='X-squared, Y-squared'"
                    )
            else:
                # Generate default labels
                label_list = [f"Surface {i+1}" for i in range(len(func_list))]

            # Parse functions to safe format using AST
            asts = [parse_and_validate(f, allowed_variables={'x', 'y'}) for f in func_list]
            parsed_funcs = []
            for ast in asts:
                parsed = ast_to_python(ast)
                # Convert x,y to u,v for the surface parameterization
                surface_func = parsed.replace('x', 'u').replace('y', 'v')
                parsed_funcs.append(surface_func)

            # Prepare surface data for template
            colors = ["BLUE", "RED", "GREEN"]
            surf_data = []

            for i, (parsed, label) in enumerate(zip(parsed_funcs, label_list)):
                # Calculate horizontal offset for side-by-side positioning
                x_offset = (i - len(func_list)/2 + 0.5) * 5

                # Prepare shift code
                down_shift = 0.3 if title else 0
                if down_shift:
                    shift_code = f"RIGHT * {x_offset} + DOWN * {down_shift}"
                else:
                    shift_code = f"RIGHT * {x_offset}"

                surf_data.append({
                    "expression": parsed,
                    "label": label,
                    "color": colors[i],
                    "shift": shift_code
                })

            # Generate Manim code using safe templates
            scene_code = generate_3d_comparison_code(
                surfaces=surf_data,
                x_range=(x_min, x_max),
                y_range=(y_min, y_max),
                z_range=(z_min, z_max),
                title=title
            )

            # Render the scene (3D scenes need more time)
            # Use low_quality for faster testing, medium_quality for final output
            return render_manim_scene(scene_code, quality="low_quality", timeout=180)

        except ValidationError as e:
            return str(e)
        except Exception as e:
            return f"❌ Error creating 3D comparison: {str(e)}"
