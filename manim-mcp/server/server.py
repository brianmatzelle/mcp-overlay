"""
Manim MCP Server - Modular and Secure Version

This is a refactored version of the MCP server that:
- Uses safe expression evaluation (no eval())
- Validates all inputs with clear error messages
- Uses template-based code generation (no f-string injection)
- Has a modular architecture for easy extensibility
- Provides clear tool categorization and metadata

To add new tools:
1. Create a new tool class inheriting from BaseVisualizationTool or BaseUtilityTool
2. Implement the required methods (metadata, execute)
3. Register it in tools/__init__.py
4. Done! The tool is now available via MCP.
"""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastmcp import FastMCP
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# Server base URL for constructing video URLs in MCP App results
SERVER_BASE_URL = os.getenv("SERVER_BASE_URL", "http://localhost:8000")

# Path to rendered video files
MEDIA_VIDEOS_DIR = Path(__file__).parent / "media" / "videos"

# Initialize FastMCP server
mcp = FastMCP("Manim MCP Server")

# Import and register all tools (existing web-client tools)
from tools import register_all_tools

register_all_tools(mcp)

# Register Lesson Viewer MCP App (tool + resource)
from apps.lesson_viewer import register_lesson_viewer

register_lesson_viewer(mcp, SERVER_BASE_URL)

@mcp.tool()
async def ping_tool():
    """Ping endpoint for load balancer"""
    return {
        "status": "pong",
        "service": "Manim MCP Server",
        "version": "1.0.0"
    }

# make MCP http app
mcp_app = mcp.http_app(path="/math")

@asynccontextmanager
async def mcp_lifespan(app: FastAPI):
    """Lifespan manager for the MCP application"""
    # Startup - start any servers here

    # Then use the MCP lifespan
    async with mcp_app.lifespan(app):
        yield

    # Shutdown - cleanup clients if necessary, or other servers/subprocesses

app = FastAPI(title="Starting", version="0.1.0", lifespan=mcp_lifespan)

# CORS — sandboxed iframes have null origin, so allow all for video serving
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Video serving endpoint for MCP App iframe
@app.get("/videos/{video_path:path}")
async def serve_video(video_path: str):
    """Serve rendered Manim videos. Used by the Lesson Viewer MCP App."""
    resolved = (MEDIA_VIDEOS_DIR / video_path).resolve()

    # Path traversal protection
    if not str(resolved).startswith(str(MEDIA_VIDEOS_DIR.resolve())):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})

    if not resolved.is_file():
        return JSONResponse(status_code=404, content={"error": "Video not found"})

    return FileResponse(
        resolved,
        media_type="video/mp4",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=31536000",
        },
    )

# Health check endpoint for AWS ECS/ALB health checks
@app.get("/health")
async def health_check():
    """Health check endpoint for load balancer"""
    return {
        "status": "healthy",
        "service": "Manim MCP Server",
        "version": "1.0.0"
    }

@app.get("/ping")
async def ping():
    """Ping endpoint for load balancer"""
    return {
        "status": "pong",
        "service": "Manim MCP Server",
        "version": "1.0.0"
    }

app.mount("/mcp", mcp_app)

# run with: uvicorn server:app --host 0.0.0.0 --port 8000
