"""
Manim scene renderer with safe subprocess execution.
"""
import os
import re
import tempfile
import subprocess
from pathlib import Path
from typing import Optional


# Server directory - manim will output to server/media/
server_path = Path(__file__).parent.parent


def render_manim_scene(
    scene_code: str,
    quality: str = "medium_quality",
    output_file: Optional[str] = None,
    timeout: int = 120
) -> str:
    """
    Render Manim code to video with subprocess safety.

    Args:
        scene_code: Complete Python code containing the Scene class
        quality: Render quality (low_quality, medium_quality, high_quality, production_quality)
        output_file: Optional output filename (without extension)
        timeout: Maximum render time in seconds

    Returns:
        Status message with video path or error message

    Example:
        >>> code = "from manim import *\\nclass MyScene(Scene):\\n    def construct(self):\\n        ..."
        >>> result = render_manim_scene(code)
        "✅ Scene rendered successfully!\\nVideo path: tmpXXXXX/720p30/MyScene.mp4"
    """
    try:
        # Create a temporary file for the scene
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(scene_code)
            temp_file = f.name

        # Map quality to manim CLI flags
        quality_flags = {
            'low_quality': 'l',
            'medium_quality': 'm',
            'high_quality': 'h',
            'production_quality': 'p'
        }
        quality_flag = quality_flags.get(quality, 'm')

        # Build the manim command
        cmd = [
            "uv",
            "run",
            "manim",
            f"-q{quality_flag}",
            temp_file
        ]

        if output_file:
            cmd.extend(["-o", output_file])

        # Run manim with timeout protection
        # Set cwd to server directory so manim outputs to server/media/
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(server_path),
            timeout=timeout
        )

        # Clean up temp file
        try:
            os.unlink(temp_file)
        except:
            pass  # Best effort cleanup

        if result.returncode == 0:
            # Extract video path from manim output
            video_path = _extract_video_path(result.stdout)

            response = "✅ Scene rendered successfully!\n\n"

            if video_path:
                response += f"Video path: {video_path}\n\n"
                response += f"📹 Use the show_video tool with path '{video_path}' to display it."
            else:
                response += "📹 The animation has been generated!"

            return response
        else:
            return f"❌ Render failed:\n{result.stderr}"

    except subprocess.TimeoutExpired:
        # Clean up temp file
        try:
            os.unlink(temp_file)
        except:
            pass

        return f"❌ Render timeout: Scene took longer than {timeout} seconds to render. Try simplifying the visualization."

    except Exception as e:
        return f"❌ Error rendering scene: {str(e)}"


def _extract_video_path(manim_output: str) -> Optional[str]:
    """
    Extract relative video path from Manim CLI output.

    Args:
        manim_output: Raw stdout from manim command

    Returns:
        Relative video path from media/videos/ or None
    """
    # Remove ANSI color codes
    output_clean = re.sub(r'\x1b\[[0-9;]*[mK]', '', manim_output)

    # Look for pattern: 'File ready at' followed by a quoted path
    # Note: path may be split across lines with padding spaces
    file_ready_match = re.search(r"File ready.*?'([^']+)'", output_clean, re.DOTALL)

    if file_ready_match:
        full_path = file_ready_match.group(1)
        # Clean up path - remove extra whitespace and newlines
        full_path = ''.join(full_path.split())

        # Verify it's an mp4 file
        if not full_path.endswith('.mp4'):
            return None

        # Extract relative path from media/videos/
        if 'media/videos/' in full_path:
            return full_path.split('media/videos/')[1]

    return None
