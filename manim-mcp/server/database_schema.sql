-- Manim MCP Database Schema
-- PostgreSQL 15+
--
-- This schema supports:
-- - User management (synced with Auth0)
-- - Conversation history
-- - Tool call tracking and analytics
-- - Video metadata and S3 references
-- - Subscription tier enforcement
-- - Cross-user render caching (reduces duplicate renders)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (synced with Auth0)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth0_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    picture_url VARCHAR(500),
    subscription_tier VARCHAR(50) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    max_tool_calls_per_month INTEGER DEFAULT 100,
    tool_calls_this_month INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Conversations (chat sessions)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    summary TEXT, -- AI-generated summary for quick overview
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages within conversations
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tool calls (for debugging, analytics, and cost tracking)
CREATE TABLE tool_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_name VARCHAR(100) NOT NULL,
    tool_input JSONB NOT NULL, -- Store full input parameters
    tool_output JSONB, -- Store full output
    cached_render_id UUID, -- References cached_renders (added later in schema)
    was_cache_hit BOOLEAN DEFAULT FALSE, -- True if this reused a cached render
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    video_path VARCHAR(500), -- S3 key if video was generated
    execution_time_ms INTEGER, -- Performance tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Videos metadata (for S3 management and cleanup)
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_call_id UUID REFERENCES tool_calls(id) ON DELETE SET NULL,
    s3_bucket VARCHAR(255) NOT NULL,
    s3_key VARCHAR(500) NOT NULL UNIQUE,
    s3_url VARCHAR(1000) NOT NULL,
    cloudfront_url VARCHAR(1000),
    file_size_bytes BIGINT,
    duration_seconds DECIMAL(8, 2),
    resolution VARCHAR(20), -- e.g., "1920x1080"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- For automatic cleanup
    deleted_at TIMESTAMP WITH TIME ZONE -- Soft delete
);

-- Subscription usage tracking (reset monthly)
CREATE TABLE usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of month
    tool_calls_count INTEGER DEFAULT 0,
    videos_generated INTEGER DEFAULT 0,
    total_video_storage_bytes BIGINT DEFAULT 0,
    reset_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, month)
);

-- Cached renders (shared across all users for deduplication)
CREATE TABLE cached_renders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_name VARCHAR(100) NOT NULL,
    input_hash VARCHAR(64) NOT NULL, -- SHA256 of normalized input JSON
    input_params JSONB NOT NULL, -- Original input for debugging/audit
    renderer_version VARCHAR(20) NOT NULL, -- Version of Manim/renderer used

    -- S3 storage details
    s3_bucket VARCHAR(255) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    s3_url VARCHAR(1000) NOT NULL,
    cloudfront_url VARCHAR(1000),

    -- Video metadata
    file_size_bytes BIGINT,
    duration_seconds DECIMAL(8, 2),
    resolution VARCHAR(20), -- e.g., "1920x1080"

    -- Cache analytics
    hit_count INTEGER DEFAULT 0,
    first_generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Composite unique constraint: same input + version = same render
    UNIQUE(input_hash, renderer_version)
);

COMMENT ON TABLE cached_renders IS 'Shared cache of rendered videos to avoid duplicate generation across users';
COMMENT ON COLUMN cached_renders.input_hash IS 'SHA256 hash of normalized JSON input (sorted keys) for fast lookup';
COMMENT ON COLUMN cached_renders.renderer_version IS 'Version string (e.g., "v1.0.0") - invalidates cache when renderer changes';
COMMENT ON COLUMN cached_renders.hit_count IS 'Number of times this cached render was reused';

-- Add foreign key constraint for tool_calls -> cached_renders
ALTER TABLE tool_calls
    ADD CONSTRAINT fk_tool_calls_cached_render
    FOREIGN KEY (cached_render_id) REFERENCES cached_renders(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX idx_users_auth0_id ON users(auth0_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_tool_calls_user ON tool_calls(user_id);
CREATE INDEX idx_tool_calls_message ON tool_calls(message_id);
CREATE INDEX idx_tool_calls_created ON tool_calls(created_at DESC);
CREATE INDEX idx_tool_calls_tool_name ON tool_calls(tool_name);
CREATE INDEX idx_videos_user ON videos(user_id);
CREATE INDEX idx_videos_expires ON videos(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_videos_s3_key ON videos(s3_key);
CREATE INDEX idx_usage_tracking_user_month ON usage_tracking(user_id, month);
CREATE INDEX idx_cached_renders_hash_version ON cached_renders(input_hash, renderer_version);
CREATE INDEX idx_cached_renders_tool ON cached_renders(tool_name);
CREATE INDEX idx_cached_renders_last_accessed ON cached_renders(last_accessed_at DESC);
CREATE INDEX idx_cached_renders_hit_count ON cached_renders(hit_count DESC);
CREATE INDEX idx_tool_calls_cached_render ON tool_calls(cached_render_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to increment tool call counter
CREATE OR REPLACE FUNCTION increment_tool_call_counter()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment user's monthly tool call count
    UPDATE users
    SET tool_calls_this_month = tool_calls_this_month + 1
    WHERE id = NEW.user_id;
    
    -- Update or insert usage tracking
    INSERT INTO usage_tracking (user_id, month, tool_calls_count, videos_generated)
    VALUES (
        NEW.user_id,
        DATE_TRUNC('month', NOW())::DATE,
        1,
        CASE WHEN NEW.video_path IS NOT NULL THEN 1 ELSE 0 END
    )
    ON CONFLICT (user_id, month) DO UPDATE SET
        tool_calls_count = usage_tracking.tool_calls_count + 1,
        videos_generated = usage_tracking.videos_generated + 
            CASE WHEN NEW.video_path IS NOT NULL THEN 1 ELSE 0 END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to track tool usage
CREATE TRIGGER track_tool_usage
    AFTER INSERT ON tool_calls
    FOR EACH ROW
    EXECUTE FUNCTION increment_tool_call_counter();

-- Function to increment cache hit counter
CREATE OR REPLACE FUNCTION increment_cache_hit()
RETURNS TRIGGER AS $$
BEGIN
    -- Only increment if this was a cache hit
    IF NEW.was_cache_hit = TRUE AND NEW.cached_render_id IS NOT NULL THEN
        UPDATE cached_renders
        SET hit_count = hit_count + 1,
            last_accessed_at = NOW()
        WHERE id = NEW.cached_render_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to track cache hits
CREATE TRIGGER track_cache_hits
    AFTER INSERT ON tool_calls
    FOR EACH ROW
    EXECUTE FUNCTION increment_cache_hit();

COMMENT ON FUNCTION increment_cache_hit() IS 'Automatically increments hit_count and updates last_accessed_at when cached render is reused';

-- Function to reset monthly counters (run via cron job)
CREATE OR REPLACE FUNCTION reset_monthly_tool_calls()
RETURNS void AS $$
BEGIN
    UPDATE users SET tool_calls_this_month = 0;
    INSERT INTO usage_tracking (user_id, month, reset_at)
    SELECT id, DATE_TRUNC('month', NOW())::DATE, NOW()
    FROM users
    ON CONFLICT (user_id, month) DO UPDATE SET reset_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Sample subscription tiers (insert your actual limits)
COMMENT ON COLUMN users.subscription_tier IS 'Subscription tiers: free (100 calls/month), pro (1000 calls/month), enterprise (unlimited)';

-- ============================================================================
-- Cache Management Functions
-- ============================================================================

-- Function to get cache statistics
CREATE OR REPLACE FUNCTION get_cache_stats()
RETURNS TABLE(
    total_cached_renders BIGINT,
    total_cache_hits BIGINT,
    total_storage_bytes BIGINT,
    cache_hit_rate DECIMAL(5,2),
    unique_tools INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT cr.id)::BIGINT as total_cached_renders,
        COALESCE(SUM(cr.hit_count), 0)::BIGINT as total_cache_hits,
        COALESCE(SUM(cr.file_size_bytes), 0)::BIGINT as total_storage_bytes,
        CASE
            WHEN COUNT(tc.id) > 0 THEN
                (COUNT(CASE WHEN tc.was_cache_hit THEN 1 END)::DECIMAL / COUNT(tc.id)::DECIMAL * 100)
            ELSE 0
        END as cache_hit_rate,
        COUNT(DISTINCT cr.tool_name)::INTEGER as unique_tools
    FROM cached_renders cr
    LEFT JOIN tool_calls tc ON tc.cached_render_id = cr.id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_cache_stats() IS 'Returns overall cache performance statistics';

-- Function to find least used cached renders (for cleanup)
CREATE OR REPLACE FUNCTION find_stale_cached_renders(
    min_age_days INTEGER DEFAULT 90,
    max_hit_count INTEGER DEFAULT 5
)
RETURNS TABLE(
    id UUID,
    tool_name VARCHAR(100),
    hit_count INTEGER,
    age_days INTEGER,
    file_size_mb DECIMAL(10,2),
    s3_key VARCHAR(500)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cr.id,
        cr.tool_name,
        cr.hit_count,
        EXTRACT(DAY FROM NOW() - cr.first_generated_at)::INTEGER as age_days,
        (cr.file_size_bytes / 1024.0 / 1024.0)::DECIMAL(10,2) as file_size_mb,
        cr.s3_key
    FROM cached_renders cr
    WHERE cr.first_generated_at < NOW() - (min_age_days || ' days')::INTERVAL
      AND cr.hit_count <= max_hit_count
    ORDER BY cr.hit_count ASC, cr.last_accessed_at ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_stale_cached_renders(INTEGER, INTEGER) IS 'Find old cached renders with few hits (candidates for deletion to save storage)';

-- Function to get most popular cached renders
CREATE OR REPLACE FUNCTION get_top_cached_renders(limit_count INTEGER DEFAULT 10)
RETURNS TABLE(
    tool_name VARCHAR(100),
    input_params JSONB,
    hit_count INTEGER,
    renderer_version VARCHAR(20),
    file_size_mb DECIMAL(10,2),
    age_days INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cr.tool_name,
        cr.input_params,
        cr.hit_count,
        cr.renderer_version,
        (cr.file_size_bytes / 1024.0 / 1024.0)::DECIMAL(10,2) as file_size_mb,
        EXTRACT(DAY FROM NOW() - cr.first_generated_at)::INTEGER as age_days
    FROM cached_renders cr
    ORDER BY cr.hit_count DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_top_cached_renders(INTEGER) IS 'Returns the most frequently reused cached renders';

-- Example queries for analytics

-- Top users by tool calls this month
-- SELECT u.email, u.subscription_tier, ut.tool_calls_count
-- FROM users u
-- JOIN usage_tracking ut ON u.id = ut.user_id
-- WHERE ut.month = DATE_TRUNC('month', NOW())::DATE
-- ORDER BY ut.tool_calls_count DESC
-- LIMIT 10;

-- Most used tools
-- SELECT tool_name, COUNT(*) as call_count, AVG(execution_time_ms) as avg_time
-- FROM tool_calls
-- WHERE created_at > NOW() - INTERVAL '30 days'
-- GROUP BY tool_name
-- ORDER BY call_count DESC;

-- Storage usage by user
-- SELECT u.email, SUM(v.file_size_bytes) / 1024 / 1024 as storage_mb
-- FROM users u
-- JOIN videos v ON u.id = v.user_id
-- WHERE v.deleted_at IS NULL
-- GROUP BY u.email
-- ORDER BY storage_mb DESC;

-- Cache statistics
-- SELECT * FROM get_cache_stats();

-- Most popular cached renders
-- SELECT * FROM get_top_cached_renders(20);

-- Cache hit rate by tool
-- SELECT
--     tc.tool_name,
--     COUNT(*) as total_calls,
--     SUM(CASE WHEN tc.was_cache_hit THEN 1 ELSE 0 END) as cache_hits,
--     ROUND(AVG(CASE WHEN tc.was_cache_hit THEN 100 ELSE 0 END), 2) as hit_rate_pct
-- FROM tool_calls tc
-- WHERE tc.created_at > NOW() - INTERVAL '30 days'
-- GROUP BY tc.tool_name
-- ORDER BY cache_hits DESC;

-- Find stale cached renders for cleanup
-- SELECT * FROM find_stale_cached_renders(90, 3);

