-- Add is_priority flag for "Promote to Main" (run in Supabase SQL Editor)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT false;
