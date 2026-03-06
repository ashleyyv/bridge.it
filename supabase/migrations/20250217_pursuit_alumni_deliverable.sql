-- Add alumni_deliverable for Fellow deliverable summary.
ALTER TABLE pursuit_internal_definitions ADD COLUMN IF NOT EXISTS alumni_deliverable text;
UPDATE pursuit_internal_definitions SET
  alumni_deliverable = COALESCE(alumni_deliverable, fellow_assignment_task, fellow_what);
