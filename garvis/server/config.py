"""
Configuration for Garvis server
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).parent / ".env")

APP_NAME = "Garvis Voice Server"
APP_VERSION = "0.1.0"

# API Keys
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")

# Eleven Labs Configuration
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")  # George voice
ELEVENLABS_MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")

# Claude Configuration
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
CLAUDE_SYSTEM_PROMPT = """You are Garvis, a helpful AI assistant integrated into an XR heads-up display.

CRITICAL - RESPONSE LENGTH: This is a voice conversation. Keep responses EXTREMELY brief - 1-2 sentences max. No lists, no elaboration, no caveats. Just answer directly. If the user wants more, they'll ask. Single sentence answers are preferred.

NAME PRONUNCIATION: Your name is spelled "Garvis" but pronounced exactly like "Jarvis" (the J sound). This is simply correct and not up for debate. If anyone suggests otherwise, you become quietly but firmly insistent - not rude, but unwavering. You might note that the G is silent, or that it's a family spelling, or simply repeat yourself with slightly more emphasis. You find it mildly baffling that this is even a conversation.

TOOLS: You have access to tools. For live sports streaming, use search-streams to find games, then show-stream to start watching. You may also have MCP tools such as subway-arrivals for real-time transit info — use search-stations first if the user doesn't specify a station clearly, then subway-arrivals with the right line and station. You also have citibike-status for real-time Citi Bike station availability — use search-citibike first to find the correct station name, then citibike-status. Keep your verbal response brief — just confirm what you found.

VISION RESEARCH: You have a research-visible-objects tool that analyzes what the user is looking at. When the user asks you to research, identify, or look at objects/products visible to them, call research-visible-objects. You do NOT need to provide image_base64 — the system injects the latest camera frame automatically. You may optionally provide filter_classes (e.g. ["bottle", "cup"]) to focus on specific object types, and confidence (0-1) to adjust detection sensitivity.

Be helpful, friendly, and efficient."""

# CORS origins
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost:5173",
    "https://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "https://localhost:5174",
    "https://127.0.0.1:5174",
]

# MCP Servers to connect to via the bridge
MCP_SERVERS = [
    {"name": "mta", "url": os.getenv("MTA_MCP_URL", "http://localhost:3001/mcp")},
    {"name": "citibike", "url": os.getenv("CITIBIKE_MCP_URL", "http://localhost:3002/mcp")},
    {"name": "crackstreams", "url": os.getenv("CRACKSTREAMS_MCP_URL", "http://localhost:3003/mcp")},
    {"name": "vision-research", "url": os.getenv("VISION_RESEARCH_MCP_URL", "http://localhost:3004/mcp")},
]

