import sys
import os
import tempfile
import subprocess
import re
from pathlib import Path
from typing import Optional, List, Dict, Tuple
from fastmcp import FastMCP
import numpy as np

# Add the manim directory to Python path
manim_path = Path(__file__).parent.parent.parent / "manim"
sys.path.insert(0, str(manim_path))

mcp = FastMCP("Manim MCP Server")

# Helper function to parse math expressions
def parse_function(func_str: str) -> str:
    """Convert natural math notation to Python-evaluable expression."""
    # Replace implicit multiplication (3x -> 3*x)
    func_str = re.sub(r'(\d)([a-zA-Z])', r'\1*\2', func_str)
    # Replace ^ with **
    func_str = func_str.replace('^', '**')
    # Handle common functions using word boundaries to avoid partial matches
    # Order matters: longer function names first
    func_str = re.sub(r'\bsqrt\b', 'np.sqrt', func_str)
    func_str = re.sub(r'\bsin\b', 'np.sin', func_str)
    func_str = re.sub(r'\bcos\b', 'np.cos', func_str)
    func_str = re.sub(r'\btan\b', 'np.tan', func_str)
    func_str = re.sub(r'\babs\b', 'np.abs', func_str)
    func_str = re.sub(r'\bln\b', 'np.log', func_str)
    func_str = re.sub(r'\blog\b', 'np.log10', func_str)
    func_str = re.sub(r'\bexp\b', 'np.exp', func_str)
    return func_str

def calculate_key_points(func_str: str, x_range: Tuple[float, float]) -> Dict[str, Tuple[float, float]]:
    """Calculate key points like intercepts for a function."""
    points = {}
    parsed = parse_function(func_str)
    
    try:
        # Y-intercept (x=0)
        y_int = eval(parsed.replace('x', '(0)'))
        points['y_intercept'] = (0, y_int)
    except:
        pass
    
    try:
        # Try to find x-intercept (y=0) by sampling
        x_vals = np.linspace(x_range[0], x_range[1], 1000)
        y_vals = [eval(parsed.replace('x', f'({x})')) for x in x_vals]
        # Find sign changes
        for i in range(len(y_vals)-1):
            if y_vals[i] * y_vals[i+1] < 0:
                points['x_intercept'] = (x_vals[i], 0)
                break
    except:
        pass
    
    points['origin'] = (0, 0)
    
    return points

# ============================================================================
# LAYOUT HELPER FUNCTIONS - Consistent spacing and sizing across tools
# ============================================================================

def generate_2d_axes_code(x_min: float, x_max: float, y_min: float, y_max: float, 
                          has_title: bool = False, has_explanation: bool = False) -> str:
    """
    Generate consistent 2D axes code with proper sizing based on what else is in the scene.
    
    Args:
        x_min, x_max: X-axis range
        y_min, y_max: Y-axis range
        has_title: Whether the scene will have a title at the top
        has_explanation: Whether the scene will have explanation text at the bottom
    
    Returns:
        Manim code string for creating and positioning axes
    """
    # Adjust height based on what else is in the scene
    if has_title and has_explanation:
        y_length = 5.0
    elif has_title or has_explanation:
        y_length = 6.5
    else:
        y_length = 7.0
    
    code = f"""        axes = Axes(
            x_range=[{x_min}, {x_max}, 1],
            y_range=[{y_min}, {y_max}, 1],
            x_length={min(10, x_max - x_min + 1)},
            y_length={y_length},
            axis_config={{"color": WHITE}},
            tips=False
        )"""
    
    # Add shift if title is present
    if has_title:
        code += "\n        axes.shift(DOWN * 0.5)"
    
    return code

def generate_3d_axes_code(x_min: float, x_max: float, y_min: float, y_max: float, 
                          z_min: float, z_max: float, has_title: bool = False) -> str:
    """
    Generate consistent 3D axes code with proper sizing.
    
    Args:
        x_min, x_max, y_min, y_max, z_min, z_max: Axis ranges
        has_title: Whether the scene will have a title at the top
    
    Returns:
        Manim code string for creating and positioning 3D axes
    """
    z_length = 3.5 if has_title else 4.0
    
    code = f"""        axes = ThreeDAxes(
            x_range=[{x_min}, {x_max}, 1],
            y_range=[{y_min}, {y_max}, 1],
            z_range=[{z_min}, {z_max}, 1],
            x_length=6,
            y_length=6,
            z_length={z_length},
        )"""
    
    # Add shift if title is present
    if has_title:
        code += "\n        axes.shift(DOWN * 0.3)"
    
    return code

def generate_title_code(title: str, is_3d: bool = False) -> str:
    """
    Generate consistent title code with proper positioning.
    
    Args:
        title: The title text (already escaped)
        is_3d: Whether this is for a 3D scene (needs add_fixed_in_frame_mobjects)
    
    Returns:
        Manim code string for creating and positioning title
    """
    font_size = 32 if is_3d else 36
    code = f"""        title_text = Text('{title}', font_size={font_size})
        title_text.to_edge(UP, buff=0.3)"""
    
    if is_3d:
        code += "\n        self.add_fixed_in_frame_mobjects(title_text)"
    
    return code

def generate_explanation_code(explanation: str, is_3d: bool = False) -> str:
    """
    Generate consistent explanation text code with proper positioning.
    
    Args:
        explanation: The explanation text (already escaped)
        is_3d: Whether this is for a 3D scene (needs add_fixed_in_frame_mobjects)
    
    Returns:
        Manim code string for creating and positioning explanation text
    """
    code = f"""        explanation = Text('{explanation}', font_size=28)
        explanation.to_edge(DOWN, buff=0.5)"""
    
    if is_3d:
        code += "\n        self.add_fixed_in_frame_mobjects(explanation)"
    
    return code

def _render_manim_code(scene_code: str, quality: str = "medium_quality", output_file: Optional[str] = None) -> str:
    """
    Helper function to render Manim code to video.
    Not exposed as a tool, used internally by other tools.
    """
    try:
        # Create a temporary file for the scene
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(scene_code)
            temp_file = f.name
        
        # Build the manim command
        cmd = [
            "manim",
            f"-q{quality[0]}",  # -ql, -qm, -qh, or -qp
            temp_file
        ]
        
        if output_file:
            cmd.extend(["-o", output_file])
        
        # Run manim
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(manim_path)
        )
        
        # Clean up temp file
        os.unlink(temp_file)
        
        if result.returncode == 0:
            # Extract video path from manim output
            # Manim outputs: "File ready at '/path/to/video.mp4'"
            # Remove ANSI color codes first
            output_clean = re.sub(r'\x1b\[[0-9;]*[mK]', '', result.stdout)
            
            # Join lines and search for the file path
            video_path = None
            
            # Look for pattern: 'File ready at' followed by a quoted path
            # The path might be on the next line, so we search the whole output
            file_ready_match = re.search(r"File ready.*?'([^']+\.mp4)'", output_clean, re.DOTALL)
            
            if file_ready_match:
                full_path = file_ready_match.group(1)
                # Clean up path - remove extra whitespace and newlines
                full_path = ''.join(full_path.split())
                # Extract relative path from media/videos/
                if 'media/videos/' in full_path:
                    video_path = full_path.split('media/videos/')[1]
            
            response = "✅ Scene rendered successfully!\n\n"
            
            if video_path:
                # Instruct to call show_video tool
                response += f"Video path: {video_path}\n\n"
                response += f"📹 Use the show_video tool with path '{video_path}' to display it."
            else:
                response += "📹 The animation has been generated!"
            
            return response
        else:
            return f"❌ Render failed:\n{result.stderr}"
            
    except Exception as e:
        return f"❌ Error rendering scene: {str(e)}"

@mcp.tool
def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"

@mcp.tool
def show_video(video_path: str) -> str:
    """
    Display a Manim video in the chat interface.
    
    Args:
        video_path: The relative path to the video file from media/videos/
                   (e.g., "tmpXXXXXX/720p30/Scene.mp4")
    
    Returns:
        A special format that the frontend will render as a video player
    """
    # Return in a format the frontend will detect and render as video
    return f"[DISPLAY_VIDEO:{video_path}]"

# ============================================================================
# ALGEBRA VISUALIZATION TOOLS (for tutoring)
# ============================================================================

@mcp.tool
def plot_function(
    function: str,
    x_range: str = "-5,5",
    y_range: str = "-5,5",
    highlight_points: Optional[str] = None,
    show_slope: bool = False,
    show_equation: bool = True,
    annotations: Optional[str] = None,
    color: str = "BLUE",
    title: Optional[str] = None
) -> str:
    """
    Plot a mathematical function with educational annotations.
    Perfect for answering student questions about algebra!
    
    Args:
        function: The function to plot (e.g., "3x + 1", "x^2", "sin(x)")
        x_range: X-axis range as "min,max" (default: "-5,5")
        y_range: Y-axis range as "min,max" (default: "-5,5")
        highlight_points: Comma-separated points to highlight: "origin", "y_intercept", 
                         "x_intercept", or coordinates like "2,5"
        show_slope: Show slope visualization for linear functions
        show_equation: Display the equation on the graph
        annotations: JSON-like string of point annotations (e.g., '{"0,1": "y-intercept"}')
        color: Function color (BLUE, RED, GREEN, YELLOW, etc.)
        title: Custom title for the visualization
    
    Returns:
        Path to the generated video file
    """
    try:
        # Parse ranges
        x_min, x_max = map(float, x_range.split(','))
        y_min, y_max = map(float, y_range.split(','))
        
        # Parse function
        parsed_func = parse_function(function)
        
        # Calculate key points
        key_points = calculate_key_points(function, (x_min, x_max))
        
        # Parse highlight points
        points_to_highlight = []
        if highlight_points:
            for point in highlight_points.split(','):
                point = point.strip()
                if point in key_points:
                    points_to_highlight.append(key_points[point])
                else:
                    try:
                        x, y = map(float, point.split(','))
                        points_to_highlight.append((x, y))
                    except:
                        pass
        
        # Prepare title
        has_title = title or show_equation
        if title:
            display_title = title.replace("'", "\\'")
        else:
            display_title = f'Graph of f(x) = {function}'.replace("'", "\\'")
        
        # Generate axes code using helper
        axes_code = generate_2d_axes_code(x_min, x_max, y_min, y_max, has_title=has_title)
        
        # Generate Manim code
        scene_code = f"""from manim import *
import numpy as np

class AlgebraVisualization(Scene):
    def construct(self):
        # Create axes
{axes_code}
"""
        
        # Add title if needed
        if has_title:
            title_code = generate_title_code(display_title, is_3d=False)
            scene_code += f"""
{title_code}
"""
        
        scene_code += f"""
        
        # Add grid and labels
        axes_labels = axes.get_axis_labels(x_label="x", y_label="f(x)")
        
        # Plot the function
        graph = axes.plot(lambda x: {parsed_func}, color={color}, x_range=[{x_min}, {x_max}])
"""
        
        scene_code += """
        # Animate creation
        self.play(Create(axes), Write(axes_labels))
"""
        
        if has_title:
            scene_code += """
        self.play(Write(title_text))
"""
        
        scene_code += """
        self.play(Create(graph), run_time=2)
        
        # Highlight points
"""
        
        # Add highlighted points
        for i, (px, py) in enumerate(points_to_highlight):
            scene_code += f"""
        point_{i} = Dot(axes.coords_to_point({px}, {py}), color=YELLOW, radius=0.08)
        point_{i}_label = MathTex(r"({px:.1f}, {py:.1f})", font_size=28).next_to(point_{i}, UR, buff=0.1)
        self.play(FadeIn(point_{i}), Write(point_{i}_label))
"""
        
        # Show slope for linear functions
        if show_slope and 'x**2' not in parsed_func and 'x**' not in parsed_func:
            # Calculate y values for slope demonstration
            try:
                y_at_x_min = eval(parsed_func.replace('x', f'({x_min})'))
                y_at_x_min_plus_1 = eval(parsed_func.replace('x', f'({x_min + 1})'))
                
                scene_code += f"""
        # Show slope with rise and run
        rise_line = DashedLine(
            axes.coords_to_point({x_min}, {y_at_x_min}),
            axes.coords_to_point({x_min}, {y_at_x_min_plus_1}),
            color=RED
        )
        rise_label = Text("rise", font_size=20, color=RED).next_to(rise_line, LEFT)
        
        run_line = DashedLine(
            axes.coords_to_point({x_min}, {y_at_x_min}),
            axes.coords_to_point({x_min + 1}, {y_at_x_min}),
            color=GREEN
        )
        run_label = Text("run", font_size=20, color=GREEN).next_to(run_line, DOWN)
        
        self.play(Create(rise_line), Create(run_line), Write(rise_label), Write(run_label))
"""
            except:
                # Skip slope visualization if calculation fails
                pass
        
        scene_code += """
        self.wait(2)
"""
        
        # Render the scene
        return _render_manim_code(scene_code, quality="medium_quality")
        
    except Exception as e:
        return f"❌ Error creating visualization: {str(e)}"

@mcp.tool
def compare_functions(
    functions: str,
    labels: Optional[str] = None,
    x_range: str = "-5,5",
    y_range: str = "-5,5",
    title: Optional[str] = None
) -> str:
    """
    Compare multiple functions on the same graph.
    Perfect for showing how different functions differ!
    
    Args:
        functions: Comma-separated list of functions (e.g., "3x+1, 3x, 2x+1")
        labels: Optional comma-separated labels (e.g., "f(x), g(x), h(x)")
        x_range: X-axis range as "min,max"
        y_range: Y-axis range as "min,max"
        title: Custom title
    
    Returns:
        Path to the generated video file
    """
    try:
        # Parse inputs
        func_list = [f.strip() for f in functions.split(',')]
        label_list = [l.strip() for l in labels.split(',')] if labels else [f"f_{i}(x)" for i in range(len(func_list))]
        colors = ["BLUE", "RED", "GREEN", "YELLOW", "PURPLE", "ORANGE"]
        
        x_min, x_max = map(float, x_range.split(','))
        y_min, y_max = map(float, y_range.split(','))
        
        # Prepare title
        has_title = bool(title)
        display_title = (title or "Function Comparison").replace("'", "\\'")
        
        # Generate axes code using helper
        axes_code = generate_2d_axes_code(x_min, x_max, y_min, y_max, has_title=has_title)
        
        # Generate Manim code
        scene_code = f"""from manim import *
import numpy as np

class ComparisonScene(Scene):
    def construct(self):
        # Create axes
{axes_code}
"""
        
        # Add title if specified
        if has_title:
            title_code = generate_title_code(display_title, is_3d=False)
            scene_code += f"""
{title_code}
"""
        
        scene_code += """
        
        axes_labels = axes.get_axis_labels(x_label="x", y_label="y")
        self.play(Create(axes), Write(axes_labels))
"""
        
        if has_title:
            scene_code += """
        self.play(Write(title_text))
"""
        
        scene_code += """
"""
        
        # Add each function
        for i, (func, label, color) in enumerate(zip(func_list, label_list, colors[:len(func_list)])):
            parsed = parse_function(func)
            # Clean up function display
            func_display = func.replace('*', '')
            scene_code += f"""
        # Function {i+1}: {label}
        graph_{i} = axes.plot(lambda x: {parsed}, color={color}, x_range=[{x_min}, {x_max}])
        label_{i} = MathTex(r"{label} = {func_display}", color={color}, font_size=32)
        label_{i}.to_corner(UR).shift(DOWN * {i * 0.7})
        self.play(Create(graph_{i}), Write(label_{i}), run_time=1.5)
"""
        
        scene_code += """
        self.wait(2)
"""
        
        return _render_manim_code(scene_code, quality="medium_quality")
        
    except Exception as e:
        return f"❌ Error comparing functions: {str(e)}"

@mcp.tool
def show_transformation(
    original: str,
    transformed: str,
    x_range: str = "-5,5",
    y_range: str = "-5,5",
    explain: Optional[str] = None
) -> str:
    """
    Show how a function transforms into another.
    Perfect for teaching function transformations!
    
    Args:
        original: Original function (e.g., "x^2")
        transformed: Transformed function (e.g., "x^2 + 2")
        x_range: X-axis range as "min,max"
        y_range: Y-axis range as "min,max"
        explain: Description of the transformation (e.g., "vertical shift up 2")
    
    Returns:
        Path to the generated video file
    """
    try:
        x_min, x_max = map(float, x_range.split(','))
        y_min, y_max = map(float, y_range.split(','))
        
        parsed_orig = parse_function(original)
        parsed_trans = parse_function(transformed)
        
        # Clean up function display
        orig_display = original.replace('*', '')
        trans_display = transformed.replace('*', '')
        
        # Generate axes code using helper
        has_explanation = bool(explain)
        axes_code = generate_2d_axes_code(x_min, x_max, y_min, y_max, has_title=False, has_explanation=has_explanation)
        
        scene_code = f"""from manim import *
import numpy as np

class TransformationScene(Scene):
    def construct(self):
        # Create axes
{axes_code}
        axes_labels = axes.get_axis_labels(x_label="x", y_label="y")
        
        # Original function
        graph_orig = axes.plot(lambda x: {parsed_orig}, color=BLUE, x_range=[{x_min}, {x_max}])
        label_orig = MathTex(r"f(x) = {orig_display}", color=BLUE, font_size=32).to_corner(UL, buff=0.5)
        
        # Transformed function  
        graph_trans = axes.plot(lambda x: {parsed_trans}, color=RED, x_range=[{x_min}, {x_max}])
        label_trans = MathTex(r"g(x) = {trans_display}", color=RED, font_size=32).next_to(label_orig, DOWN, aligned_edge=LEFT)
"""
        
        if explain:
            explain_escaped = explain.replace("'", "\\'")
            explanation_code = generate_explanation_code(explain_escaped, is_3d=False)
            scene_code += f"""
{explanation_code}
"""
        
        scene_code += """
        # Animate
        self.play(Create(axes), Write(axes_labels))
        self.play(Create(graph_orig), Write(label_orig))
        self.wait()
"""
        
        if explain:
            scene_code += """
        self.play(Write(explanation))
"""
        
        scene_code += """
        self.play(Transform(graph_orig.copy(), graph_trans), Write(label_trans), run_time=2)
        self.play(Create(graph_trans))
        
        self.wait(2)
"""
        
        return _render_manim_code(scene_code, quality="medium_quality")
        
    except Exception as e:
        return f"❌ Error showing transformation: {str(e)}"

# ============================================================================
# 3D VISUALIZATION TOOLS
# ============================================================================

@mcp.tool
def plot_3d_surface(
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
    Plot a 3D surface function z = f(x, y).
    Perfect for showing how functions behave in 3 dimensions!
    
    Args:
        function: The function z = f(x,y) (e.g., "x**2 + y**2", "sin(x)*cos(y)")
        x_range: X-axis range as "min,max" (default: "-3,3")
        y_range: Y-axis range as "min,max" (default: "-3,3")
        z_range: Z-axis range as "min,max" (default: "-5,5")
        color_scheme: Color gradient (blue_to_red, green_to_yellow, rainbow)
        title: Custom title for the visualization
        show_axes: Whether to show the 3D axes
        rotation_speed: How fast to rotate the camera (0.1 = slow, 0.5 = fast)
    
    Returns:
        Path to the generated video file
    """
    try:
        # Parse ranges
        x_min, x_max = map(float, x_range.split(','))
        y_min, y_max = map(float, y_range.split(','))
        z_min, z_max = map(float, z_range.split(','))
        
        # Parse function for display
        parsed_func = parse_function(function)
        func_display = function.replace('*', '').replace("'", "\\'")
        
        # Map color schemes to Manim color gradients
        color_map = {
            "blue_to_red": "[BLUE, RED]",
            "green_to_yellow": "[GREEN, YELLOW]",
            "rainbow": "[BLUE, GREEN, YELLOW, ORANGE, RED]",
            "cool": "[BLUE, TEAL, GREEN]",
            "warm": "[YELLOW, ORANGE, RED]"
        }
        colors = color_map.get(color_scheme, "[BLUE, RED]")
        
        # Generate axes code using helper
        has_title = bool(title)
        axes_code = generate_3d_axes_code(x_min, x_max, y_min, y_max, z_min, z_max, has_title=has_title)
        
        # Generate Manim 3D scene code
        scene_code = f"""from manim import *
import numpy as np

class Surface3D(ThreeDScene):
    def construct(self):
        # Set up 3D axes
{axes_code}
"""
        
        if has_title:
            title_escaped = title.replace("'", "\\'")
            title_code = generate_title_code(title_escaped, is_3d=True)
            scene_code += f"""
        # Add title
{title_code}
"""
        
        scene_code += f"""
        # Create the surface
        surface = Surface(
            lambda u, v: axes.c2p(u, v, {parsed_func.replace('x', 'u').replace('y', 'v')}),
            u_range=[{x_min}, {x_max}],
            v_range=[{y_min}, {y_max}],
            resolution=(30, 30),
        )
        
        # Apply color gradient based on z-height
        surface.set_fill_by_value(
            axes=axes,
            colors={colors},
            axis=2  # Color by z-axis
        )
        
        # Set camera orientation
        self.set_camera_orientation(phi=75 * DEGREES, theta=30 * DEGREES)
        
        # Add axes and surface
"""
        
        if show_axes:
            scene_code += """
        self.play(Create(axes))
"""
        
        scene_code += f"""
        self.play(Create(surface), run_time=2)
        
        # Rotate the camera to show the surface from different angles
        self.begin_ambient_camera_rotation(rate={rotation_speed})
        self.wait(5)
        self.stop_ambient_camera_rotation()
        
        self.wait()
"""
        
        return _render_manim_code(scene_code, quality="medium_quality")
        
    except Exception as e:
        return f"❌ Error creating 3D visualization: {{str(e)}}"

@mcp.tool
def compare_3d_surfaces(
    functions: str,
    labels: Optional[str] = None,
    x_range: str = "-3,3",
    y_range: str = "-3,3",
    z_range: str = "-5,5",
    title: Optional[str] = None
) -> str:
    """
    Compare multiple 3D surfaces side by side.
    Great for showing how different 3D functions differ!
    
    Args:
        functions: Comma-separated list of z functions (e.g., "x**2 + y**2, x**2 - y**2")
        labels: Optional comma-separated labels (e.g., "Paraboloid, Saddle")
        x_range: X-axis range as "min,max"
        y_range: Y-axis range as "min,max"
        z_range: Z-axis range as "min,max"
        title: Custom title
    
    Returns:
        Path to the generated video file
    """
    try:
        # Parse inputs
        func_list = [f.strip() for f in functions.split(',')]
        label_list = [l.strip() for l in labels.split(',')] if labels else [f"Surface {i+1}" for i in range(len(func_list))]
        colors = ["BLUE", "RED", "GREEN"]
        
        x_min, x_max = map(float, x_range.split(','))
        y_min, y_max = map(float, y_range.split(','))
        z_min, z_max = map(float, z_range.split(','))
        
        # Prepare title
        has_title = bool(title)
        
        scene_code = f"""from manim import *
import numpy as np

class Compare3DSurfaces(ThreeDScene):
    def construct(self):
        # Set camera orientation
        self.set_camera_orientation(phi=75 * DEGREES, theta=30 * DEGREES)
"""
        
        if has_title:
            title_escaped = title.replace("'", "\\'")
            title_code = generate_title_code(title_escaped, is_3d=True)
            scene_code += f"""
        
{title_code}
        self.play(Write(title_text))
"""
        
        scene_code += """
        
"""
        
        # Add each surface
        z_length = 2.5 if has_title else 3.0
        down_shift = 0.3 if has_title else 0
        
        for i, (func, label, color) in enumerate(zip(func_list, label_list, colors[:len(func_list)])):
            parsed = parse_function(func)
            x_offset = (i - len(func_list)/2 + 0.5) * 5  # Spread surfaces horizontally
            
            shift_code = f"RIGHT * {x_offset}"
            if down_shift:
                shift_code += f" + DOWN * {down_shift}"
            
            scene_code += f"""
        # Surface {i+1}: {label}
        axes_{i} = ThreeDAxes(
            x_range=[{x_min}, {x_max}, 1],
            y_range=[{y_min}, {y_max}, 1],
            z_range=[{z_min}, {z_max}, 1],
            x_length=4,
            y_length=4,
            z_length={z_length},
        ).shift({shift_code})
        
        surface_{i} = Surface(
            lambda u, v: axes_{i}.c2p(u, v, {parsed.replace('x', 'u').replace('y', 'v')}),
            u_range=[{x_min}, {x_max}],
            v_range=[{y_min}, {y_max}],
            resolution=(20, 20),
        )
        surface_{i}.set_color({color})
        surface_{i}.set_opacity(0.8)
        
        label_{i} = Text("{label}", font_size=24, color={color})
        label_{i}.next_to(axes_{i}, DOWN)
        self.add_fixed_in_frame_mobjects(label_{i})
        
        self.play(Create(axes_{i}), Create(surface_{i}), Write(label_{i}), run_time=2)
"""
        
        scene_code += """
        # Rotate camera to show all surfaces
        self.begin_ambient_camera_rotation(rate=0.15)
        self.wait(5)
        self.stop_ambient_camera_rotation()
        
        self.wait()
"""
        
        return _render_manim_code(scene_code, quality="medium_quality")
        
    except Exception as e:
        return f"❌ Error comparing 3D surfaces: {{str(e)}}"

@mcp.tool
def show_3d_transformation(
    original: str,
    transformed: str,
    x_range: str = "-3,3",
    y_range: str = "-3,3",
    z_range: str = "-5,5",
    explain: Optional[str] = None
) -> str:
    """
    Show how a 3D surface transforms into another.
    Perfect for teaching 3D transformations!
    
    Args:
        original: Original function z = f(x,y) (e.g., "x**2 + y**2")
        transformed: Transformed function (e.g., "x**2 + y**2 + 2")
        x_range: X-axis range as "min,max"
        y_range: Y-axis range as "min,max"
        z_range: Z-axis range as "min,max"
        explain: Description of the transformation
    
    Returns:
        Path to the generated video file
    """
    try:
        x_min, x_max = map(float, x_range.split(','))
        y_min, y_max = map(float, y_range.split(','))
        z_min, z_max = map(float, z_range.split(','))
        
        parsed_orig = parse_function(original)
        parsed_trans = parse_function(transformed)
        
        # Generate axes code - 3D transformations don't typically have titles, but may have explanations
        # We'll use a smaller z_length if there's an explanation at the bottom
        has_explanation = bool(explain)
        axes_code = generate_3d_axes_code(x_min, x_max, y_min, y_max, z_min, z_max, has_title=False)
        
        scene_code = f"""from manim import *
import numpy as np

class Transform3DSurface(ThreeDScene):
    def construct(self):
        # Set camera
        self.set_camera_orientation(phi=75 * DEGREES, theta=30 * DEGREES)
        
        # Create axes
{axes_code}
        
        # Original surface
        surface_orig = Surface(
            lambda u, v: axes.c2p(u, v, {parsed_orig.replace('x', 'u').replace('y', 'v')}),
            u_range=[{x_min}, {x_max}],
            v_range=[{y_min}, {y_max}],
            resolution=(25, 25),
        )
        surface_orig.set_color(BLUE)
        
        # Transformed surface
        surface_trans = Surface(
            lambda u, v: axes.c2p(u, v, {parsed_trans.replace('x', 'u').replace('y', 'v')}),
            u_range=[{x_min}, {x_max}],
            v_range=[{y_min}, {y_max}],
            resolution=(25, 25),
        )
        surface_trans.set_color(RED)
"""
        
        if has_explanation:
            explain_escaped = explain.replace("'", "\\'")
            explanation_code = generate_explanation_code(explain_escaped, is_3d=True)
            scene_code += f"""
        
{explanation_code}
"""
        
        scene_code += """
        
        # Show original
        self.play(Create(axes))
        self.play(Create(surface_orig), run_time=2)
        self.wait()
"""
        
        if has_explanation:
            scene_code += """
        self.play(Write(explanation))
"""
        
        scene_code += """
        
        # Transform
        self.play(Transform(surface_orig, surface_trans), run_time=3)
        
        # Rotate to show result
        self.begin_ambient_camera_rotation(rate=0.2)
        self.wait(4)
        self.stop_ambient_camera_rotation()
        
        self.wait()
"""
        
        return _render_manim_code(scene_code, quality="medium_quality")
        
    except Exception as e:
        return f"❌ Error showing 3D transformation: {{str(e)}}"

@mcp.tool
def create_simple_scene(
    shape: str = "Circle",
    color: str = "BLUE",
    animation: str = "Create",
    output_name: str = "SimpleScene"
) -> str:
    """
    Create a simple Manim scene with a shape and animation.
    
    Args:
        shape: The Mobject to create (Circle, Square, Triangle, Text, etc.)
        color: The color of the shape (BLUE, RED, GREEN, YELLOW, etc.)
        animation: The animation to apply (Create, FadeIn, GrowFromCenter, Write, etc.)
        output_name: The name of the output scene class
    
    Returns:
        The generated Python code for the scene
    """
    scene_code = f"""from manim import *

class {output_name}(Scene):
    def construct(self):
        shape = {shape}()
        shape.set_color({color})
        self.play({animation}(shape))
        self.wait()
"""
    return f"✅ Generated scene code:\n\n```python\n{scene_code}\n```"

@mcp.tool
def render_scene(
    scene_code: str,
    quality: str = "medium_quality",
    output_file: Optional[str] = None
) -> str:
    """
    Render a Manim scene from Python code.
    
    Args:
        scene_code: The complete Python code containing the Scene class
        quality: Render quality (low_quality, medium_quality, high_quality, production_quality)
        output_file: Optional output filename (without extension)
    
    Returns:
        Status message with render location
    """
    return _render_manim_code(scene_code, quality, output_file)

@mcp.tool
def list_mobjects() -> str:
    """
    List available Manim Mobjects (shapes, objects, etc.).
    
    Returns:
        A categorized list of available Mobjects
    """
    mobjects = {
        "Basic Shapes": [
            "Circle", "Square", "Triangle", "Rectangle", "RoundedRectangle",
            "Polygon", "RegularPolygon", "Star", "Ellipse"
        ],
        "Lines & Arrows": [
            "Line", "Arrow", "Vector", "DoubleArrow", "DashedLine",
            "TangentLine", "Elbow", "CurvedArrow"
        ],
        "Text & Math": [
            "Text", "MarkupText", "Tex", "MathTex", "Title", "Code"
        ],
        "3D Objects": [
            "Sphere", "Cube", "Cone", "Cylinder", "Torus", "Prism"
        ],
        "Graphs & Plots": [
            "Axes", "NumberPlane", "ComplexPlane", "Graph", "BarChart",
            "Line", "CoordinateSystem"
        ],
        "Special Objects": [
            "VGroup", "VMobject", "SVGMobject", "ImageMobject",
            "NumberLine", "DecimalNumber", "Integer", "Variable"
        ]
    }
    
    result = "📦 Available Manim Mobjects:\n\n"
    for category, items in mobjects.items():
        result += f"**{category}**\n"
        result += ", ".join(items) + "\n\n"
    
    return result

@mcp.tool
def list_animations() -> str:
    """
    List available Manim animations.
    
    Returns:
        A categorized list of available animations
    """
    animations = {
        "Creation": [
            "Create", "Uncreate", "DrawBorderThenFill", "Write", "Unwrite"
        ],
        "Fading": [
            "FadeIn", "FadeOut", "FadeInFrom", "FadeOutAndShift",
            "FadeInFromPoint", "FadeOutToPoint"
        ],
        "Growth": [
            "GrowFromCenter", "GrowFromEdge", "GrowFromPoint",
            "SpinInFromNothing"
        ],
        "Indication": [
            "Indicate", "Flash", "ShowPassingFlash", "Wiggle",
            "FocusOn", "Circumscribe", "ShowCreationThenDestruction"
        ],
        "Movement": [
            "Shift", "MoveAlongPath", "Rotate", "Rotating",
            "MoveToTarget", "ApplyMethod", "ApplyPointwiseFunction"
        ],
        "Transform": [
            "Transform", "ReplacementTransform", "TransformFromCopy",
            "ClockwiseTransform", "CounterclockwiseTransform"
        ]
    }
    
    result = "🎬 Available Manim Animations:\n\n"
    for category, items in animations.items():
        result += f"**{category}**\n"
        result += ", ".join(items) + "\n\n"
    
    return result

@mcp.tool
def get_scene_template(template_type: str = "basic") -> str:
    """
    Get a Manim scene template.
    
    Args:
        template_type: Type of template (basic, animation, mathematical, 3d, graph)
    
    Returns:
        Complete Python code for the template
    """
    templates = {
        "basic": """from manim import *

class BasicScene(Scene):
    def construct(self):
        # Create a circle
        circle = Circle()
        circle.set_fill(PINK, opacity=0.5)
        
        # Create text
        text = Text("Hello Manim!")
        
        # Animate
        self.play(Create(circle))
        self.play(FadeIn(text))
        self.wait()
""",
        "animation": """from manim import *

class AnimationScene(Scene):
    def construct(self):
        # Create objects
        square = Square()
        circle = Circle()
        
        # Position them
        square.shift(LEFT * 2)
        circle.shift(RIGHT * 2)
        
        # Animate appearance
        self.play(Create(square), Create(circle))
        self.wait()
        
        # Transform
        self.play(Transform(square, circle))
        self.wait()
        
        # Rotate
        self.play(Rotate(square, PI/2))
        self.wait()
""",
        "mathematical": """from manim import *

class MathScene(Scene):
    def construct(self):
        # Create mathematical expressions
        equation = MathTex(r"\\frac{d}{dx}(x^2) = 2x")
        equation2 = MathTex(r"e^{i\\pi} + 1 = 0")
        
        # Position
        equation.shift(UP * 2)
        
        # Animate
        self.play(Write(equation))
        self.wait()
        
        self.play(Transform(equation, equation2))
        self.wait()
""",
        "3d": """from manim import *

class ThreeDScene(ThreeDScene):
    def construct(self):
        # Set camera orientation
        self.set_camera_orientation(phi=75 * DEGREES, theta=30 * DEGREES)
        
        # Create 3D objects
        sphere = Sphere()
        sphere.set_color(BLUE)
        
        # Animate
        self.play(Create(sphere))
        self.begin_ambient_camera_rotation(rate=0.2)
        self.wait(3)
        self.stop_ambient_camera_rotation()
""",
        "graph": """from manim import *

class GraphScene(Scene):
    def construct(self):
        # Create axes
        axes = Axes(
            x_range=[-3, 3],
            y_range=[-1, 1],
            axis_config={"color": BLUE}
        )
        
        # Create graph
        graph = axes.plot(lambda x: np.sin(x), color=YELLOW)
        
        # Labels
        labels = axes.get_axis_labels(x_label="x", y_label="f(x)")
        
        # Animate
        self.play(Create(axes), Write(labels))
        self.play(Create(graph))
        self.wait()
"""
    }
    
    if template_type not in templates:
        return f"❌ Unknown template type. Available: {', '.join(templates.keys())}"
    
    return f"📝 {template_type.title()} Scene Template:\n\n```python\n{templates[template_type]}\n```"

@mcp.tool
def create_text_scene(
    text: str,
    font_size: int = 48,
    color: str = "WHITE"
) -> str:
    """
    Create a simple scene with text.
    
    Args:
        text: The text to display
        font_size: Font size
        color: Text color
    
    Returns:
        Generated scene code
    """
    text_escaped = text.replace('"', '\\"')
    scene_code = f"""from manim import *

class TextScene(Scene):
    def construct(self):
        text = Text("{text_escaped}", font_size={font_size})
        text.set_color({color})
        self.play(Write(text))
        self.wait()
"""
    return f"✅ Generated text scene:\n\n```python\n{scene_code}\n```"

app = mcp.http_app()