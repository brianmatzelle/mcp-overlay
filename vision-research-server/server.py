"""
Vision Research MCP Server

FastMCP + FastAPI server providing a single tool: research-visible-objects.
Combines YOLO object detection with Claude Vision enrichment to identify
and research products/objects in camera frames.

Port 3004.
"""

import asyncio
import base64
import io
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastmcp import FastMCP
from PIL import Image

from config import YOLO_CONFIDENCE, MAX_DETECTIONS, MAX_CONCURRENT_ENRICHMENTS
from detect import get_model, detect_objects
from vision_llm import call_vision_llm

# Initialize FastMCP server
mcp = FastMCP("Vision Research Server")

# Semaphore to limit concurrent Claude Vision calls
_enrichment_semaphore = asyncio.Semaphore(MAX_CONCURRENT_ENRICHMENTS)


async def _enrich_one(image: Image.Image, det: dict) -> dict:
    """Crop a single detection and enrich via Claude Vision."""
    bbox = det["bbox"]
    crop = image.crop((
        int(bbox["x1"]),
        int(bbox["y1"]),
        int(bbox["x2"]),
        int(bbox["y2"]),
    ))

    # Encode crop as JPEG base64
    buf = io.BytesIO()
    crop.save(buf, format="JPEG", quality=85)
    crop_b64 = base64.b64encode(buf.getvalue()).decode()

    async with _enrichment_semaphore:
        enrichment = await call_vision_llm(crop_b64, det["class"])

    return {
        **det,
        "identification": enrichment.get("identification", {}),
        "enrichment": enrichment.get("enrichment", {}),
    }


@mcp.tool(name="research-visible-objects")
async def research_visible_objects(
    image_base64: str,
    filter_classes: list[str] | None = None,
    confidence: float = YOLO_CONFIDENCE,
) -> str:
    """Research visible objects in a camera frame.

    Detects objects with YOLO, then uses Claude Vision to identify and
    enrich each one with product details, pricing, and specs.

    Args:
        image_base64: Base64-encoded JPEG image from the camera.
        filter_classes: Optional list of YOLO class names to include (e.g. ["bottle", "cup"]).
                        If omitted, all detected classes are researched.
        confidence: YOLO confidence threshold (0-1). Default 0.4.

    Returns:
        JSON string with detected and enriched objects.
    """
    try:
        # Decode base64 image
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))
        if image.mode != "RGB":
            image = image.convert("RGB")

        # Run YOLO detection
        detections = detect_objects(image, confidence, MAX_DETECTIONS)

        # Optional class filtering
        if filter_classes:
            lower_filter = {c.lower() for c in filter_classes}
            detections = [d for d in detections if d["class"].lower() in lower_filter]

        if not detections:
            return json.dumps({
                "success": True,
                "count": 0,
                "image_size": {"width": image.width, "height": image.height},
                "objects": [],
            })

        # Enrich each detection concurrently (semaphore-limited)
        tasks = [_enrich_one(image, det) for det in detections]
        enriched = await asyncio.gather(*tasks, return_exceptions=True)

        objects = []
        for item in enriched:
            if isinstance(item, Exception):
                continue
            objects.append(item)

        return json.dumps({
            "success": True,
            "count": len(objects),
            "image_size": {"width": image.width, "height": image.height},
            "objects": objects,
        })

    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e),
            "objects": [],
        })


# Create MCP HTTP app
mcp_app = mcp.http_app(path="/")


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    """Pre-load YOLO model at startup."""
    print("Vision Research Server starting...")
    get_model()  # Pre-load YOLO
    async with mcp_app.lifespan(app):
        yield
    print("Vision Research Server shutting down")


# Create FastAPI app
app = FastAPI(
    title="Vision Research Server",
    version="0.1.0",
    description="MCP server for object detection + Claude Vision enrichment",
    lifespan=app_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount MCP app
app.mount("/mcp", mcp_app)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3004)
