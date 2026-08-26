-- Add kg_stage and kg_processing_time columns to file_record table.
-- This enables knowledge graph processing support for connector-synced
-- files (FILE_CONNECTOR__ documents), analogous to the existing graph
-- processing pipeline for user-uploaded files (user_file table).
--
-- Usage:
--   psql -h <host> -U postgres -d <database> -f add_file_record_kg_stage.sql

ALTER TABLE file_record
    ADD COLUMN IF NOT EXISTS kg_stage VARCHAR(32) DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS kg_processing_time TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_file_record_kg_stage
    ON file_record (kg_stage);
