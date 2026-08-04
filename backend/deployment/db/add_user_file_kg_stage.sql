-- Add kg_stage and kg_processing_time columns to user_file table.
-- This enables graph processing support for user-uploaded files
-- (project file uploads), analogous to the existing graph processing
-- pipeline for connector-synced files (FILE_CONNECTOR__ documents).
--
-- Usage:
--   psql -h <host> -U postgres -d <database> -f add_user_file_kg_stage.sql

ALTER TABLE user_file
    ADD COLUMN IF NOT EXISTS kg_stage VARCHAR(32) DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS kg_processing_time TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_user_file_kg_stage
    ON user_file (kg_stage);
