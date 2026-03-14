-- Add vertical_name for 5-Vertical Research (SECURITY & COMPLIANCE, IDENTITY & TRUST, etc.)
ALTER TABLE pursuit_internal_definitions ADD COLUMN IF NOT EXISTS vertical_name text;

UPDATE pursuit_internal_definitions SET vertical_name = COALESCE(vertical_name,
  CASE vulnerability_slug
    WHEN 'legacy_jquery' THEN 'SECURITY & COMPLIANCE'
    WHEN 'grade_f' THEN 'SECURITY & COMPLIANCE'
    WHEN 'http_insecure' THEN 'INFRASTRUCTURE & DEBT'
    WHEN 'outdated_cms' THEN 'SECURITY & COMPLIANCE'
    WHEN 'domain_age_risk' THEN 'IDENTITY & TRUST'
    ELSE 'SECURITY & COMPLIANCE'
  END
);
