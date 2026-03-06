-- Audit Knowledge Base: vulnerability slugs + plain English proof + deliverable + business impact
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS audit_knowledge_base (
  id serial PRIMARY KEY,
  vulnerability_slug text NOT NULL UNIQUE,
  plain_english_proof text NOT NULL,
  deliverable_name text NOT NULL,
  business_impact text NOT NULL
);

INSERT INTO audit_knowledge_base (vulnerability_slug, plain_english_proof, deliverable_name, business_impact) VALUES
  ('legacy_jquery', 'The site uses jQuery v1.x, which has known XSS vulnerabilities and is no longer maintained. This poses a direct risk to client data and session security.', 'Secure JS Migration & XSS Patch', 'Eliminates cross-site scripting risk, protects client confidentiality, and meets modern security standards.'),
  ('grade_f', 'Mozilla Observatory graded this site an F due to missing security headers (CSP, HSTS, X-Frame-Options). Attackers can exploit these gaps for clickjacking and injection attacks.', 'Security Header Hardening (CSP/HSTS)', 'Prevents clickjacking, reduces injection risk, and demonstrates due diligence for compliance reviews.'),
  ('http_insecure', 'The site serves content over HTTP instead of HTTPS. Traffic is unencrypted and can be intercepted, exposing client communications and login credentials.', 'SSL/TLS Global Enforcement', 'Encrypts all traffic, protects client data in transit, and satisfies bar association security expectations.'),
  ('outdated_cms', 'The CMS (e.g. WordPress < 6.0) has critical unpatched vulnerabilities. Known exploits can lead to data breach and malware injection.', 'Security Header Hardening (CSP/HSTS)', 'Reduces attack surface and aligns with legal industry security best practices.'),
  ('domain_age_risk', 'The domain was registered less than 2 years ago. New domains carry higher identity and phishing risk in professional services.', 'Security Header Hardening (CSP/HSTS)', 'Strengthens trust signals and reduces perceived risk for clients and partners.')
ON CONFLICT (vulnerability_slug) DO UPDATE SET
  plain_english_proof = EXCLUDED.plain_english_proof,
  deliverable_name = EXCLUDED.deliverable_name,
  business_impact = EXCLUDED.business_impact;
