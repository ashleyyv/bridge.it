-- Enterprise On-Demand Audit: leads columns + audit cache
-- Run in Supabase SQL Editor or via migration CLI.

-- 1. Add columns to leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tech_audit_status text,
  ADD COLUMN IF NOT EXISTS real_vulnerabilities jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS security_debt_score integer;

-- 2. Create enterprise_audit_cache for domain-based lookup (saves BuiltWith credits)
CREATE TABLE IF NOT EXISTS enterprise_audit_cache (
  domain text PRIMARY KEY,
  tech_audit_status text NOT NULL DEFAULT 'pending',
  real_vulnerabilities jsonb DEFAULT '[]'::jsonb,
  security_debt_score integer,
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE enterprise_audit_cache IS 'Caches BuiltWith audit results by domain to avoid re-scanning.';
COMMENT ON COLUMN enterprise_audit_cache.tech_audit_status IS 'completed | no_debt_found | failed';
COMMENT ON COLUMN enterprise_audit_cache.real_vulnerabilities IS 'Array of vulnerability strings from BuiltWith.';
