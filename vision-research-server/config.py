"""
Configuration for Vision Research MCP Server
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# YOLO detection defaults
YOLO_CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.4"))
MAX_DETECTIONS = int(os.getenv("MAX_DETECTIONS", "10"))

# Claude Vision concurrency limit
MAX_CONCURRENT_ENRICHMENTS = int(os.getenv("MAX_CONCURRENT_ENRICHMENTS", "5"))
