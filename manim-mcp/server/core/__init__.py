"""
Core functionality for the Manim MCP server.

This package contains:
- exceptions: Common exception classes
- expression_parser: SymPy-based mathematical expression handling
- validate_inputs: Validation utilities (ranges, colors, etc.)
- code_generation: Template-based Manim code generation
- renderer: Safe Manim scene rendering
"""
# Common exceptions
from core.exceptions import ParseError, ValidationError

# SymPy-based math processing
from core.expression_parser import (
    MathExpression,
    parse_and_validate,
    ast_to_python,
    ast_to_display_string,
    safe_eval_at_point,
)

# Validation utilities (non-expression validation)
from core.validate_inputs import (
    validate_range,
    validate_color,
    validate_color_scheme,
    validate_quality,
    validate_functions_list,
    validate_positive_number,
)

# Code generation and rendering
from core.code_generation import (
    generate_2d_plot_code,
    generate_3d_surface_code,
    generate_comparison_code,
    ManimCodeGenerator
)
from core.renderer import render_manim_scene

__all__ = [
    # Expression handling
    'MathExpression',
    'parse_and_validate',
    'ast_to_python',
    'ast_to_display_string',
    'safe_eval_at_point',
    'ParseError',
    'ValidationError',

    # Validation
    'validate_range',
    'validate_color',
    'validate_color_scheme',
    'validate_quality',
    'validate_functions_list',
    'validate_positive_number',

    # Manim code generation
    'generate_2d_plot_code',
    'generate_3d_surface_code',
    'generate_comparison_code',
    'ManimCodeGenerator',

    # Rendering
    'render_manim_scene',
]
