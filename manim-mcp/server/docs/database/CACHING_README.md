# Render Caching System

This document explains the render caching system for the Manim MCP server, which enables cross-user video caching to dramatically reduce rendering costs and improve performance.

## Overview

**Problem:** When multiple users request the same Manim animation (e.g., `plot_2d_graph("3x + 1")`), the system would render it multiple times, wasting compute resources and storage.

**Solution:** A shared cache layer that stores rendered videos once and reuses them across all users.

## Architecture

```
User Request → Check Cache → [HIT]  Return existing video (instant)
                          ↓
                        [MISS] Generate video → Store in cache → Return video
```

### Database Tables

1. **`cached_renders`** - Shared cache of rendered videos
   - Indexed by `(input_hash, renderer_version)` for fast lookup
   - Tracks hit counts and access times for analytics
   - Versioned to handle renderer updates

2. **`tool_calls`** (modified) - Now tracks cache usage
   - Added `cached_render_id` - Links to cached render used
   - Added `was_cache_hit` - Boolean flag for analytics

### Key Features

- **Deterministic hashing:** Same input always produces same hash
- **Version-aware:** Different renderer versions maintain separate caches
- **Analytics:** Track hit rates, popular renders, storage usage
- **Automatic cleanup:** Helper functions identify stale renders

## Installation

### 1. Apply the migration

```bash
psql -U your_user -d manim_mcp -f migrations/001_add_render_caching.sql
```

### 2. Verify tables were created

```bash
psql -U your_user -d manim_mcp -c "\dt cached_renders"
```

### 3. Install Python dependencies

```bash
pip install psycopg2-binary  # or psycopg2
```

## Usage

### Basic Integration

The simplest way to use caching is with the `render_with_cache` helper:

```python
from cache_manager import CacheManager, render_with_cache
import psycopg2

# Initialize
db = psycopg2.connect("postgresql://localhost/manim_mcp")
cache = CacheManager(db)

# Define your render function
def render_plot(params):
    video = generate_manim_video(params)  # Your rendering logic
    return {
        's3_bucket': 'my-bucket',
        's3_key': video.key,
        's3_url': video.url,
        'cloudfront_url': video.cdn_url,
        'file_size_bytes': video.size,
        'duration_seconds': video.duration,
        'resolution': '1920x1080'
    }

# Use it!
video_url, was_cached = render_with_cache(
    cache_manager=cache,
    user_id=current_user_id,
    tool_name="plot_2d_graph",
    input_params={"expression": "3x + 1"},
    render_function=render_plot
)

if was_cached:
    print(f"✓ Cache hit! Instant delivery")
else:
    print(f"✓ Generated and cached for future users")
```

### MCP Tool Integration

Integrate into your MCP tool handlers:

```python
@mcp.tool()
async def plot_2d_graph(expression: str, color: str = "blue"):
    """Plot a 2D mathematical function with caching."""

    cache = CacheManager(get_db_connection())

    def render(params):
        # Your existing Manim code
        scene = Plot2DScene(params['expression'], params['color'])
        video_path = scene.render()
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

    video_url, cached = render_with_cache(
        cache,
        current_user_id,
        "plot_2d_graph",
        {"expression": expression, "color": color},
        render
    )

    return {"video_url": video_url, "cached": cached}
```

## Version Management

### When to Bump Version

Update `CURRENT_RENDERER_VERSION` in `cache_manager.py` when:

- Upgrading Manim to a new version
- Changing rendering quality settings
- Fixing bugs that affect output
- Modifying default styles or themes

```python
# In cache_manager.py
CURRENT_RENDERER_VERSION = "v1.1.0"  # Increment this
```

### What Happens After Version Bump

- New requests won't match old cached renders (cache miss)
- Old renders remain in database (not deleted)
- Users who reference old renders can still access them
- Gradually, new version builds up its own cache

### Manual Cache Invalidation

If you need to invalidate specific renders:

```sql
-- Delete all cached renders for a specific tool
DELETE FROM cached_renders WHERE tool_name = 'plot_2d_graph';

-- Delete renders older than a certain version
DELETE FROM cached_renders WHERE renderer_version < 'v1.0.0';

-- Delete specific input
DELETE FROM cached_renders
WHERE input_hash = 'abc123...';
```

## Analytics & Monitoring

### Overall Cache Performance

```python
cache = CacheManager(db)
stats = cache.get_cache_stats()

print(f"Cache hit rate: {stats['cache_hit_rate']:.1f}%")
print(f"Total storage: {stats['total_storage_bytes'] / 1024 / 1024:.1f} MB")
print(f"Total cache hits: {stats['total_cache_hits']}")
```

### Most Popular Renders

```sql
SELECT * FROM get_top_cached_renders(20);
```

Output:
```
tool_name      | input_params                    | hit_count | file_size_mb
---------------|----------------------------------|-----------|-------------
plot_2d_graph  | {"expression": "3x + 1"}        | 347       | 1.2
plot_2d_graph  | {"expression": "sin(x)"}        | 203       | 1.1
animate_text   | {"text": "Hello World"}         | 156       | 0.8
```

### Cache Hit Rate by Tool

```sql
SELECT
    tc.tool_name,
    COUNT(*) as total_calls,
    SUM(CASE WHEN tc.was_cache_hit THEN 1 ELSE 0 END) as cache_hits,
    ROUND(AVG(CASE WHEN tc.was_cache_hit THEN 100 ELSE 0 END), 2) as hit_rate_pct
FROM tool_calls tc
WHERE tc.created_at > NOW() - INTERVAL '30 days'
GROUP BY tc.tool_name
ORDER BY cache_hits DESC;
```

### Find Stale Renders

Identify renders that are old and rarely used (cleanup candidates):

```sql
-- Find renders older than 90 days with ≤5 hits
SELECT * FROM find_stale_cached_renders(90, 5);
```

## Cost Savings

### Storage Savings

**Without caching:**
- 1,000 users each request `plot_2d_graph("3x + 1")` (1MB each)
- Storage needed: 1,000 MB

**With caching:**
- First user triggers render → 1 MB stored
- Next 999 users reuse cached video
- Storage needed: 1 MB
- **Savings: 99.9%**

### Compute Savings

**Without caching:**
- Each render takes 3 seconds @ $0.01/second
- 1,000 renders = 3,000 seconds = $30.00

**With caching:**
- First render: 3 seconds = $0.03
- Next 999 renders: instant, $0.00
- **Cost: $0.03 (99.9% savings)**

### Real-World Example

Assumptions:
- 10,000 users/month
- Average 5 tool calls per user = 50,000 tool calls
- 30% of requests are duplicates
- Each render costs $0.03 (compute + storage)

**Without caching:**
- Cost: 50,000 × $0.03 = $1,500/month

**With caching (70% hit rate):**
- Cache misses: 15,000 × $0.03 = $450
- Cache hits: 35,000 × $0.00 = $0
- **Cost: $450/month**
- **Savings: $1,050/month (70%)**

## Best Practices

### 1. Deterministic Rendering

Ensure Manim produces identical output for identical input:

❌ **Bad:**
```python
def render_plot(expression):
    timestamp = datetime.now().isoformat()
    title = f"Plot generated at {timestamp}"  # Non-deterministic!
    scene = Plot2D(expression, title=title)
    return scene.render()
```

✅ **Good:**
```python
def render_plot(expression):
    title = f"Plot of {expression}"  # Deterministic
    scene = Plot2D(expression, title=title)
    return scene.render()
```

### 2. Input Normalization

The cache manager handles this automatically, but be aware:

```python
# These will produce the SAME hash (order doesn't matter):
params1 = {"expression": "3x+1", "color": "blue"}
params2 = {"color": "blue", "expression": "3x+1"}

# These will produce DIFFERENT hashes:
params3 = {"expression": "3x + 1"}  # Space difference
params4 = {"expression": "3x+1"}

# Solution: Normalize your inputs before caching
expression = expression.replace(" ", "")  # Remove spaces
```

### 3. User-Specific Content

Don't cache renders that contain user-specific information:

```python
def should_cache(tool_name, params):
    # Don't cache personalized content
    if "user_name" in params or "user_id" in params:
        return False
    return True

if should_cache(tool_name, params):
    video_url, _ = render_with_cache(...)
else:
    video_url = render_without_cache(...)
```

### 4. Cache Cleanup Strategy

Set up a monthly cron job to clean up stale renders:

```python
# cleanup_cache.py
from cache_manager import CacheManager
import boto3

db = connect_to_db()
cache = CacheManager(db)
s3 = boto3.client('s3')

# Find renders that are >180 days old with ≤2 hits
with db.cursor() as cursor:
    cursor.execute("SELECT * FROM find_stale_cached_renders(180, 2)")

    for render in cursor.fetchall():
        render_id, tool_name, hit_count, age_days, size_mb, s3_key = render

        # Delete from S3
        s3.delete_object(Bucket='manim-renders', Key=s3_key)

        # Delete from database
        cursor.execute("DELETE FROM cached_renders WHERE id = %s", (render_id,))

    db.commit()

print(f"Cleaned up {cursor.rowcount} stale renders")
```

### 5. Monitoring Alerts

Set up alerts for:

- **Low cache hit rate** (<50%) - May indicate poor cache strategy
- **High storage usage** - May need cleanup
- **Slow renders** - Check execution times in `tool_calls`

## Troubleshooting

### Cache Not Working (All Misses)

**Check 1:** Verify input normalization
```python
from cache_manager import CacheManager
hash1 = CacheManager.compute_input_hash("tool", {"a": 1, "b": 2})
hash2 = CacheManager.compute_input_hash("tool", {"b": 2, "a": 1})
assert hash1 == hash2  # Should be equal
```

**Check 2:** Verify version matches
```sql
SELECT DISTINCT renderer_version FROM cached_renders;
-- Should match CURRENT_RENDERER_VERSION in cache_manager.py
```

**Check 3:** Check database triggers
```sql
-- Should return rows for both functions
SELECT * FROM pg_trigger WHERE tgname = 'track_cache_hits';
```

### High Storage Costs

**Check storage by tool:**
```sql
SELECT
    tool_name,
    COUNT(*) as render_count,
    SUM(file_size_bytes) / 1024 / 1024 as total_mb,
    AVG(hit_count) as avg_hits
FROM cached_renders
GROUP BY tool_name
ORDER BY total_mb DESC;
```

**Action:** Delete low-value renders (see Cache Cleanup Strategy above)

### Incorrect Video Returned

**Cause:** Hash collision (extremely rare) or input not normalized

**Fix:** Add more context to hash computation in `cache_manager.py`:
```python
canonical = {
    "tool": tool_name,
    "params": input_params,
    "version": renderer_version  # Include version in hash
}
```

## Migration Rollback

If you need to rollback the caching system:

```sql
-- Remove triggers
DROP TRIGGER IF EXISTS track_cache_hits ON tool_calls;
DROP FUNCTION IF EXISTS increment_cache_hit();

-- Remove helper functions
DROP FUNCTION IF EXISTS get_cache_stats();
DROP FUNCTION IF EXISTS find_stale_cached_renders(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_top_cached_renders(INTEGER);

-- Remove columns from tool_calls
ALTER TABLE tool_calls DROP COLUMN IF EXISTS cached_render_id;
ALTER TABLE tool_calls DROP COLUMN IF EXISTS was_cache_hit;

-- Remove indexes
DROP INDEX IF EXISTS idx_cached_renders_hash_version;
DROP INDEX IF EXISTS idx_cached_renders_tool;
DROP INDEX IF EXISTS idx_cached_renders_last_accessed;
DROP INDEX IF EXISTS idx_cached_renders_hit_count;
DROP INDEX IF EXISTS idx_tool_calls_cached_render;

-- Remove table
DROP TABLE IF EXISTS cached_renders;
```

## Future Enhancements

Potential improvements to consider:

1. **Automatic expiration** - Add TTL to cached renders
2. **Compression** - Store smaller video formats for popular renders
3. **Preemptive rendering** - Pre-render common expressions
4. **Geographic caching** - Cache closer to users (CloudFront)
5. **A/B testing** - Compare cached vs fresh renders for quality
6. **Smart cleanup** - ML to predict which renders to keep

## Support

For questions or issues:
1. Check the examples in `example_cache_usage.py`
2. Review analytics queries in the migration file
3. Open an issue on GitHub
