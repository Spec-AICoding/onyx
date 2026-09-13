-- Add graph_acl_push_state table: per-source incremental watermark for
-- pushing document-table ACLs to the external graph service
-- (magicbox-backend POST /acl/sync).
--
-- Usage:
--   psql -h <host> -U postgres -d <database> -f add_graph_acl_push_state.sql

CREATE TABLE IF NOT EXISTS graph_acl_push_state (
    id SERIAL PRIMARY KEY,
    source VARCHAR(64) NOT NULL UNIQUE,
    watermark TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
    last_pushed_at TIMESTAMPTZ,
    last_error TEXT
);
