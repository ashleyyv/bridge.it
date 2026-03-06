-- Add internal_title, technical_why, fellow_what for Pursuit Technical Briefing.
-- Run in Supabase SQL Editor after 20250217_pursuit_internal_definitions.sql.

ALTER TABLE pursuit_internal_definitions ADD COLUMN IF NOT EXISTS internal_title text;
ALTER TABLE pursuit_internal_definitions ADD COLUMN IF NOT EXISTS technical_why text;
ALTER TABLE pursuit_internal_definitions ADD COLUMN IF NOT EXISTS fellow_what text;

-- Backfill from existing columns (display_title, admin_triage_note, fellow_assignment_task)
UPDATE pursuit_internal_definitions SET
  internal_title = COALESCE(internal_title, display_title),
  technical_why  = COALESCE(technical_why, admin_triage_note),
  fellow_what    = COALESCE(fellow_what, fellow_assignment_task);
