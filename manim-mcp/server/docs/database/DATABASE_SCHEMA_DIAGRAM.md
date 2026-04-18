# Manim MCP Database Schema Diagram

**Version:** 1.0 (with render caching)
**Last Updated:** 2025-11-13
**PostgreSQL Version:** 15+

---

## Complete Entity-Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MANIM MCP DATABASE SCHEMA                        │
│                     (All tables and relationships)                      │
└─────────────────────────────────────────────────────────────────────────┘


                              ┌──────────────┐
                              │   Auth0      │
                              │ (External)   │
                              └──────┬───────┘
                                     │ syncs
                                     ▼
                    ┌─────────────────────────────┐
                    │         USERS               │
                    │─────────────────────────────│
                    │ • id (PK) UUID              │
                    │ • auth0_id UNIQUE           │
                    │ • email UNIQUE              │
                    │ • name                      │
                    │ • picture_url               │
                    │ • subscription_tier         │
                    │  ('free','pro','enterprise')│
                    │ • max_tool_calls_per_month  │
                    │ • tool_calls_this_month     │◄── Auto-incremented
                    │ • created_at                │    by trigger
                    │ • updated_at                │
                    │ • last_login_at             │
                    └──────────────┬──────────────┘
                                   │
            ┌──────────────────────┼────────────────────────┐
            │                      │                        │
            ▼                      ▼                        ▼
  ┌─────────────────┐    ┌────────────────┐      ┌────────────────┐
  │ CONVERSATIONS   │    │USAGE_TRACKING  │      │    VIDEOS      │
  │─────────────────│    │────────────────│      │────────────────│
  │ • id (PK)       │    │ • id (PK)      │      │ • id (PK)      │
  │ • user_id (FK)  │    │ • user_id (FK) │      │ • user_id (FK) │
  │ • title         │    │ • month (DATE) │      │ • tool_call_id │
  │ • summary       │    │ • tool_calls   │      │ • s3_bucket    │
  │ • is_archived   │    │ • videos_gen   │      │ • s3_key       │
  │ • created_at    │    │ • storage_bytes│      │ • s3_url       │
  │ • updated_at    │    │ • reset_at     │      │ • cloudfront   │
  └────────┬────────┘    │ UNIQUE(user,   │      │ • file_size    │
           │             │        month)  │      │ • duration     │
           │             └────────────────┘      │ • resolution   │
           │                                     │ • created_at   │
           │                                     │ • expires_at   │
           │                                     │ • deleted_at   │
           ▼                                     └────────────────┘
  ┌─────────────────┐
  │    MESSAGES     │
  │─────────────────│
  │ • id (PK)       │
  │ • conv_id (FK)  │
  │ • role          │
  │   ('user',      │
  │    'assistant', │
  │    'system')    │
  │ • content       │
  │ • created_at    │
  └────────┬────────┘
           │
           │
           ▼
  ┌──────────────────────────────────────────────────────┐
  │                    TOOL_CALLS                        │
  │──────────────────────────────────────────────────────│
  │ • id (PK)                                            │
  │ • message_id (FK) ──────► messages.id                │
  │ • user_id (FK) ──────────► users.id                  │
  │ • tool_name VARCHAR(100)                             │
  │ • tool_input (JSONB)                                 │
  │ • tool_output (JSONB)                                │
  │ • cached_render_id (FK)  ─┐                          │
  │ • was_cache_hit BOOLEAN  ─┤ NEW! Cache tracking      │
  │ • success BOOLEAN         │                          │
  │ • error_message TEXT      │                          │
  │ • video_path VARCHAR      │                          │
  │ • execution_time_ms INT   │                          │
  │ • created_at TIMESTAMP    │                          │
  └───────────────────────────┼──────────────────────────┘
                              │
                              │ References
                              │ (when cache used)
                              │
                              ▼
          ┌────────────────────────────────────────────┐
          │          CACHED_RENDERS                    │
          │  (Shared across ALL users for efficiency)  │
          │────────────────────────────────────────────│
          │ • id (PK)                                  │
          │ • tool_name VARCHAR(100)                   │
          │ • input_hash VARCHAR(64) ◄─── SHA256       │
          │ • input_params (JSONB)                     │
          │ • renderer_version VARCHAR(20)             │
          │ • s3_bucket                                │
          │ • s3_key                                   │
          │ • s3_url                                   │
          │ • cloudfront_url                           │
          │ • file_size_bytes                          │
          │ • duration_seconds                         │
          │ • resolution                               │
          │ • hit_count INTEGER ◄──── Auto-incremented │
          │ • first_generated_at                       │
          │ • last_accessed_at  ◄──── Auto-updated     │
          │                                            │
          │ UNIQUE(input_hash, renderer_version)       │
          └────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│                    RELATIONSHIP KEY                         │
└─────────────────────────────────────────────────────────────┘

  ──────►  One-to-Many (FK relationship)
  ═══════► One-to-One (or optional)
  - - - ►  Trigger/Auto-update

  PK = Primary Key
  FK = Foreign Key
  UNIQUE = Unique constraint
```

---

## Table Details

### 1. USERS
**Purpose:** Store user accounts synced with Auth0
**Key Features:**
- Unique Auth0 ID and email
- Subscription tier enforcement
- Monthly tool call tracking (auto-incremented by trigger)

**Relationships:**
- Parent to: conversations, tool_calls, videos, usage_tracking

---

### 2. CONVERSATIONS
**Purpose:** Chat sessions between user and bot
**Key Features:**
- Optional AI-generated title and summary
- Soft delete via `is_archived`
- Auto-updated timestamp

**Relationships:**
- Belongs to: users (1 user → many conversations)
- Parent to: messages (1 conversation → many messages)

---

### 3. MESSAGES
**Purpose:** Individual messages within conversations
**Key Features:**
- Role-based (user, assistant, system)
- Chronologically ordered by `created_at`

**Relationships:**
- Belongs to: conversations
- Parent to: tool_calls (1 message → many tool calls)

---

### 4. TOOL_CALLS
**Purpose:** Track every Manim tool invocation
**Key Features:**
- **NEW:** Cache tracking via `cached_render_id` and `was_cache_hit`
- JSONB storage for flexible input/output
- Performance tracking via `execution_time_ms`
- Triggers auto-increment user's monthly counter

**Relationships:**
- Belongs to: users, messages (optional)
- References: cached_renders (optional - when cache used)

---

### 5. VIDEOS
**Purpose:** Metadata for generated videos stored in S3
**Key Features:**
- S3 and CloudFront URLs
- Expiration dates for cleanup
- Soft delete via `deleted_at`

**Relationships:**
- Belongs to: users
- Optionally linked to: tool_calls

---

### 6. USAGE_TRACKING
**Purpose:** Monthly usage summaries per user
**Key Features:**
- One record per user per month
- Auto-updated by tool_calls trigger
- Reset monthly via `reset_monthly_tool_calls()` function

**Relationships:**
- Belongs to: users
- Unique constraint on (user_id, month)

---

### 7. CACHED_RENDERS ⭐ NEW!
**Purpose:** Shared cache of rendered videos across ALL users
**Key Features:**
- **Deduplication:** Same input → same video (no duplicates)
- **Versioned:** Different renderer versions maintain separate caches
- **Analytics:** Tracks hit count and access patterns
- **Automatic:** Triggers update `hit_count` and `last_accessed_at`

**Relationships:**
- Referenced by: tool_calls (many tool calls → 1 cached render)
- **Shared resource:** Not owned by any single user

**Unique Constraint:** `(input_hash, renderer_version)`
- Ensures only one cached render per unique input per version

---

## Data Flow: Tool Call with Caching

```
┌─────────────────────────────────────────────────────────────┐
│  USER REQUEST                                               │
│  "Plot the function 3x + 1"                                 │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
                 ┌──────────────────────┐
                 │ 1. Compute Hash      │
                 │ SHA256(tool_name +   │
                 │        input_params) │
                 └──────────┬───────────┘
                            ▼
                 ┌──────────────────────┐
                 │ 2. Query Cache       │
                 │ SELECT * FROM        │
                 │ cached_renders WHERE │
                 │ input_hash = ?       │
                 └──────────┬───────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
         CACHE HIT                   CACHE MISS
              │                           │
              ▼                           ▼
   ┌──────────────────┐        ┌──────────────────┐
   │ 3a. Return URL   │        │ 3b. Render Video │
   │ (instant!)       │        │ • Run Manim      │
   │                  │        │ • Upload to S3   │
   │ execution: ~50ms │        │ • Store in cache │
   └────────┬─────────┘        │                  │
            │                  │execution: ~3500ms│
            │                  └────────┬─────────┘
            │                           │
            └───────────┬───────────────┘
                        ▼
            ┌───────────────────────┐
            │ 4. Record Tool Call   │
            │ INSERT INTO tool_calls│
            │ - user_id             │
            │ - tool_name           │
            │ - cached_render_id    │
            │ - was_cache_hit       │
            └───────────┬───────────┘
                        ▼
            ┌───────────────────────┐
            │ 5. Trigger Fires      │
            │ • Increment hit_count │
            │ • Update last_access  │
            │ • Update user counter │
            │ • Update usage_track  │
            └───────────┬───────────┘
                        ▼
            ┌───────────────────────┐
            │ 6. Return to User     │
            │ { video_url, cached } │
            └───────────────────────┘
```

---

## Indexes for Performance

### Users Table
```sql
idx_users_auth0_id (auth0_id)
idx_users_email (email)
```

### Conversations Table
```sql
idx_conversations_user (user_id)
idx_conversations_updated (updated_at DESC)
```

### Messages Table
```sql
idx_messages_conversation (conversation_id)
idx_messages_created (created_at)
```

### Tool Calls Table
```sql
idx_tool_calls_user (user_id)
idx_tool_calls_message (message_id)
idx_tool_calls_created (created_at DESC)
idx_tool_calls_tool_name (tool_name)
idx_tool_calls_cached_render (cached_render_id)  ← NEW!
```

### Videos Table
```sql
idx_videos_user (user_id)
idx_videos_expires (expires_at) WHERE deleted_at IS NULL
idx_videos_s3_key (s3_key)
```

### Usage Tracking Table
```sql
idx_usage_tracking_user_month (user_id, month)
```

### Cached Renders Table ⭐ NEW!
```sql
idx_cached_renders_hash_version (input_hash, renderer_version)  ← Primary lookup!
idx_cached_renders_tool (tool_name)
idx_cached_renders_last_accessed (last_accessed_at DESC)
idx_cached_renders_hit_count (hit_count DESC)
```

---

## Automatic Behaviors (Triggers)

### 1. Auto-update Timestamps
**Trigger:** `update_users_updated_at`, `update_conversations_updated_at`
**When:** BEFORE UPDATE on users or conversations
**Action:** Sets `updated_at = NOW()`

### 2. Track Tool Usage
**Trigger:** `track_tool_usage`
**When:** AFTER INSERT on tool_calls
**Action:**
- Increments `users.tool_calls_this_month`
- Updates `usage_tracking` (upsert)

### 3. Track Cache Hits ⭐ NEW!
**Trigger:** `track_cache_hits`
**When:** AFTER INSERT on tool_calls
**Action:** If `was_cache_hit = TRUE`:
- Increments `cached_renders.hit_count`
- Updates `cached_renders.last_accessed_at = NOW()`

---

## Helper Functions

### Cache Management

#### `get_cache_stats()`
Returns overall cache performance metrics:
- Total cached renders
- Total cache hits
- Total storage used
- Cache hit rate (%)
- Unique tools cached

**Usage:**
```sql
SELECT * FROM get_cache_stats();
```

#### `get_top_cached_renders(limit)`
Returns most frequently reused renders

**Usage:**
```sql
SELECT * FROM get_top_cached_renders(10);
```

#### `find_stale_cached_renders(min_age_days, max_hit_count)`
Find old, rarely-used renders for cleanup

**Usage:**
```sql
-- Renders older than 90 days with ≤5 hits
SELECT * FROM find_stale_cached_renders(90, 5);
```

### User Management

#### `reset_monthly_tool_calls()`
Reset all users' monthly counters (run via cron)

**Usage:**
```sql
SELECT reset_monthly_tool_calls();
```

---

## Example Queries

### Get User's Conversation History
```sql
SELECT c.id, c.title, c.created_at, COUNT(m.id) as message_count
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
WHERE c.user_id = 'user-uuid'
  AND c.is_archived = FALSE
GROUP BY c.id
ORDER BY c.updated_at DESC;
```

### Cache Hit Rate by Tool (Last 30 Days)
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

### Most Active Users This Month
```sql
SELECT u.email, u.subscription_tier, ut.tool_calls_count
FROM users u
JOIN usage_tracking ut ON u.id = ut.user_id
WHERE ut.month = DATE_TRUNC('month', NOW())::DATE
ORDER BY ut.tool_calls_count DESC
LIMIT 10;
```

### Storage Usage by User
```sql
SELECT
    u.email,
    COUNT(v.id) as video_count,
    SUM(v.file_size_bytes) / 1024 / 1024 as storage_mb
FROM users u
JOIN videos v ON u.id = v.user_id
WHERE v.deleted_at IS NULL
GROUP BY u.email
ORDER BY storage_mb DESC;
```

### Most Popular Cached Renders
```sql
SELECT
    tool_name,
    input_params->>'expression' as expression,
    hit_count,
    (file_size_bytes / 1024.0 / 1024.0)::DECIMAL(10,2) as size_mb,
    EXTRACT(DAY FROM NOW() - first_generated_at)::INTEGER as age_days
FROM cached_renders
ORDER BY hit_count DESC
LIMIT 20;
```

---

## Cascade Deletion Behavior

### When a USER is deleted:
```
DELETE FROM users
  ↓ CASCADE
  ├─ All conversations deleted
  │  ↓ CASCADE
  │  └─ All messages in those conversations deleted
  │     ↓ CASCADE
  │     └─ All tool_calls from those messages deleted
  │
  ├─ All tool_calls for that user deleted
  ├─ All videos for that user deleted
  └─ All usage_tracking for that user deleted
```

### When a CACHED_RENDER is deleted:
```
DELETE FROM cached_renders
  ↓ SET NULL
  └─ All tool_calls.cached_render_id → NULL
     (preserves tool call history, just unlinks from cache)
```

---

## Version Management

### Current Version Tracking
Cache entries are versioned via the `renderer_version` column.

**In your application (`cache_manager.py`):**
```python
CURRENT_RENDERER_VERSION = "v1.0.0"
```

### When to Bump Version
- Manim version upgrade
- Rendering logic changes
- Quality settings changes
- Bug fixes affecting output

### Version Bump Process
1. Update `CURRENT_RENDERER_VERSION` in `cache_manager.py`
2. Deploy application
3. New renders use new version
4. Old cached renders remain (different version)
5. Gradually, new cache builds up
6. Clean up old versions after transition period

**Example:**
```sql
-- See what versions exist
SELECT renderer_version, COUNT(*) as render_count
FROM cached_renders
GROUP BY renderer_version;

-- Delete old version after 90 days
DELETE FROM cached_renders
WHERE renderer_version = 'v0.9.0'
  AND first_generated_at < NOW() - INTERVAL '90 days';
```

---

## Schema Statistics

| Table | Primary Purpose | Avg Size | Critical? |
|-------|----------------|----------|-----------|
| users | Auth/billing | ~1KB/user | ⭐⭐⭐ |
| conversations | Chat history | ~500B/conv | ⭐⭐ |
| messages | Chat content | ~1KB/msg | ⭐⭐ |
| tool_calls | Audit/analytics | ~2KB/call | ⭐⭐⭐ |
| videos | User videos | ~100B + S3 | ⭐⭐ |
| usage_tracking | Billing data | ~200B/month | ⭐⭐⭐ |
| cached_renders | Shared cache | ~500B + S3 | ⭐⭐⭐ |

---

## Backup Recommendations

### Critical Tables (Daily backups)
- `users` - Account data
- `tool_calls` - Usage tracking for billing
- `usage_tracking` - Subscription enforcement
- `cached_renders` - Cost savings

### Important Tables (Weekly backups)
- `conversations` - Can be regenerated from messages
- `messages` - User data
- `videos` - Metadata only (actual videos in S3)

### Backup Strategy
```bash
# Daily backup (critical tables)
pg_dump -t users -t tool_calls -t usage_tracking -t cached_renders \
  manim_mcp > backup_critical_$(date +%Y%m%d).sql

# Weekly full backup
pg_dump manim_mcp > backup_full_$(date +%Y%m%d).sql
```

---

**End of Diagram**
