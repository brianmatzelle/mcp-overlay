"""
Configuration for CrackStreams MCP server.
"""

from typing import Dict

APP_NAME = "CrackStreams"
APP_VERSION = "0.1.0"

# Stream cache: channel number → list of CDN URLs
stream_cache: Dict[int, list] = {}

ALLOWED_ORIGINS = [
    "http://localhost:5174",
    "https://localhost:5174",
    "http://localhost:8000",
]

HTTP_TIMEOUT = 10.0
HTTP_STREAMING_TIMEOUT = 30.0
HTTP_MAX_KEEPALIVE = 20
HTTP_MAX_CONNECTIONS = 100

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
