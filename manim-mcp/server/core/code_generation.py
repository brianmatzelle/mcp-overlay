"""
Safe Manim code generation using templates.
Replaces dangerous f-string interpolation with structured approach.
"""
from typing import Optional, List, Dict, Tuple
from jinja2 import Environment, BaseLoader, Template


# Template for 2D function plotting
PLOT_2D_TEMPLATE = """from manim import *
import numpy

class AlgebraVisualization(Scene):
    def construct(self):
        # Create axes
        axes = Axes(
            x_range=[{{ x_min }}, {{ x_max }}, 1],
            y_range=[{{ y_min }}, {{ y_max }}, 1],
            x_length={{ x_length }},
            y_length={{ y_length }},
            axis_config={"color": WHITE},
            tips=False
        )
        {% if has_title -%}
        axes.shift(DOWN * 0.5)
        {% endif -%}

        axes_labels = axes.get_axis_labels(x_label="x", y_label="f(x)")

        graph = axes.plot(lambda x: {{ function }}, color={{ color }}, x_range=[{{ x_min }}, {{ x_max }}], use_smoothing=False)

        {% if title -%}
        # Add title
        title_text = Text('{{ title }}', font_size=36)
        title_text.to_edge(UP, buff=0.3)
        {% endif -%}

        # Animate creation
        self.play(Create(axes), Write(axes_labels))
        {% if title -%}
        self.play(Write(title_text))
        {% endif -%}
        self.play(Create(graph), run_time=2)

        {% if highlight_points -%}
        # Highlight points
        {% for point in highlight_points -%}
        point_{{ loop.index0 }} = Dot(axes.coords_to_point({{ point.x }}, {{ point.y }}), color=YELLOW, radius=0.08)
        point_{{ loop.index0 }}_label = MathTex(r"({{ "%.1f"|format(point.x) }}, {{ "%.1f"|format(point.y) }})", font_size=28).next_to(point_{{ loop.index0 }}, UR, buff=0.1)
        self.play(FadeIn(point_{{ loop.index0 }}), Write(point_{{ loop.index0 }}_label))
        {% endfor -%}
        {% endif -%}

        {% if show_slope and slope_data -%}
        # Show slope with rise and run
        rise_line = DashedLine(
            axes.coords_to_point({{ slope_data.x_start }}, {{ slope_data.y_start }}),
            axes.coords_to_point({{ slope_data.x_start }}, {{ slope_data.y_end }}),
            color=RED
        )
        rise_label = Text("rise", font_size=20, color=RED).next_to(rise_line, LEFT)

        run_line = DashedLine(
            axes.coords_to_point({{ slope_data.x_start }}, {{ slope_data.y_start }}),
            axes.coords_to_point({{ slope_data.x_end }}, {{ slope_data.y_start }}),
            color=GREEN
        )
        run_label = Text("run", font_size=20, color=GREEN).next_to(run_line, DOWN)

        self.play(Create(rise_line), Create(run_line), Write(rise_label), Write(run_label))
        {% endif -%}

        self.wait(2)
"""


# Template for 3D surface plotting
PLOT_3D_TEMPLATE = """from manim import *
import numpy

class Surface3D(ThreeDScene):
    def construct(self):
        # Set up 3D axes
        axes = ThreeDAxes(
            x_range=[{{ x_min }}, {{ x_max }}, 1],
            y_range=[{{ y_min }}, {{ y_max }}, 1],
            z_range=[{{ z_min }}, {{ z_max }}, 1],
            x_length=6,
            y_length=6,
            z_length={{ z_length }},
        )
        {% if has_title -%}
        axes.shift(DOWN * 0.3)
        {% endif -%}

        {% if title -%}
        # Add title
        title_text = Text('{{ title }}', font_size=32)
        title_text.to_edge(UP, buff=0.3)
        self.add_fixed_in_frame_mobjects(title_text)
        {% endif -%}

        # Create the surface
        surface = Surface(
            lambda u, v: axes.c2p(u, v, {{ function }}),
            u_range=[{{ x_min }}, {{ x_max }}],
            v_range=[{{ y_min }}, {{ y_max }}],
            resolution=(20, 20),
        )

        # Apply color gradient based on z-height
        surface.set_fill_by_value(
            axes=axes,
            colors=[{{ colors }}],
            axis=2  # Color by z-axis
        )

        # Set camera orientation
        self.set_camera_orientation(phi=75 * DEGREES, theta=30 * DEGREES)

        # Add axes and surface
        {% if show_axes -%}
        self.play(Create(axes), run_time=1)
        {% endif -%}
        self.play(Create(surface), run_time=1.5)

        # Rotate the camera to show the surface from different angles
        self.begin_ambient_camera_rotation(rate={{ rotation_speed }})
        self.wait(3)
        self.stop_ambient_camera_rotation()

        self.wait(0.5)
"""


# Template for comparing 3D surfaces
COMPARE_3D_SURFACES_TEMPLATE = """from manim import *
import numpy

class Compare3DSurfaces(ThreeDScene):
    def construct(self):
        # Set camera orientation
        self.set_camera_orientation(phi=75 * DEGREES, theta=30 * DEGREES)

        {% if title -%}
        title_text = Text('{{ title }}', font_size=36)
        title_text.to_edge(UP, buff=0.3)
        self.add_fixed_in_frame_mobjects(title_text)
        self.play(Write(title_text))
        {% endif -%}

        {% for surf in surfaces -%}
        # Surface {{ loop.index }}: {{ surf.label }}
        axes_{{ loop.index0 }} = ThreeDAxes(
            x_range=[{{ x_min }}, {{ x_max }}, 1],
            y_range=[{{ y_min }}, {{ y_max }}, 1],
            z_range=[{{ z_min }}, {{ z_max }}, 1],
            x_length=4,
            y_length=4,
            z_length={{ z_length }},
        ).shift({{ surf.shift }})

        surface_{{ loop.index0 }} = Surface(
            lambda u, v: axes_{{ loop.index0 }}.c2p(u, v, {{ surf.expression }}),
            u_range=[{{ x_min }}, {{ x_max }}],
            v_range=[{{ y_min }}, {{ y_max }}],
            resolution=(15, 15),
        )
        surface_{{ loop.index0 }}.set_color({{ surf.color }})
        surface_{{ loop.index0 }}.set_opacity(0.8)

        label_{{ loop.index0 }} = Text('{{ surf.label }}', font_size=24, color={{ surf.color }})
        label_{{ loop.index0 }}.next_to(axes_{{ loop.index0 }}, DOWN)
        self.add_fixed_in_frame_mobjects(label_{{ loop.index0 }})

        self.play(Create(axes_{{ loop.index0 }}), Create(surface_{{ loop.index0 }}), Write(label_{{ loop.index0 }}), run_time=1.5)
        {% endfor -%}

        # Rotate camera to show all surfaces
        self.begin_ambient_camera_rotation(rate=0.2)
        self.wait(3)
        self.stop_ambient_camera_rotation()

        self.wait(0.5)
"""


# Template for 3D transformation
TRANSFORMATION_3D_TEMPLATE = """from manim import *
import numpy

class Transform3DSurface(ThreeDScene):
    def construct(self):
        # Set camera
        self.set_camera_orientation(phi=75 * DEGREES, theta=30 * DEGREES)

        # Create axes
        axes = ThreeDAxes(
            x_range=[{{ x_min }}, {{ x_max }}, 1],
            y_range=[{{ y_min }}, {{ y_max }}, 1],
            z_range=[{{ z_min }}, {{ z_max }}, 1],
            x_length=6,
            y_length=6,
            z_length={{ z_length }},
        )

        # Original surface
        surface_orig = Surface(
            lambda u, v: axes.c2p(u, v, {{ original_expression }}),
            u_range=[{{ x_min }}, {{ x_max }}],
            v_range=[{{ y_min }}, {{ y_max }}],
            resolution=(15, 15),
        )
        surface_orig.set_color(BLUE)

        # Transformed surface
        surface_trans = Surface(
            lambda u, v: axes.c2p(u, v, {{ transformed_expression }}),
            u_range=[{{ x_min }}, {{ x_max }}],
            v_range=[{{ y_min }}, {{ y_max }}],
            resolution=(15, 15),
        )
        surface_trans.set_color(RED)

        {% if explanation -%}
        explanation = Text('{{ explanation }}', font_size=28)
        explanation.to_edge(DOWN, buff=0.5)
        self.add_fixed_in_frame_mobjects(explanation)
        {% endif -%}

        # Show original
        self.play(Create(axes), run_time=1)
        self.play(Create(surface_orig), run_time=1.5)
        self.wait(0.5)

        {% if explanation -%}
        self.play(Write(explanation), run_time=1)
        {% endif -%}

        # Transform
        self.play(Transform(surface_orig, surface_trans), run_time=2)

        # Rotate to show result
        self.begin_ambient_camera_rotation(rate=0.2)
        self.wait(2.5)
        self.stop_ambient_camera_rotation()

        self.wait(0.5)
"""


# Template for function comparison
COMPARE_FUNCTIONS_TEMPLATE = """from manim import *
import numpy

class ComparisonScene(Scene):
    def construct(self):
        # Create axes
        axes = Axes(
            x_range=[{{ x_min }}, {{ x_max }}, 1],
            y_range=[{{ y_min }}, {{ y_max }}, 1],
            x_length={{ x_length }},
            y_length={{ y_length }},
            axis_config={"color": WHITE},
            tips=False
        )
        {% if has_title -%}
        axes.shift(DOWN * 0.5)
        {% endif -%}

        axes_labels = axes.get_axis_labels(x_label="x", y_label="y")

        {% if title -%}
        title_text = Text('{{ title }}', font_size=36)
        title_text.to_edge(UP, buff=0.3)
        {% endif -%}

        self.play(Create(axes), Write(axes_labels))
        {% if title -%}
        self.play(Write(title_text))
        {% endif -%}

        {% for func in functions -%}
        # Function {{ loop.index }}: {{ func.label }}
        graph_{{ loop.index0 }} = axes.plot(lambda x: {{ func.expression }}, color={{ func.color }}, x_range=[{{ x_min }}, {{ x_max }}], use_smoothing=False)
        label_{{ loop.index0 }} = MathTex(r"{{ func.label }} = {{ func.display }}", color={{ func.color }}, font_size=32)
        label_{{ loop.index0 }}.to_corner(UR).shift(DOWN * {{ loop.index0 * 0.7 }})
        self.play(Create(graph_{{ loop.index0 }}), Write(label_{{ loop.index0 }}), run_time=1.5)
        {% endfor -%}

        self.wait(2)
"""


# Template for function transformation
TRANSFORMATION_TEMPLATE = """from manim import *
import numpy

class TransformationScene(Scene):
    def construct(self):
        # Create axes
        axes = Axes(
            x_range=[{{ x_min }}, {{ x_max }}, 1],
            y_range=[{{ y_min }}, {{ y_max }}, 1],
            x_length={{ x_length }},
            y_length={{ y_length }},
            axis_config={"color": WHITE},
            tips=False
        )
        {% if has_explanation -%}
        axes.shift(UP * 0.5)
        {% endif -%}

        axes_labels = axes.get_axis_labels(x_label="x", y_label="y")

        graph_orig = axes.plot(lambda x: {{ original_expression }}, color=BLUE, x_range=[{{ x_min }}, {{ x_max }}], use_smoothing=False)
        label_orig = MathTex(r"f(x) = {{ original_display }}", color=BLUE, font_size=32).to_corner(UL, buff=0.5)

        graph_trans = axes.plot(lambda x: {{ transformed_expression }}, color=RED, x_range=[{{ x_min }}, {{ x_max }}], use_smoothing=False)
        label_trans = MathTex(r"g(x) = {{ transformed_display }}", color=RED, font_size=32).next_to(label_orig, DOWN, aligned_edge=LEFT)

        {% if explanation -%}
        explanation = Text('{{ explanation }}', font_size=28)
        explanation.to_edge(DOWN, buff=0.5)
        {% endif -%}

        # Animate
        self.play(Create(axes), Write(axes_labels))
        self.play(Create(graph_orig), Write(label_orig))
        self.wait()

        {% if explanation -%}
        self.play(Write(explanation))
        {% endif -%}

        self.play(Transform(graph_orig.copy(), graph_trans), Write(label_trans), run_time=2)
        self.play(Create(graph_trans))

        self.wait(2)
"""


class ManimCodeGenerator:
    """Generate Manim scene code using safe templates."""

    def __init__(self):
        self.env = Environment(loader=BaseLoader())

    def _escape_text(self, text: str) -> str:
        """Escape text for safe insertion into templates."""
        return text.replace("'", "\\'").replace('"', '\\"')

    def generate_2d_plot(
        self,
        function: str,
        x_range: Tuple[float, float],
        y_range: Tuple[float, float],
        color: str = "BLUE",
        title: Optional[str] = None,
        highlight_points: Optional[List[Tuple[float, float]]] = None,
        show_slope: bool = False,
        slope_data: Optional[Dict] = None
    ) -> str:
        """
        Generate Manim code for 2D function plot.

        Args:
            function: Parsed function expression (safe, already validated)
            x_range: (x_min, x_max) tuple
            y_range: (y_min, y_max) tuple
            color: Manim color name
            title: Optional title text
            highlight_points: List of (x, y) tuples to highlight
            show_slope: Whether to show slope visualization
            slope_data: Data for slope visualization

        Returns:
            Manim Python code as string
        """
        x_min, x_max = x_range
        y_min, y_max = y_range

        # Determine layout sizing
        has_title = bool(title)
        y_length = 5.0 if has_title else 6.5
        x_length = min(10, x_max - x_min + 1)

        # Prepare highlight points
        points = []
        if highlight_points:
            for x, y in highlight_points:
                points.append({'x': x, 'y': y})

        template = self.env.from_string(PLOT_2D_TEMPLATE)
        return template.render(
            x_min=x_min,
            x_max=x_max,
            y_min=y_min,
            y_max=y_max,
            x_length=x_length,
            y_length=y_length,
            function=function,
            color=color,
            title=self._escape_text(title) if title else None,
            has_title=has_title,
            highlight_points=points if points else None,
            show_slope=show_slope,
            slope_data=slope_data
        )

    def generate_3d_surface(
        self,
        function: str,
        x_range: Tuple[float, float],
        y_range: Tuple[float, float],
        z_range: Tuple[float, float],
        color_scheme: List[str],
        title: Optional[str] = None,
        show_axes: bool = True,
        rotation_speed: float = 0.2
    ) -> str:
        """
        Generate Manim code for 3D surface plot.

        Args:
            function: Parsed 3D function expression
            x_range: (x_min, x_max) tuple
            y_range: (y_min, y_max) tuple
            z_range: (z_min, z_max) tuple
            color_scheme: List of Manim color names
            title: Optional title text
            show_axes: Whether to show axes
            rotation_speed: Camera rotation speed

        Returns:
            Manim Python code as string
        """
        x_min, x_max = x_range
        y_min, y_max = y_range
        z_min, z_max = z_range

        has_title = bool(title)
        z_length = 3.5 if has_title else 4.0

        # Convert color list to comma-separated string (without quotes)
        # e.g., ['BLUE', 'RED'] -> 'BLUE, RED'
        colors_str = ', '.join(color_scheme)

        template = self.env.from_string(PLOT_3D_TEMPLATE)
        return template.render(
            x_min=x_min,
            x_max=x_max,
            y_min=y_min,
            y_max=y_max,
            z_min=z_min,
            z_max=z_max,
            z_length=z_length,
            function=function,
            colors=colors_str,
            title=self._escape_text(title) if title else None,
            has_title=has_title,
            show_axes=show_axes,
            rotation_speed=rotation_speed
        )

    def generate_comparison(
        self,
        functions: List[Dict[str, str]],
        x_range: Tuple[float, float],
        y_range: Tuple[float, float],
        title: Optional[str] = None
    ) -> str:
        """
        Generate Manim code for function comparison.

        Args:
            functions: List of dicts with keys: expression, label, display, color
            x_range: (x_min, x_max) tuple
            y_range: (y_min, y_max) tuple
            title: Optional title text

        Returns:
            Manim Python code as string
        """
        x_min, x_max = x_range
        y_min, y_max = y_range

        has_title = bool(title)
        y_length = 5.0 if has_title else 6.5
        x_length = min(10, x_max - x_min + 1)

        template = self.env.from_string(COMPARE_FUNCTIONS_TEMPLATE)
        return template.render(
            x_min=x_min,
            x_max=x_max,
            y_min=y_min,
            y_max=y_max,
            x_length=x_length,
            y_length=y_length,
            functions=functions,
            title=self._escape_text(title) if title else None,
            has_title=has_title
        )

    def generate_transformation(
        self,
        original_function: str,
        transformed_function: str,
        original_display: str,
        transformed_display: str,
        x_range: Tuple[float, float],
        y_range: Tuple[float, float],
        explanation: Optional[str] = None
    ) -> str:
        """
        Generate Manim code for function transformation visualization.

        Args:
            original_function: Parsed original function expression
            transformed_function: Parsed transformed function expression
            original_display: Display version of original function
            transformed_display: Display version of transformed function
            x_range: (x_min, x_max) tuple
            y_range: (y_min, y_max) tuple
            explanation: Optional explanation text

        Returns:
            Manim Python code as string
        """
        x_min, x_max = x_range
        y_min, y_max = y_range

        has_explanation = bool(explanation)
        y_length = 5.5 if has_explanation else 6.5
        x_length = min(10, x_max - x_min + 1)

        template = self.env.from_string(TRANSFORMATION_TEMPLATE)
        return template.render(
            x_min=x_min,
            x_max=x_max,
            y_min=y_min,
            y_max=y_max,
            x_length=x_length,
            y_length=y_length,
            original_expression=original_function,
            transformed_expression=transformed_function,
            original_display=original_display,
            transformed_display=transformed_display,
            explanation=self._escape_text(explanation) if explanation else None,
            has_explanation=has_explanation
        )

    def generate_3d_comparison(
        self,
        surfaces: List[Dict[str, str]],
        x_range: Tuple[float, float],
        y_range: Tuple[float, float],
        z_range: Tuple[float, float],
        title: Optional[str] = None
    ) -> str:
        """
        Generate Manim code for 3D surface comparison.

        Args:
            surfaces: List of dicts with keys: expression, label, color, shift
            x_range: (x_min, x_max) tuple
            y_range: (y_min, y_max) tuple
            z_range: (z_min, z_max) tuple
            title: Optional title text

        Returns:
            Manim Python code as string
        """
        x_min, x_max = x_range
        y_min, y_max = y_range
        z_min, z_max = z_range

        has_title = bool(title)
        z_length = 2.5 if has_title else 3.0

        template = self.env.from_string(COMPARE_3D_SURFACES_TEMPLATE)
        return template.render(
            x_min=x_min,
            x_max=x_max,
            y_min=y_min,
            y_max=y_max,
            z_min=z_min,
            z_max=z_max,
            z_length=z_length,
            surfaces=surfaces,
            title=self._escape_text(title) if title else None
        )

    def generate_3d_transformation(
        self,
        original_function: str,
        transformed_function: str,
        x_range: Tuple[float, float],
        y_range: Tuple[float, float],
        z_range: Tuple[float, float],
        explanation: Optional[str] = None
    ) -> str:
        """
        Generate Manim code for 3D surface transformation visualization.

        Args:
            original_function: Parsed original function expression (with u, v)
            transformed_function: Parsed transformed function expression (with u, v)
            x_range: (x_min, x_max) tuple
            y_range: (y_min, y_max) tuple
            z_range: (z_min, z_max) tuple
            explanation: Optional explanation text

        Returns:
            Manim Python code as string
        """
        x_min, x_max = x_range
        y_min, y_max = y_range
        z_min, z_max = z_range

        z_length = 4.0  # Fixed z-length for 3D transformations

        template = self.env.from_string(TRANSFORMATION_3D_TEMPLATE)
        return template.render(
            x_min=x_min,
            x_max=x_max,
            y_min=y_min,
            y_max=y_max,
            z_min=z_min,
            z_max=z_max,
            z_length=z_length,
            original_expression=original_function,
            transformed_expression=transformed_function,
            explanation=self._escape_text(explanation) if explanation else None
        )


# Global generator instance
_generator = ManimCodeGenerator()


def generate_2d_plot_code(**kwargs) -> str:
    """Convenience function for 2D plot generation."""
    return _generator.generate_2d_plot(**kwargs)


def generate_3d_surface_code(**kwargs) -> str:
    """Convenience function for 3D surface generation."""
    return _generator.generate_3d_surface(**kwargs)


def generate_comparison_code(**kwargs) -> str:
    """Convenience function for comparison generation."""
    return _generator.generate_comparison(**kwargs)


def generate_transformation_code(**kwargs) -> str:
    """Convenience function for transformation generation."""
    return _generator.generate_transformation(**kwargs)


def generate_3d_comparison_code(**kwargs) -> str:
    """Convenience function for 3D surface comparison generation."""
    return _generator.generate_3d_comparison(**kwargs)


def generate_3d_transformation_code(**kwargs) -> str:
    """Convenience function for 3D transformation generation."""
    return _generator.generate_3d_transformation(**kwargs)
