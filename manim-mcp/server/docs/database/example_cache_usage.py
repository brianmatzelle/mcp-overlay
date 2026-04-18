"""
Example usage of the render cache system.

This demonstrates how to integrate caching into your Manim MCP server.
"""

import uuid
import psycopg2
from cache_manager import CacheManager, render_with_cache


# ============================================================================
# Example 1: Basic cache usage with manual flow
# ============================================================================

def example_manual_cache_flow():
    """Shows the step-by-step cache lookup and store process."""

    # Connect to database
    db = psycopg2.connect(
        host="localhost",
        database="manim_mcp",
        user="your_user",
        password="your_password"
    )

    cache = CacheManager(db)
    user_id = uuid.uuid4()  # Current user
    tool_name = "plot_2d_graph"
    input_params = {"expression": "3x + 1", "color": "blue"}

    # Step 1: Check cache
    cached_render = cache.lookup_cached_render(tool_name, input_params)

    if cached_render:
        print(f"✓ Cache HIT! Reusing existing render")
        print(f"  Video URL: {cached_render['cloudfront_url']}")
        print(f"  Previous hits: {cached_render['hit_count']}")

        # Record this cache hit
        cache.record_tool_call(
            user_id=user_id,
            tool_name=tool_name,
            tool_input=input_params,
            cached_render_id=cached_render['id'],
            was_cache_hit=True
        )

        video_url = cached_render['cloudfront_url']

    else:
        print(f"✗ Cache MISS - generating new render...")

        # Step 2: Generate video (your actual Manim rendering logic)
        video = generate_manim_video(input_params)

        # Step 3: Store in cache
        render_id = cache.store_cached_render(
            tool_name=tool_name,
            input_params=input_params,
            s3_bucket=video['bucket'],
            s3_key=video['key'],
            s3_url=video['url'],
            cloudfront_url=video['cdn_url'],
            file_size_bytes=video['size'],
            duration_seconds=video['duration'],
            resolution="1920x1080"
        )

        # Step 4: Record tool call
        cache.record_tool_call(
            user_id=user_id,
            tool_name=tool_name,
            tool_input=input_params,
            cached_render_id=render_id,
            was_cache_hit=False,
            execution_time_ms=video['render_time_ms']
        )

        video_url = video['cdn_url']
        print(f"✓ Render complete and cached for future users")

    return video_url


# ============================================================================
# Example 2: Simplified usage with render_with_cache helper
# ============================================================================

def example_simple_cache_flow():
    """Shows the simplified API using the render_with_cache helper."""

    db = psycopg2.connect(
        host="localhost",
        database="manim_mcp",
        user="your_user",
        password="your_password"
    )

    cache = CacheManager(db)
    user_id = uuid.uuid4()

    # Define your render function
    def render_plot(params):
        """Your actual rendering logic - only called on cache miss."""
        video = generate_manim_video(params)
        return {
            's3_bucket': video['bucket'],
            's3_key': video['key'],
            's3_url': video['url'],
            'cloudfront_url': video['cdn_url'],
            'file_size_bytes': video['size'],
            'duration_seconds': video['duration'],
            'resolution': '1920x1080'
        }

    # All cache logic handled automatically!
    video_url, was_cache_hit = render_with_cache(
        cache_manager=cache,
        user_id=user_id,
        tool_name="plot_2d_graph",
        input_params={"expression": "3x + 1", "color": "blue"},
        render_function=render_plot
    )

    if was_cache_hit:
        print(f"✓ Returned cached video: {video_url}")
    else:
        print(f"✓ Generated new video: {video_url}")

    return video_url


# ============================================================================
# Example 3: Integration with MCP tool handler
# ============================================================================

def example_mcp_tool_handler():
    """Shows how to integrate caching into your MCP tool handlers."""

    # Your existing MCP tool definition
    @mcp.tool()
    async def plot_2d_graph(expression: str, color: str = "blue"):
        """Plot a 2D mathematical function."""

        # Get current user context
        user_id = get_current_user_id()

        # Initialize cache
        db = get_db_connection()
        cache = CacheManager(db)

        # Define render function
        def render(params):
            # Your existing Manim rendering code
            scene = Plot2DScene(params['expression'], params['color'])
            video_path = scene.render()

            # Upload to S3
            s3_key = upload_to_s3(video_path)

            return {
                's3_bucket': 'manim-renders',
                's3_key': s3_key,
                's3_url': f"https://s3.amazonaws.com/manim-renders/{s3_key}",
                'cloudfront_url': f"https://cdn.example.com/{s3_key}",
                'file_size_bytes': os.path.getsize(video_path),
                'duration_seconds': get_video_duration(video_path),
                'resolution': '1920x1080'
            }

        # Use cache automatically
        video_url, was_cached = render_with_cache(
            cache_manager=cache,
            user_id=user_id,
            tool_name="plot_2d_graph",
            input_params={"expression": expression, "color": color},
            render_function=render
        )

        return {
            "video_url": video_url,
            "cached": was_cached,
            "message": "Render from cache" if was_cached else "Generated new render"
        }


# ============================================================================
# Example 4: Cache analytics and monitoring
# ============================================================================

def example_cache_analytics():
    """Shows how to monitor cache performance."""

    db = psycopg2.connect(
        host="localhost",
        database="manim_mcp",
        user="your_user",
        password="your_password"
    )

    cache = CacheManager(db)

    # Get overall statistics
    stats = cache.get_cache_stats()

    print("\n=== Cache Performance ===")
    print(f"Total cached renders: {stats['total_cached_renders']}")
    print(f"Total cache hits: {stats['total_cache_hits']}")
    print(f"Cache hit rate: {stats['cache_hit_rate']:.1f}%")
    print(f"Storage used: {stats['total_storage_bytes'] / 1024 / 1024:.1f} MB")
    print(f"Unique tools cached: {stats['unique_tools']}")

    # Get most popular cached renders
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM get_top_cached_renders(10)")

        print("\n=== Top 10 Most Popular Renders ===")
        for row in cursor.fetchall():
            tool_name, input_params, hit_count, version, size_mb, age_days = row
            print(f"{tool_name}: {hit_count} hits, {size_mb:.1f}MB, {age_days} days old")
            print(f"  Params: {input_params}")

    # Find stale renders (candidates for cleanup)
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM find_stale_cached_renders(90, 2)")

        print("\n=== Stale Renders (Old + Low Usage) ===")
        for row in cursor.fetchall():
            render_id, tool_name, hit_count, age_days, size_mb, s3_key = row
            print(f"{tool_name}: {hit_count} hits in {age_days} days ({size_mb:.1f}MB)")
            print(f"  S3 Key: {s3_key}")


# ============================================================================
# Example 5: Version-aware caching
# ============================================================================

def example_version_bumping():
    """
    Shows how version bumping invalidates old cache entries.

    When you update your Manim version or change rendering logic,
    bump the version in cache_manager.py:
        CURRENT_RENDERER_VERSION = "v1.0.1"  # was v1.0.0

    Old cache entries with v1.0.0 won't be returned for new requests,
    but they remain in the database for users who might reference them.
    """

    db = psycopg2.connect(
        host="localhost",
        database="manim_mcp",
        user="your_user",
        password="your_password"
    )

    cache = CacheManager(db)
    tool_name = "plot_2d_graph"
    params = {"expression": "3x + 1"}

    # This will only match cache entries with the current version
    current = cache.lookup_cached_render(tool_name, params, "v1.0.1")

    # You can explicitly look up old versions if needed
    old = cache.lookup_cached_render(tool_name, params, "v1.0.0")

    if current:
        print(f"✓ Found render with current version (v1.0.1)")
    elif old:
        print(f"⚠ Only found old version (v1.0.0) - will regenerate")
    else:
        print(f"✗ No cached render found")


# ============================================================================
# Helper functions (you'll implement these in your actual app)
# ============================================================================

def generate_manim_video(params):
    """Placeholder for your actual Manim rendering logic."""
    # Your implementation here
    return {
        'bucket': 'manim-renders',
        'key': 'renders/example.mp4',
        'url': 'https://s3.amazonaws.com/manim-renders/renders/example.mp4',
        'cdn_url': 'https://cdn.example.com/renders/example.mp4',
        'size': 1048576,
        'duration': 5.0,
        'render_time_ms': 3500
    }


def get_db_connection():
    """Get database connection from your connection pool."""
    pass


def get_current_user_id():
    """Get current user ID from request context."""
    pass


def upload_to_s3(file_path):
    """Upload file to S3 and return key."""
    pass


def get_video_duration(file_path):
    """Get duration of video file in seconds."""
    pass


if __name__ == "__main__":
    # Run examples
    print("Example 1: Manual cache flow")
    example_manual_cache_flow()

    print("\n" + "="*60 + "\n")

    print("Example 2: Simple cache flow")
    example_simple_cache_flow()

    print("\n" + "="*60 + "\n")

    print("Example 4: Cache analytics")
    example_cache_analytics()
