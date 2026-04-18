"""
SymPy-based mathematical expression handling.
Provides a clean API wrapping SymPy's powerful symbolic math capabilities.
"""
from typing import Dict, Set, Union
import numpy as np

from sympy import (
    Symbol,
    sin, cos, tan, sqrt, log, exp, ln, Abs,
    sinh, cosh, tanh, asin, acos, atan,
    pi, E, floor, ceiling,
    lambdify
)
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor
)
from sympy.core.function import Function, AppliedUndef
from sympy.core.numbers import Number as SympyNumber
from core.exceptions import ParseError, ValidationError


# ============================================================================
# CONSTANTS & CONFIGURATION
# ============================================================================

# Function name -> SymPy object mapping
# Allows for users to input arcsin, and sympy needs to use `asin`
FUNCTION_MAP = {
    'sin': sin,
    'cos': cos,
    'tan': tan,
    'sqrt': sqrt,
    'abs': Abs,
    'ln': ln,
    'log': log,
    'exp': exp,
    'sinh': sinh,
    'cosh': cosh,
    'tanh': tanh,
    'asin': asin,
    'acos': acos,
    'atan': atan,
    'arcsin': asin,  # Alias for common notation
    'arccos': acos,  # Alias for common notation
    'arctan': atan,  # Alias for common notation
    'floor': floor,
    'ceil': ceiling,  # Alias (SymPy uses 'ceiling')
    'ceiling': ceiling,
}

# Allowed function names (derived from FUNCTION_MAP keys)
ALLOWED_FUNCTIONS = set(FUNCTION_MAP.keys())

# Default allowed variables
DEFAULT_ALLOWED_VARIABLES = {'x', 'y', 'z', 't', 'u', 'v'}

# Maximum complexity (number of atoms) to prevent DoS attacks
MAX_COMPLEXITY = 1000


# ============================================================================
# MAIN PARSING & VALIDATION
# ============================================================================

def parse_and_validate(
    expression: str,
    allowed_variables: Set[str] = None
) -> 'MathExpression':
    """
    Parse and validate a mathematical expression using SymPy.

    This is the main entry point for processing user input.

    Args:
        expression: Mathematical expression string (e.g., "3x^2 + sin(x)")
        allowed_variables: Set of allowed variable names (default: x, y, z, t, u, v)

    Returns:
        MathExpression object wrapping the parsed SymPy expression

    Raises:
        ParseError: If expression has invalid syntax
        ValidationError: If expression contains unsafe operations

    Examples:
        >>> expr = parse_and_validate("3x^2 + sin(x)")
        >>> expr.to_python()
        "3*x**2 + numpy.sin(x)"
        >>> expr.evaluate_at_point(2)
        12.909...
    """
    # Validate input
    if not expression or not expression.strip():
        raise ParseError("Expression cannot be empty")

    if allowed_variables is None:
        allowed_variables = DEFAULT_ALLOWED_VARIABLES.copy()

    # Build local_dict: restricts parse_expr to allowed vars/funcs (security + correct symbolic math)
    local_dict = _build_local_dict(allowed_variables)

    # Parse the expression string into a SymPy AST
    try:
        transformations = (
            standard_transformations +
            # implicit multiplication = 3x -> 3 * x
            # convert_xor = 3^x = 3**x
            (implicit_multiplication_application, convert_xor)
        )

        sympy_expr = parse_expr(
            expression,
            local_dict=local_dict,  # Controls what's available during parsing
            transformations=transformations,
            evaluate=False  # Don't automatically simplify
        )

    except Exception as e:
        raise ParseError(f"Failed to parse expression: {str(e)}")

    # Validate the parsed AST for security
    _validate_expression(sympy_expr, allowed_variables)

    # Wrap in our API class
    return MathExpression(sympy_expr, expression)


def _build_local_dict(allowed_variables: Set[str]) -> Dict:
    """
    Build local_dict for SymPy's parse_expr.
    
    local_dict restricts parse_expr to only allowed names, preventing:
    - Security: accessing Python globals/dangerous builtins
    - Wrong functions: Python built-ins instead of SymPy functions
    - Missing assumptions: variables without proper properties (e.g., real=True)
    
    Args:
        allowed_variables: Set of allowed variable names
        
    Returns:
        Dictionary mapping names to SymPy objects
    """
    local_dict = {}
    
    # Create Symbol objects for allowed variables
    for var in allowed_variables:
        local_dict[var] = Symbol(var, real=True)
    
    # Add mathematical constants
    local_dict['pi'] = pi
    local_dict['e'] = E
    
    # Add allowed functions from FUNCTION_MAP
    local_dict.update(FUNCTION_MAP)
    
    return local_dict


def _validate_expression(expr, allowed_variables: Set[str]) -> None:
    """
    Validate that a SymPy expression is safe to evaluate.

    Performs security checks:
    1. All variables must be in the allowed list
    2. All functions must be in the whitelist
    3. Expression complexity must be below threshold

    Args:
        expr: SymPy expression to validate
        allowed_variables: Set of allowed variable names

    Raises:
        ValidationError: If expression contains forbidden operations
    """
    # Check 1: Validate variables
    variables = {str(symbol) for symbol in expr.free_symbols}
    unknown_vars = variables - allowed_variables
    if unknown_vars:
        raise ValidationError(
            f"Unknown variable(s): {', '.join(sorted(unknown_vars))}",
            suggestion=f"Use one of: {', '.join(sorted(allowed_variables))}",
            example="x or y"
        )

    # Check 2: Validate functions
    # Traverse AST to find all function applications
    # Use find() to recursively find all Function instances in the expression tree
    function_names = set()
    for func in expr.find(Function):
        # Skip if it's a number (some constants are Function instances)
        if isinstance(func, SympyNumber):
            continue
        
        func_name = func.__class__.__name__.lower()
        
        # Normalize SymPy class names to our function names
        if func_name == 'arcsin':
            func_name = 'asin'
        elif func_name == 'arccos':
            func_name = 'acos'
        elif func_name == 'arctan':
            func_name = 'atan'
            
        function_names.add(func_name)

    # Validate against allowed functions
    unknown_funcs = function_names - ALLOWED_FUNCTIONS
    if unknown_funcs:
        raise ValidationError(
            f"Unknown or forbidden function(s): {', '.join(sorted(unknown_funcs))}",
            suggestion=f"Use one of: {', '.join(sorted(ALLOWED_FUNCTIONS))}",
            example="sin(x) or cos(x)"
        )

    # Check 3: Validate complexity (prevent DoS attacks)
    operation_count = len(list(expr.atoms()))
    if operation_count > MAX_COMPLEXITY:
        raise ValidationError(
            f"Expression is too complex ({operation_count} operations)",
            suggestion="Simplify your expression",
            example="Break complex expressions into smaller parts"
        )


# ============================================================================
# MATH EXPRESSION CLASS
# ============================================================================

class MathExpression:
    """
    Wrapper around SymPy expressions that provides our API.

    This class wraps SymPy's internal AST representation and provides
    convenient methods for conversion and evaluation.

    The underlying SymPy expression (AST) is accessed via .sympy_expr property.
    """

    def __init__(self, sympy_expr, original_str: str = None):
        """
        Initialize with a SymPy expression.

        Args:
            sympy_expr: SymPy expression object (the AST)
            original_str: Original input string (for error messages)
        """
        self._expr = sympy_expr
        self._original = original_str

    # ========================================================================
    # Conversion Methods
    # ========================================================================

    def to_python(self, use_numpy: bool = True) -> str:
        """
        Convert expression to Python code string.

        Args:
            use_numpy: If True, use numpy functions (numpy.sin), else plain (sin)

        Returns:
            Python code string ready for execution

        Examples:
            >>> expr = MathExpression(parse_expr("3x^2 + sin(x)"))
            >>> expr.to_python()
            "3*x**2 + numpy.sin(x)"
        """
        if use_numpy:
            # Use NumPy printer for numpy functions
            from sympy.printing.numpy import NumPyPrinter
            return NumPyPrinter().doprint(self._expr)
        else:
            # Use standard Python printer
            from sympy.printing.pycode import PythonCodePrinter
            return PythonCodePrinter().doprint(self._expr)

    def to_display_string(self) -> str:
        """
        Convert to human-readable display string.

        Returns:
            Display string in natural math notation (e.g., uses ^ instead of **)

        Examples:
            >>> expr = MathExpression(parse_expr("x**2"))
            >>> expr.to_display_string()
            "x^2"
        """
        display = str(self._expr)

        # Replace ** with ^ for display
        display = display.replace('**', '^')

        # Replace some SymPy syntax with cleaner versions
        display = display.replace('asin', 'arcsin')
        display = display.replace('acos', 'arccos')
        display = display.replace('atan', 'arctan')
        display = display.replace('Abs', 'abs')
        display = display.replace('ceiling', 'ceil')

        return display

    # ========================================================================
    # Evaluation Methods
    # ========================================================================

    def evaluate(self, variables: Dict[str, float]) -> Union[float, np.ndarray]:
        """
        Evaluate expression with given variable values.

        Args:
            variables: Dictionary mapping variable names to values

        Returns:
            Evaluated result (float for scalars, np.ndarray for arrays)

        Examples:
            >>> expr = parse_and_validate("x^2 + y^2")
            >>> expr.evaluate({'x': 3, 'y': 4})
            25.0
        """
        # Get all free symbols in the expression
        free_vars = sorted(self._expr.free_symbols, key=lambda s: str(s))

        if not free_vars:
            # No variables, just evaluate directly
            return float(self._expr.evalf())

        # Create a lambdified function for fast evaluation
        func = lambdify(free_vars, self._expr, 'numpy')

        # Extract values in the same order as free_vars
        try:
            values = [variables[str(var)] for var in free_vars]
            result = func(*values)

            # Handle numpy arrays vs scalars
            if isinstance(result, np.ndarray):
                return result
            return float(result)
        except KeyError as e:
            raise ValueError(f"Missing variable value: {e}")

    def evaluate_at_point(self, x: float, y: float = None) -> float:
        """
        Evaluate expression at a specific point (convenience method).

        Args:
            x: X coordinate value
            y: Y coordinate value (for 3D functions, optional)

        Returns:
            Result value as float

        Examples:
            >>> expr = parse_and_validate("x^2")
            >>> expr.evaluate_at_point(3)
            9.0
        """
        variables = {'x': x}
        if y is not None:
            variables['y'] = y

        return float(self.evaluate(variables))

    # ========================================================================
    # Inspection Methods
    # ========================================================================

    def get_variables(self) -> Set[str]:
        """
        Get all variables used in the expression.

        Returns:
            Set of variable names

        Examples:
            >>> expr = parse_and_validate("x^2 + y^2")
            >>> expr.get_variables()
            {'x', 'y'}
        """
        return {str(symbol) for symbol in self._expr.free_symbols}

    @property
    def sympy_expr(self):
        """
        Get the underlying SymPy expression (AST).

        Returns:
            The SymPy expression object
        """
        return self._expr

    def __repr__(self) -> str:
        return f"MathExpression({self._expr})"


# ============================================================================
# CONVENIENCE WRAPPER FUNCTIONS
# ============================================================================

def ast_to_python(expr: MathExpression, use_numpy: bool = True) -> str:
    """
    Convert MathExpression to Python code string.

    Convenience wrapper around MathExpression.to_python().

    Args:
        expr: MathExpression object
        use_numpy: If True, use numpy functions

    Returns:
        Python code string
    """
    return expr.to_python(use_numpy=use_numpy)


def ast_to_display_string(expr: MathExpression) -> str:
    """
    Convert MathExpression to human-readable display string.

    Convenience wrapper around MathExpression.to_display_string().

    Args:
        expr: MathExpression object

    Returns:
        Display string
    """
    return expr.to_display_string()


def safe_eval_at_point(expr: MathExpression, x: float, y: float = None) -> float:
    """
    Safely evaluate expression at a point.

    Convenience wrapper around MathExpression.evaluate_at_point().

    Args:
        expr: MathExpression object
        x: X coordinate value
        y: Y coordinate value (optional)

    Returns:
        Evaluated result
    """
    return expr.evaluate_at_point(x, y)
