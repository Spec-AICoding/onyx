-- Add processed status column to file_record table.
-- Batch handoff files (iab/<cc_pair_id>/...) are currently deleted after
-- docprocessing completes; deletion doubles as the completion marker for
-- checkpoint resume. This column allows retaining the MinIO objects and
-- file_record rows while keeping the resume semantics intact: only rows
-- with processed = FALSE are treated as pending batches.
--
-- Usage:
--   psql -h <host> -U postgres -d <database> -f add_file_record_processed.sql

ALTER TABLE file_record
    ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index so "scan only unprocessed batches" stays a bounded index
-- range scan even as the table grows.
CREATE INDEX IF NOT EXISTS ix_file_record_pending
    ON file_record (file_id)
    WHERE processed = FALSE;
