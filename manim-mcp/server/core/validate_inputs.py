"""
Validation utilities for non-expression inputs.
Handles validation of colors, ranges, quality settings, etc.

Note: Expression validation is now handled by core.expression_parser
"""
from typing import List, Tuple

from core.exceptions import ValidationError


def validate_range(
    range_str: str,
    min_val: float = -100,
    max_val: float = 100,
    range_name: str = "range"
) -> Tuple[float, float]:
    """
    Validate and parse a range string.

    Args:
        range_str: Range string in format "min,max"
        min_val: Minimum allowed value
        max_val: Maximum allowed value
        range_name: Name of the range (for error messages)

    Returns:
        Tuple of (min, max) values

    Raises:
        ValidationError: If range is invalid
    """
    if not range_str or not range_str.strip():
        raise ValidationError(
            f"{range_name} cannot be empty",
            example="-5,5"
        )

    try:
        parts = range_str.split(',')
        if len(parts) != 2:
            raise ValidationError(
                f"Invalid {range_name} format",
                suggestion="Use format 'min,max' with exactly one comma",
                example="-5,5"
            )

        r_min, r_max = map(float, parts)

        if r_min >= r_max:
            raise ValidationError(
                f"Invalid {range_name}: minimum must be less than maximum",
                suggestion=f"Use {range_name} where min < max",
                example="-5,5"
            )

        if r_min < min_val or r_max > max_val:
            raise ValidationError(
                f"{range_name} values out of bounds",
                suggestion=f"Use values between {min_val} and {max_val}",
                example="-10,10"
            )

        return r_min, r_max

    except ValueError as e:
        if "could not convert" in str(e):
            raise ValidationError(
                f"Invalid {range_name}: values must be numbers",
                suggestion="Use numeric values for min and max",
                example="-5,5"
            )
        raise


def validate_color(color: str) -> str:
    """
    Validate that a color string is a valid Manim color.

    Args:
        color: Color name string

    Returns:
        Validated color name (uppercase)

    Raises:
        ValidationError: If color is not valid
    """
    VALID_COLORS = {
        'BLUE', 'RED', 'GREEN', 'YELLOW', 'PURPLE', 'ORANGE',
        'PINK', 'TEAL', 'GOLD', 'WHITE', 'BLACK', 'GRAY', 'GREY',
        'LIGHT_GRAY', 'DARK_GRAY', 'LIGHT_BLUE', 'DARK_BLUE',
        'LIGHT_GREEN', 'DARK_GREEN', 'MAROON'
    }

    color_upper = color.upper()
    if color_upper not in VALID_COLORS:
        raise ValidationError(
            f"Invalid color: '{color}'",
            suggestion=f"Use one of: {', '.join(sorted(VALID_COLORS))}",
            example="BLUE"
        )

    return color_upper


def validate_color_scheme(scheme: str) -> str:
    """
    Validate that a color scheme is valid for 3D surface gradients.

    Args:
        scheme: Color scheme name string

    Returns:
        Validated color scheme name (lowercase)

    Raises:
        ValidationError: If color scheme is not valid
    """
    VALID_SCHEMES = {
        'blue_to_red', 'green_to_yellow', 'rainbow', 'cool', 'warm'
    }

    scheme_lower = scheme.lower()
    if scheme_lower not in VALID_SCHEMES:
        raise ValidationError(
            f"Invalid color scheme: '{scheme}'",
            suggestion=f"Use one of: {', '.join(sorted(VALID_SCHEMES))}",
            example="blue_to_red"
        )

    return scheme_lower


def validate_quality(quality: str) -> str:
    """
    Validate render quality setting.

    Args:
        quality: Quality setting string

    Returns:
        Validated quality string

    Raises:
        ValidationError: If quality is not valid
    """
    VALID_QUALITIES = {'low_quality', 'medium_quality', 'high_quality', 'production_quality'}

    if quality not in VALID_QUALITIES:
        raise ValidationError(
            f"Invalid quality: '{quality}'",
            suggestion=f"Use one of: {', '.join(sorted(VALID_QUALITIES))}",
            example="medium_quality"
        )

    return quality


def validate_functions_list(functions: str) -> List[str]:
    """
    Validate a semicolon-separated list of function expressions.

    Args:
        functions: Semicolon-separated function strings (e.g., "x^2; 2*x + 1; sin(x)")

    Returns:
        List of validated function strings

    Raises:
        ValidationError: If any function is invalid
    """
    if not functions or not functions.strip():
        raise ValidationError(
            "Functions list cannot be empty",
            example="x^2; 2*x + 1; sin(x)"
        )

    func_list = [f.strip() for f in functions.split(';')]  # Use semicolon to avoid conflict with commas in functions

    if len(func_list) > 5:
        raise ValidationError(
            "Too many functions to compare",
            suggestion="Limit to 5 functions or fewer for clarity",
            example="x^2; 2*x; x"
        )

    return func_list


def validate_positive_number(value: float, name: str = "value", max_val: float = None) -> float:
    """
    Validate that a number is positive.

    Args:
        value: Number to validate
        name: Name of the value (for error messages)
        max_val: Optional maximum value

    Returns:
        Validated number

    Raises:
        ValidationError: If number is not positive or exceeds max
    """
    if value <= 0:
        raise ValidationError(
            f"{name} must be positive",
            suggestion=f"Use a {name} greater than 0",
            example="1.0"
        )

    if max_val is not None and value > max_val:
        raise ValidationError(
            f"{name} is too large",
            suggestion=f"Use a {name} less than or equal to {max_val}",
            example=str(max_val / 2)
        )

    return value
