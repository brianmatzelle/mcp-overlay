# Manim MCP Database Architecture with Caching

## Complete System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          MANIM MCP SYSTEM                                │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │   Auth0      │
                              │ (External)   │
                              └──────┬───────┘
                                     │
                                     │ auth0_id
                                     ▼
                          ┌──────────────────┐
                          │      USERS       │
                          │──────────────────│
                          │ id (PK)          │
                          │ auth0_id         │◄─── Synced with Auth0
                          │ email            │
                          │ subscription_tier│
                          │ tool_calls_limit │
                          │ tool_calls_count │◄─── Auto-incremented
                          └────────┬─────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
            ▼                      ▼                      ▼
  ┌─────────────────┐    ┌────────────────┐    ┌────────────────┐
  │ CONVERSATIONS   │    │ USAGE_TRACKING │    │   VIDEOS       │
  │─────────────────│    │────────────────│    │────────────────│
  │ id (PK)         │    │ id (PK)        │    │ id (PK)        │
  │ user_id (FK)    │    │ user_id (FK)   │    │ user_id (FK)   │
  │ title           │    │ month          │    │ s3_key         │
  │ summary         │    │ tool_calls     │    │ s3_url         │
  │ is_archived     │    │ videos_gen     │    │ cloudfront_url │
  └────────┬────────┘    │ storage_bytes  │    │ expires_at     │
           │             └────────────────┘    └────────────────┘
           │
           ▼
  ┌─────────────────┐
  │    MESSAGES     │
  │─────────────────│
  │ id (PK)         │
  │ conv_id (FK)    │
  │ role            │
  │ content         │
  └────────┬────────┘
           │
           │
           ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                       TOOL_CALLS                             │
  │─────────────────────────────────────────────────────────────│
  │ id (PK)                                                      │
  │ user_id (FK) ────────────────┐                              │
  │ message_id (FK)              │                              │
  │ tool_name                    │                              │
  │ tool_input (JSONB)           │                              │
  │ tool_output (JSONB)          │                              │
  │ success                      │                              │
  │ cached_render_id (FK) ───────┼─────────┐                   │
  │ was_cache_hit ◄──────────────┼─────────┤ NEW!             │
  │ execution_time_ms            │         │                   │
  └──────────────────────────────┼─────────┼───────────────────┘
                                 │         │
                                 │         │
                    Increments   │         │  References
                    user counter │         │  cached render
                    via trigger  │         │
                                 │         │
                                 │         ▼
                                 │  ┌────────────────────────┐
                                 │  │   CACHED_RENDERS       │
                                 │  │────────────────────────│
                                 │  │ id (PK)                │
                                 │  │ tool_name              │
                                 │  │ input_hash (UNIQUE)    │◄── SHA256
                                 │  │ input_params (JSONB)   │
                                 │  │ renderer_version       │
                                 │  │ s3_bucket              │
                                 │  │ s3_key                 │
                                 │  │ s3_url                 │
                                 │  │ cloudfront_url         │
                                 │  │ file_size_bytes        │
                                 │  │ hit_count ◄────────────┤ Auto-inc
                                 │  │ first_generated_at     │ via trigger
                                 │  │ last_accessed_at       │
                                 └─►└────────────────────────┘
                                     ▲
                                     │
                                     │ Shared across ALL users!
                                     │ Keyed by (input_hash, version)
```

## Data Flow: Tool Call with Caching

```
1. USER REQUEST
   User: "Plot 3x + 1"
   ↓
   ┌─────────────────────────────────────┐
   │ Application receives request        │
   │ - tool: "plot_2d_graph"            │
   │ - params: {"expression": "3x + 1"} │
   └─────────────────┬───────────────────┘
                     ↓
2. HASH INPUT
   ┌─────────────────────────────────────┐
   │ Compute SHA256 hash:                │
   │ hash("plot_2d_graph", params)       │
   │ → "a1b2c3d4e5f6..."                │
   └─────────────────┬───────────────────┘
                     ↓
3. CACHE LOOKUP
   ┌─────────────────────────────────────┐
   │ Query: cached_renders               │
   │ WHERE input_hash = "a1b2..."        │
   │   AND renderer_version = "v1.0.0"   │
   └─────────────────┬───────────────────┘
                     ↓
              ┌──────┴──────┐
              │             │
        CACHE HIT      CACHE MISS
              │             │
              ▼             ▼
   ┌──────────────┐  ┌──────────────┐
   │ 4a. REUSE    │  │ 4b. GENERATE │
   │──────────────│  │──────────────│
   │ Get existing │  │ Run Manim    │
   │ video URL    │  │ Upload to S3 │
   │              │  │ Store in:    │
   │              │  │ - cached_rend│
   │              │  │ - videos     │
   └──────┬───────┘  └──────┬───────┘
          │                 │
          │                 │
          └────────┬────────┘
                   ▼
5. RECORD TOOL CALL
   ┌─────────────────────────────────────┐
   │ Insert into tool_calls:             │
   │ - user_id: current_user             │
   │ - tool_name: "plot_2d_graph"        │
   │ - cached_render_id: (reference)     │
   │ - was_cache_hit: TRUE/FALSE         │
   │                                     │
   │ Trigger fires:                      │
   │ - Increment cached_renders.hit_count│
   │ - Increment users.tool_calls_count  │
   │ - Update usage_tracking             │
   └─────────────────┬───────────────────┘
                     ↓
6. RETURN TO USER
   ┌─────────────────────────────────────┐
   │ Response:                           │
   │ {                                   │
   │   "video_url": "https://cdn...",    │
   │   "cached": true/false,             │
   │   "execution_time_ms": 0 or 3500    │
   │ }                                   │
   └─────────────────────────────────────┘
```

## Table Relationships Summary

```
USERS (1) ──────────────┬──────────────── (N) CONVERSATIONS
                        │
                        ├──────────────── (N) TOOL_CALLS
                        │
                        ├──────────────── (N) VIDEOS
                        │
                        └──────────────── (N) USAGE_TRACKING


CONVERSATIONS (1) ────────────────────── (N) MESSAGES


MESSAGES (1) ─────────────────────────── (N) TOOL_CALLS


CACHED_RENDERS (1) ───────────────────── (N) TOOL_CALLS
   │
   └── Shared across all users
       Unique on (input_hash, renderer_version)


CACHED_RENDERS (1) ──── optional ────── (1) VIDEOS
   │
   └── Videos can reference their original cache entry
```

## Cache Performance Metrics

```
┌────────────────────────────────────────────────────────────┐
│                    CACHE ANALYTICS                         │
└────────────────────────────────────────────────────────────┘

┌─────────────────────┐    ┌──────────────────────────────┐
│   CACHED_RENDERS    │    │      DERIVED METRICS         │
│─────────────────────│    │──────────────────────────────│
│ hit_count           │───►│ Cache Hit Rate               │
│ first_generated_at  │───►│ Cache Age Distribution       │
│ last_accessed_at    │───►│ Recently Used Renders        │
│ file_size_bytes     │───►│ Total Storage Used           │
└─────────────────────┘    └──────────────────────────────┘
         │
         │ JOIN
         ▼
┌─────────────────────┐    ┌──────────────────────────────┐
│    TOOL_CALLS       │    │      USAGE METRICS           │
│─────────────────────│    │──────────────────────────────│
│ was_cache_hit       │───►│ Hit Rate by Tool             │
│ execution_time_ms   │───►│ Avg Render Time (misses)     │
│ created_at          │───►│ Calls per Day/Week/Month     │
└─────────────────────┘    └──────────────────────────────┘

Queries:
  • get_cache_stats()             → Overall performance
  • get_top_cached_renders(10)    → Most popular
  • find_stale_cached_renders()   → Cleanup candidates
```

## Storage Strategy

```
┌────────────────────────────────────────────────────────────┐
│                       S3 STORAGE                           │
└────────────────────────────────────────────────────────────┘

User-Specific Videos (OLD APPROACH):
  s3://manim-renders/users/user-123/video-abc.mp4
  s3://manim-renders/users/user-456/video-abc.mp4  ← Duplicate!
  s3://manim-renders/users/user-789/video-abc.mp4  ← Duplicate!

  Storage: 3 × 1MB = 3MB for same content


Cached Renders (NEW APPROACH):
  s3://manim-renders/cache/v1.0.0/a1b2c3d4e5f6.mp4  ← Shared!

  Storage: 1 × 1MB = 1MB
  Referenced by: cached_renders table
  Accessed by: All users via cloudfront_url

  Savings: 66% reduction (3MB → 1MB)


Lifecycle Policy:
  • User videos: expire after 30 days (from videos.expires_at)
  • Cached renders: keep based on hit_count + age
  • Delete via find_stale_cached_renders()
```

## Version Management Flow

```
When you deploy a new Manim version:

1. Update cache_manager.py
   CURRENT_RENDERER_VERSION = "v1.1.0"  # was v1.0.0

2. Deploy application

3. New requests
   ├─ Query: cached_renders WHERE version = "v1.1.0"
   ├─ Result: MISS (no v1.1.0 renders exist yet)
   └─ Action: Generate new renders with v1.1.0 tag

4. Old renders still exist
   ├─ cached_renders WHERE version = "v1.0.0"
   ├─ Still accessible if explicitly requested
   └─ Can be manually deleted when ready

5. Gradual migration
   ├─ v1.0.0 renders: decreasing hit_count (aging out)
   ├─ v1.1.0 renders: increasing hit_count (building cache)
   └─ Clean up old versions after 90 days
```

## Example: User Journey with Cache

```
Timeline: Multiple users request the same plot

T=0s   User A: "Plot 3x+1"
       ├─ Check cache: MISS
       ├─ Render (3500ms)
       ├─ Store in cached_renders
       ├─ Store in videos (for User A)
       └─ Record tool_call (was_cache_hit=false)
       Total time: 3.5 seconds

T=10s  User B: "Plot 3x+1"
       ├─ Check cache: HIT! (same input_hash)
       ├─ Return existing cloudfront_url
       └─ Record tool_call (was_cache_hit=true)
       Total time: 50ms
       cached_renders.hit_count: 1 → 2

T=20s  User C: "Plot 3x+1"
       ├─ Check cache: HIT!
       └─ Record tool_call (was_cache_hit=true)
       Total time: 50ms
       cached_renders.hit_count: 2 → 3

T=30s  User D: "Plot sin(x)"
       ├─ Check cache: MISS (different input_hash)
       ├─ Render (3500ms)
       ├─ Store in cached_renders (new entry)
       └─ Record tool_call (was_cache_hit=false)
       Total time: 3.5 seconds

Summary:
  Renders generated: 2
  Total execution time: 7 seconds
  Total calls served: 4
  Cache hit rate: 50% (2/4)
  Cost savings: ~50%
```
