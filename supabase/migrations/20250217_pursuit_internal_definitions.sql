-- Pursuit Technical Briefing: internal definitions for Admin Triage and Fellow Assignment
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS pursuit_internal_definitions (
  id serial PRIMARY KEY,
  vulnerability_slug text NOT NULL UNIQUE,
  display_title text NOT NULL,
  technical_proof text NOT NULL,
  admin_triage_note text NOT NULL,
  fellow_assignment_task text NOT NULL
);

-- For existing tables: add display_title
ALTER TABLE pursuit_internal_definitions ADD COLUMN IF NOT EXISTS display_title text;

INSERT INTO pursuit_internal_definitions (vulnerability_slug, display_title, technical_proof, admin_triage_note, fellow_assignment_task) VALUES
  ('legacy_jquery', 'Application: Legacy JS / XSS Risk', 'BuiltWith: jQuery v1.x detected — known XSS vectors (CVE-2015-9251, CVE-2019-11358)', 'Legacy JS creates liability for client data exposure. Law firms handling sensitive matters cannot afford XSS on intake forms or case portals.', 'Achieve XSS-free status: Migrate from jQuery 1.x to modern vanilla JS or React. Remove XSS-vulnerable patterns. Add Content-Security-Policy header to restrict inline scripts.'),
  ('grade_f', 'Infrastructure: Security Header Deficit', 'Mozilla Observatory: Verified lack of HSTS, CSP, and X-Frame-Options — Grade F', 'Mozilla F grade signals systemic header gaps. Clickjacking and injection risks undermine client trust and bar association expectations.', 'Achieve Grade B+ minimum: Implement Strict-Transport-Security (HSTS), Content-Security-Policy (CSP), X-Frame-Options: DENY. Re-scan with Mozilla Observatory.'),
  ('http_insecure', 'Infrastructure: Insecure Transport', 'Site served over HTTP — no TLS. All traffic is plaintext and interceptable.', 'Unencrypted traffic exposes client communications. Ethical rules and bar expectations require HTTPS for attorney-client communications.', 'Achieve full HTTPS: Enable valid certificate, 301 redirects HTTP→HTTPS, HSTS header. Remove mixed-content resources.'),
  ('outdated_cms', 'Application: Outdated CMS', 'BuiltWith: WordPress < 6.0 — critical unpatched CVEs', 'Outdated CMS = breach risk. Legal practices are high-value targets for ransomware and data exfiltration.', 'Achieve patched CMS: Update WordPress to 6.x LTS, update plugins, enable auto-updates. Add CSP to limit plugin damage radius.'),
  ('domain_age_risk', 'Identity: Domain Age Risk', 'APIVoid: Domain age < 2 years — Identity Risk flag', 'New domains raise legitimacy questions. Partners and clients may hesitate before sharing sensitive data.', 'Achieve trust signals: Document domain ownership and SSL. Add org info and contact. Consider domain consolidation if multiple brands.')
ON CONFLICT (vulnerability_slug) DO UPDATE SET
  display_title = COALESCE(EXCLUDED.display_title, pursuit_internal_definitions.display_title),
  technical_proof = EXCLUDED.technical_proof,
  admin_triage_note = EXCLUDED.admin_triage_note,
  fellow_assignment_task = EXCLUDED.fellow_assignment_task;
