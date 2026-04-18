"""
HLS proxy endpoints for video streaming.
"""

import re
import httpx
from fastapi import APIRouter, Response
from fastapi.responses import StreamingResponse

from config import stream_cache, HTTP_STREAMING_TIMEOUT, HTTP_MAX_KEEPALIVE, HTTP_MAX_CONNECTIONS
from streaming import get_stream_urls

router = APIRouter()


@router.get("/proxy/playlist.m3u8")
async def proxy_playlist(channel: int = 548, cdn: int = 0):
    """Proxy the HLS playlist file"""
    if channel not in stream_cache:
        urls = await get_stream_urls(channel)
        if not urls:
            return Response(f'No streams for channel {channel}', status_code=404)

    if channel not in stream_cache or cdn >= len(stream_cache[channel]):
        return Response(f'No streams for channel {channel} cdn {cdn}', status_code=404)

    original_url = stream_cache[channel][cdn]

    async with httpx.AsyncClient() as client:
        response = await client.get(original_url)
        playlist_content = response.text

    base_url = original_url.rsplit('/', 1)[0]

    def replace_url(match):
        chunk_file = match.group(1)
        if chunk_file.startswith('http'):
            encoded_url = str(chunk_file).replace('/', '%2F').replace(':', '%3A').replace('?', '%3F').replace('=', '%3D').replace('&', '%26')
        else:
            absolute_url = f"{base_url}/{chunk_file}"
            encoded_url = str(absolute_url).replace('/', '%2F').replace(':', '%3A').replace('?', '%3F').replace('=', '%3D').replace('&', '%26')
        return f'/proxy/chunk?url={encoded_url}'

    playlist_content = re.sub(r'^((?:https?://)?[^\s#]+\.(?:ts|m3u8))$', replace_url, playlist_content, flags=re.MULTILINE)

    def add_codecs(match):
        line = match.group(0)
        if 'CODECS=' not in line:
            return line + ',CODECS="avc1.4d002a,mp4a.40.2"'
        return line

    playlist_content = re.sub(r'#EXT-X-STREAM-INF:[^\n]+', add_codecs, playlist_content)

    return Response(
        content=playlist_content,
        media_type='application/vnd.apple.mpegurl',
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        }
    )


@router.get("/proxy/chunk")
async def proxy_chunk(url: str):
    """Proxy individual video chunks and sub-playlists"""
    if not url:
        return Response('Missing URL', status_code=400)

    if '.m3u8' in url:
        async with httpx.AsyncClient(
            timeout=HTTP_STREAMING_TIMEOUT,
            limits=httpx.Limits(max_keepalive_connections=HTTP_MAX_KEEPALIVE, max_connections=HTTP_MAX_CONNECTIONS)
        ) as client:
            response = await client.get(url)
            content = response.text
            base_url = url.rsplit('/', 1)[0]

            def replace_url(match):
                chunk_file = match.group(1)
                if chunk_file.startswith('http'):
                    encoded_url = str(chunk_file).replace('/', '%2F').replace(':', '%3A').replace('?', '%3F').replace('=', '%3D').replace('&', '%26')
                else:
                    absolute_url = f"{base_url}/{chunk_file}"
                    encoded_url = str(absolute_url).replace('/', '%2F').replace(':', '%3A').replace('?', '%3F').replace('=', '%3D').replace('&', '%26')
                return f'/proxy/chunk?url={encoded_url}'

            content = re.sub(r'^((?:https?://)?[^\s#]+\.(?:ts|m3u8))$', replace_url, content, flags=re.MULTILINE)
            content = re.sub(r'#EXT-X-ENDLIST\s*\n?', '', content)

            return Response(
                content=content,
                media_type='application/vnd.apple.mpegurl',
                headers={
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                }
            )

    # Stream video chunks through unchanged (no ffmpeg transcoding)
    async def generate():
        async with httpx.AsyncClient(
            timeout=HTTP_STREAMING_TIMEOUT,
            limits=httpx.Limits(max_keepalive_connections=HTTP_MAX_KEEPALIVE, max_connections=HTTP_MAX_CONNECTIONS)
        ) as client:
            async with client.stream('GET', url) as response:
                async for chunk in response.aiter_bytes(chunk_size=65536):
                    yield chunk

    return StreamingResponse(
        generate(),
        media_type='video/MP2T',
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*',
        }
    )
