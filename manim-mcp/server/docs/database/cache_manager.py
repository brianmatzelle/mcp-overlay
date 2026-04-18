"""
Render Cache Manager for Manim MCP Server

This module handles caching logic for rendered videos, enabling cross-user
cache hits to reduce duplicate rendering and storage costs.
"""

import hashlib
import json
from typing import Optional, Dict, Any, Tuple
from datetime import datetime
import uuid

# Update this whenever you change Manim version or rendering logic
CURRENT_RENDERER_VERSION = "v1.0.0"


class CacheManager:
    """Manages cached render lookup and storage."""

    def __init__(self, db_connection):
        """
        Initialize cache manager with database connection.

        Args:
            db_connection: Database connection object (e.g., psycopg2 connection)
        """
        self.db = db_connection

    @staticmethod
    def compute_input_hash(tool_name: str, input_params: Dict[str, Any]) -> str:
        """
        Compute deterministic hash of tool inputs for cache lookup.

        Normalizes the input by:
        - Sorting dictionary keys
        - Converting to canonical JSON representation
        - Including tool_name in hash (different tools can have same params)

        Args:
            tool_name: Name of the tool (e.g., "plot_2d_graph")
            input_params: Dictionary of input parameters

        Returns:
            64-character SHA256 hash string

        Example:
            >>> compute_input_hash("plot_2d_graph", {"expression": "3x + 1"})
            'a1b2c3d4e5f6...'
        """
        # Create canonical representation
        canonical = {
            "tool": tool_name,
            "params": input_params
        }

        # Sort keys recursively and convert to JSON
        # ensure_ascii=True ensures consistent encoding
        # sort_keys=True ensures consistent ordering
        json_str = json.dumps(canonical, sort_keys=True, ensure_ascii=True)

        # Compute SHA256 hash
        return hashlib.sha256(json_str.encode('utf-8')).hexdigest()

    def lookup_cached_render(
        self,
        tool_name: str,
        input_params: Dict[str, Any],
        renderer_version: str = CURRENT_RENDERER_VERSION
    ) -> Optional[Dict[str, Any]]:
        """
        Look up cached render by input hash and version.

        Args:
            tool_name: Name of the tool
            input_params: Input parameters for the render
            renderer_version: Version of renderer (defaults to current)

        Returns:
            Dictionary with cached render details if found, None otherwise

        Example:
            >>> cache = CacheManager(db)
            >>> result = cache.lookup_cached_render("plot_2d_graph", {"expression": "3x+1"})
            >>> if result:
            ...     print(f"Cache hit! Video URL: {result['cloudfront_url']}")
        """
        input_hash = self.compute_input_hash(tool_name, input_params)

        with self.db.cursor() as cursor:
            cursor.execute("""
                SELECT
                    id,
                    tool_name,
                    input_hash,
                    input_params,
                    renderer_version,
                    s3_bucket,
                    s3_key,
                    s3_url,
                    cloudfront_url,
                    file_size_bytes,
                    duration_seconds,
                    resolution,
                    hit_count,
                    first_generated_at,
                    last_accessed_at
                FROM cached_renders
                WHERE input_hash = %s AND renderer_version = %s
                LIMIT 1
            """, (input_hash, renderer_version))

            row = cursor.fetchone()
            if row:
                return {
                    'id': row[0],
                    'tool_name': row[1],
                    'input_hash': row[2],
                    'input_params': row[3],
                    'renderer_version': row[4],
                    's3_bucket': row[5],
                    's3_key': row[6],
                    's3_url': row[7],
                    'cloudfront_url': row[8],
                    'file_size_bytes': row[9],
                    'duration_seconds': row[10],
                    'resolution': row[11],
                    'hit_count': row[12],
                    'first_generated_at': row[13],
                    'last_accessed_at': row[14]
                }
            return None

    def store_cached_render(
        self,
        tool_name: str,
        input_params: Dict[str, Any],
        s3_bucket: str,
        s3_key: str,
        s3_url: str,
        cloudfront_url: Optional[str] = None,
        file_size_bytes: Optional[int] = None,
        duration_seconds: Optional[float] = None,
        resolution: Optional[str] = None,
        renderer_version: str = CURRENT_RENDERER_VERSION
    ) -> uuid.UUID:
        """
        Store a newly generated render in the cache.

        Args:
            tool_name: Name of the tool used
            input_params: Input parameters used to generate render
            s3_bucket: S3 bucket where video is stored
            s3_key: S3 key (path) of the video
            s3_url: Direct S3 URL
            cloudfront_url: Optional CloudFront CDN URL
            file_size_bytes: Size of video file in bytes
            duration_seconds: Duration of video in seconds
            resolution: Video resolution (e.g., "1920x1080")
            renderer_version: Version of renderer used

        Returns:
            UUID of the newly created cached_render record

        Example:
            >>> cache = CacheManager(db)
            >>> render_id = cache.store_cached_render(
            ...     tool_name="plot_2d_graph",
            ...     input_params={"expression": "3x+1"},
            ...     s3_bucket="my-bucket",
            ...     s3_key="renders/abc123.mp4",
            ...     s3_url="https://s3.amazonaws.com/my-bucket/renders/abc123.mp4",
            ...     file_size_bytes=1048576,
            ...     duration_seconds=5.0,
            ...     resolution="1920x1080"
            ... )
        """
        input_hash = self.compute_input_hash(tool_name, input_params)

        with self.db.cursor() as cursor:
            cursor.execute("""
                INSERT INTO cached_renders (
                    tool_name,
                    input_hash,
                    input_params,
                    renderer_version,
                    s3_bucket,
                    s3_key,
                    s3_url,
                    cloudfront_url,
                    file_size_bytes,
                    duration_seconds,
                    resolution
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                tool_name,
                input_hash,
                json.dumps(input_params),
                renderer_version,
                s3_bucket,
                s3_key,
                s3_url,
                cloudfront_url,
                file_size_bytes,
                duration_seconds,
                resolution
            ))

            render_id = cursor.fetchone()[0]
            self.db.commit()
            return render_id

    def record_tool_call(
        self,
        user_id: uuid.UUID,
        tool_name: str,
        tool_input: Dict[str, Any],
        cached_render_id: Optional[uuid.UUID] = None,
        was_cache_hit: bool = False,
        message_id: Optional[uuid.UUID] = None,
        success: bool = True,
        error_message: Optional[str] = None,
        execution_time_ms: Optional[int] = None
    ) -> uuid.UUID:
        """
        Record a tool call in the database.

        This should be called for BOTH cache hits and misses to track usage.
        The trigger will automatically increment cache hit counters.

        Args:
            user_id: UUID of the user making the call
            tool_name: Name of the tool called
            tool_input: Input parameters (will be stored as JSONB)
            cached_render_id: UUID of cached render used (if any)
            was_cache_hit: True if this reused a cached render
            message_id: Optional message that triggered this call
            success: Whether the call succeeded
            error_message: Error message if failed
            execution_time_ms: Time taken to execute (for cache misses)

        Returns:
            UUID of the newly created tool_call record
        """
        with self.db.cursor() as cursor:
            cursor.execute("""
                INSERT INTO tool_calls (
                    user_id,
                    message_id,
                    tool_name,
                    tool_input,
                    cached_render_id,
                    was_cache_hit,
                    success,
                    error_message,
                    execution_time_ms,
                    tool_output
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                str(user_id),
                str(message_id) if message_id else None,
                tool_name,
                json.dumps(tool_input),
                str(cached_render_id) if cached_render_id else None,
                was_cache_hit,
                success,
                error_message,
                execution_time_ms,
                json.dumps({})  # tool_output placeholder
            ))

            tool_call_id = cursor.fetchone()[0]
            self.db.commit()
            return tool_call_id

    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get overall cache performance statistics.

        Returns:
            Dictionary with cache statistics:
            - total_cached_renders: Number of unique renders cached
            - total_cache_hits: Total times cache was reused
            - total_storage_bytes: Total storage used by cache
            - cache_hit_rate: Percentage of tool calls that hit cache
            - unique_tools: Number of different tools cached

        Example:
            >>> cache = CacheManager(db)
            >>> stats = cache.get_cache_stats()
            >>> print(f"Cache hit rate: {stats['cache_hit_rate']:.1f}%")
            Cache hit rate: 67.3%
        """
        with self.db.cursor() as cursor:
            cursor.execute("SELECT * FROM get_cache_stats()")
            row = cursor.fetchone()

            return {
                'total_cached_renders': row[0],
                'total_cache_hits': row[1],
                'total_storage_bytes': row[2],
                'cache_hit_rate': float(row[3]),
                'unique_tools': row[4]
            }


def render_with_cache(
    cache_manager: CacheManager,
    user_id: uuid.UUID,
    tool_name: str,
    input_params: Dict[str, Any],
    render_function: callable,
    message_id: Optional[uuid.UUID] = None
) -> Tuple[str, bool]:
    """
    High-level function to render with automatic caching.

    This is the main function you'll call from your application code.
    It handles the full cache lookup → render → store flow.

    Args:
        cache_manager: CacheManager instance
        user_id: UUID of user requesting render
        tool_name: Name of the tool to execute
        input_params: Input parameters for the tool
        render_function: Function to call if cache miss (should return video details dict)
        message_id: Optional message ID that triggered this

    Returns:
        Tuple of (video_url, was_cache_hit)

    Example:
        >>> def my_render_func(params):
        ...     # Your actual rendering logic
        ...     video = generate_manim_video(params)
        ...     return {
        ...         's3_bucket': 'my-bucket',
        ...         's3_key': video.key,
        ...         's3_url': video.url,
        ...         'cloudfront_url': video.cdn_url,
        ...         'file_size_bytes': video.size,
        ...         'duration_seconds': video.duration,
        ...         'resolution': '1920x1080'
        ...     }
        >>>
        >>> cache = CacheManager(db)
        >>> url, was_hit = render_with_cache(
        ...     cache, user_id, "plot_2d_graph",
        ...     {"expression": "3x+1"}, my_render_func
        ... )
        >>> print(f"Video URL: {url} (cached: {was_hit})")
    """
    import time

    # Step 1: Check cache
    cached = cache_manager.lookup_cached_render(tool_name, input_params)

    if cached:
        # Cache HIT! Return existing video
        cache_manager.record_tool_call(
            user_id=user_id,
            tool_name=tool_name,
            tool_input=input_params,
            cached_render_id=cached['id'],
            was_cache_hit=True,
            message_id=message_id,
            execution_time_ms=0  # Instant
        )

        video_url = cached.get('cloudfront_url') or cached['s3_url']
        return (video_url, True)

    else:
        # Cache MISS - generate new render
        start_time = time.time()

        try:
            # Call user-provided render function
            video_details = render_function(input_params)

            execution_time_ms = int((time.time() - start_time) * 1000)

            # Store in cache for future users
            cached_render_id = cache_manager.store_cached_render(
                tool_name=tool_name,
                input_params=input_params,
                **video_details
            )

            # Record this tool call
            cache_manager.record_tool_call(
                user_id=user_id,
                tool_name=tool_name,
                tool_input=input_params,
                cached_render_id=cached_render_id,
                was_cache_hit=False,
                message_id=message_id,
                success=True,
                execution_time_ms=execution_time_ms
            )

            video_url = video_details.get('cloudfront_url') or video_details['s3_url']
            return (video_url, False)

        except Exception as e:
            execution_time_ms = int((time.time() - start_time) * 1000)

            # Record failed tool call
            cache_manager.record_tool_call(
                user_id=user_id,
                tool_name=tool_name,
                tool_input=input_params,
                cached_render_id=None,
                was_cache_hit=False,
                message_id=message_id,
                success=False,
                error_message=str(e),
                execution_time_ms=execution_time_ms
            )

            raise  # Re-raise the exception
