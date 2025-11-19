-- PostgreSQL schema for Discord event logging
-- Run with: psql "$POSTGRES_URL" -f sql/schema.sql

CREATE TYPE IF NOT EXISTS voice_channel_event_type AS ENUM ('join', 'leave', 'move');

CREATE TABLE IF NOT EXISTS heartbeat_logs (
    id BIGSERIAL PRIMARY KEY,
    mongo_document_id TEXT UNIQUE,
    alive_at TIMESTAMPTZ NOT NULL,
    original_alive_at_text TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ready_events (
    id BIGSERIAL PRIMARY KEY,
    mongo_document_id TEXT UNIQUE,
    ready_at TIMESTAMPTZ NOT NULL,
    original_ready_at_text TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_channel_events (
    id BIGSERIAL PRIMARY KEY,
    mongo_document_id TEXT UNIQUE,
    event_type voice_channel_event_type NOT NULL,
    server_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    from_channel_id TEXT,
    to_channel_id TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    original_event_time_text TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_events_type ON voice_channel_events (event_type);
CREATE INDEX IF NOT EXISTS idx_voice_events_server ON voice_channel_events (server_id);
CREATE INDEX IF NOT EXISTS idx_voice_events_user ON voice_channel_events (user_id);
CREATE INDEX IF NOT EXISTS idx_voice_events_occurred_at ON voice_channel_events (occurred_at);
