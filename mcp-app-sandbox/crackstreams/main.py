"""
CrackStreams MCP Server — FastAPI + FastMCP on port 3003.
Provides search-streams, show-stream, and ping tools.
"""

import json
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastmcp import FastMCP

from config import APP_NAME, APP_VERSION, ALLOWED_ORIGINS
from providers import get_providers_by_type, get_provider_by_url, get_all_providers
from streaming import get_stream_urls
from proxy import router as proxy_router

mcp = FastMCP(APP_NAME)


@mcp.tool(name="search-streams")
async def search_streams(query: str = "", content_type: str = "sports") -> str:
    """
    Search for live sports streams across all providers.

    Args:
        query: Search terms (e.g., "Chiefs", "NBA", "UFC").
               Leave empty to see all available content.
        content_type: Type of content - "sports", "movies", "tv", or "all" (default: "sports")

    Returns:
        JSON array of available games with title, url, league, and time.
    """
    providers = get_providers_by_type(content_type)
    if not providers:
        return json.dumps([])

    all_results = []
    for provider in providers:
        try:
            results = await provider.search(query)
            all_results.extend(results)
        except Exception as e:
            print(f"Error searching {provider.name}: {e}")
            continue

    return json.dumps(all_results)


@mcp.tool(name="show-stream")
async def show_stream(
    content_url: Optional[str] = None,
    channel: Optional[int] = None,
    source: str = "auto",
    cdn: int = 0,
) -> str:
    """
    Start a live stream. Returns the proxy URL for HLS playback.

    Args:
        content_url: Content URL from search-streams results
        channel: Direct channel number for sharkstreams (optional)
        source: Stream source - "auto", "watchlive", or "sharkstreams" (default: "auto")
        cdn: CDN index for sharkstreams (default: 0)

    Returns:
        JSON with stream_url (proxy URL), channel, and source.
    """
    if content_url:
        provider = get_provider_by_url(content_url)
        if not provider:
            return json.dumps({"error": "No provider found for this URL."})

        stream_info = await provider.get_stream_info(content_url)

        if stream_info:
            if stream_info['source'] == 'watchlive' and source in ("auto", "watchlive"):
                return json.dumps({
                    "stream_url": stream_info['embed_url'],
                    "channel": int(stream_info['channel']),
                    "source": "watchlive",
                })

            if stream_info['source'] == 'sharkstreams' and source in ("auto", "sharkstreams"):
                channel = int(stream_info['channel'])

        if not stream_info and source == "watchlive":
            return json.dumps({"error": "Could not extract stream info from URL."})

        if source == "auto" and not stream_info and not channel:
            channel = 548

    if source in ("auto", "sharkstreams"):
        if not channel:
            channel = 548

        try:
            urls = await get_stream_urls(channel)
            if not urls:
                return json.dumps({"error": f"No streams found for channel {channel}."})
        except Exception as e:
            return json.dumps({"error": f"Failed to fetch stream: {str(e)}"})

        proxy_url = f"/proxy/playlist.m3u8?channel={channel}&cdn={cdn}"
        return json.dumps({
            "stream_url": proxy_url,
            "channel": channel,
            "source": "sharkstreams",
        })

    return json.dumps({"error": "Unable to load stream."})


@mcp.tool(name="ping")
async def ping() -> str:
    """Health check."""
    return json.dumps({
        "status": "pong",
        "service": APP_NAME,
        "version": APP_VERSION,
        "providers": [p.name for p in get_all_providers()],
    })


mcp_app = mcp.http_app(path="/mcp")


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    print(f"Starting {APP_NAME} v{APP_VERSION}")
    providers = get_all_providers()
    print(f"Registered {len(providers)} provider(s):")
    for p in providers:
        print(f"  - {p.name} ({p.content_type})")

    async with mcp_app.lifespan(app):
        yield

    print(f"Shutting down {APP_NAME}")


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    lifespan=app_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(proxy_router)
app.mount("/", mcp_app)
