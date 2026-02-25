"""
Splat Generation MCP Server

FastMCP + FastAPI server providing Gaussian splat generation from images.
Uses LGM (Large Gaussian Model) for image-to-splat conversion, with a
mock backend for development/testing.

Port 3005.
"""

import asyncio
import base64
import json
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastmcp import FastMCP

from config import INFERENCE_BACKEND, ARTIFACT_DIR, ARTIFACT_TTL_SECONDS, MAX_IMAGE_BYTES
from inference import generate_splat, load_backend

mcp = FastMCP("Splat Generation Server")

# In-memory artifact registry: artifact_id → {path, created_at, metadata}
_artifacts: dict[str, dict] = {}


def _store_artifact(ply_bytes: bytes, metadata: dict) -> str:
    """Save PLY to disk and register in artifact map."""
    artifact_id = str(uuid.uuid4())
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    path = ARTIFACT_DIR / f"{artifact_id}.ply"
    path.write_bytes(ply_bytes)
    _artifacts[artifact_id] = {
        "path": str(path),
        "created_at": time.time(),
        "size_bytes": len(ply_bytes),
        "metadata": metadata,
    }
    return artifact_id


def _cleanup_artifacts() -> None:
    """Remove expired artifacts from disk and registry."""
    now = time.time()
    expired = [
        k for k, v in _artifacts.items()
        if now - v["created_at"] > ARTIFACT_TTL_SECONDS
    ]
    for k in expired:
        path = Path(_artifacts[k]["path"])
        path.unlink(missing_ok=True)
        del _artifacts[k]
    if expired:
        print(f"[Artifacts] Cleaned up {len(expired)} expired artifact(s)")


@mcp.tool(name="generate-splat-from-image")
async def generate_splat_from_image(
    image_base64: str,
) -> str:
    """Generate a 3D Gaussian splat from a camera image.

    Takes a base64-encoded image (JPEG/PNG) and converts it into an
    interactive 3D Gaussian splat model. The splat is stored as a PLY
    file and a URL is returned for the client to fetch and render.

    Args:
        image_base64: Base64-encoded JPEG or PNG image from the camera.

    Returns:
        JSON string with artifact URL, vertex count, and metadata.
    """
    try:
        image_bytes = base64.b64decode(image_base64)

        if len(image_bytes) > MAX_IMAGE_BYTES:
            return json.dumps({
                "success": False,
                "error": f"Image too large ({len(image_bytes)} bytes, max {MAX_IMAGE_BYTES})",
            })

        # Run inference in a thread to avoid blocking the event loop
        ply_bytes, metadata = await asyncio.to_thread(generate_splat, image_bytes)

        # Store artifact and clean up expired ones
        _cleanup_artifacts()
        artifact_id = _store_artifact(ply_bytes, metadata)

        return json.dumps({
            "success": True,
            "artifact_url": f"/splat-artifacts/{artifact_id}.ply",
            "artifact_id": artifact_id,
            "vertex_count": metadata.get("vertex_count", 0),
            "size_bytes": len(ply_bytes),
            "backend": INFERENCE_BACKEND,
        })

    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e),
        })


# Create MCP HTTP app
mcp_app = mcp.http_app(path="/")


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    """Load inference backend at startup."""
    print(f"Splat Generation Server starting (backend: {INFERENCE_BACKEND})...")
    load_backend()
    async with mcp_app.lifespan(app):
        yield
    print("Splat Generation Server shutting down")


# Create FastAPI app
app = FastAPI(
    title="Splat Generation Server",
    version="0.1.0",
    description="MCP server for Gaussian splat generation from images",
    lifespan=app_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Artifact serving endpoint
@app.get("/artifacts/{filename}")
async def get_artifact(filename: str):
    """Serve a generated PLY artifact by ID."""
    artifact_id = filename.replace(".ply", "")
    if artifact_id not in _artifacts:
        raise HTTPException(status_code=404, detail="Artifact not found")
    artifact = _artifacts[artifact_id]
    return FileResponse(
        artifact["path"],
        media_type="application/octet-stream",
        filename=f"{artifact_id}.ply",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600",
        },
    )


# Mount MCP app
app.mount("/mcp", mcp_app)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3005)
