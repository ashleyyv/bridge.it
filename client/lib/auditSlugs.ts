/**
 * Map vulnerability strings from audit to knowledge_base slugs.
 */
export function vulnerabilityToSlug(v: string, websiteUri?: string): string | null {
  const s = String(v).toLowerCase();
  if (s.includes("legacy debt") || (s.includes("legacy") && s.includes("infrastructure"))) return "legacy_debt";
  if (s.includes("core web vital") || s.includes("lcp") || s.includes("cls") || s.includes("fcp") || s.includes("ttfb") || s.includes("latency") || s.includes("unoptimized") || s.includes("performance")) return "performance_speed";
  if (s.includes("accessibility") || s.includes("wcag") || s.includes("aria") || s.includes("screen-reader") || s.includes("screen reader") || s.includes("keyboard navigation")) return "accessibility_a11y";
  if (s.includes("dmarc") || s.includes("spf") || s.includes("dkim") || s.includes("brand impersonation")) return "identity_trust";
  if (s.includes("legacy jquery") || (s.includes("jquery") && (s.includes("xss") || s.includes("1.x") || s.includes("v1")))) return "legacy_jquery";
  if (s.includes("grade f") || s.includes("gradef") || (s.includes("mozilla") && (s.includes("security") || s.includes("0/100") || s.includes("observatory")))) return "grade_f";
  if (s.includes("outdated cms") || (s.includes("critical") && s.includes("cms")) || (s.includes("wordpress") && s.includes("cve"))) return "outdated_cms";
  if (s.includes("apivoid") && (s.includes("identity") || s.includes("domain"))) return "domain_age_risk";
  if (s.includes("http://") || s.includes("critical ssl debt") || s.includes("insecure transport") || (websiteUri && String(websiteUri).toLowerCase().startsWith("http://"))) return "http_insecure";
  return null;
}

/** Add http_insecure slug if websiteUri is http. Call once per lead. */
export function getHttpSlugIfInsecure(websiteUri?: string): string | null {
  if (websiteUri && String(websiteUri).toLowerCase().startsWith("http://")) return "http_insecure";
  return null;
}

/** Human-readable display title for slugs (fallback when display_title not in DB). */
export const SLUG_DISPLAY_TITLES: Record<string, string> = {
  identity_trust: "Identity: Trust Hardening",
  performance_speed: "Performance: Speed Optimization",
  accessibility_a11y: "Accessibility: UX Compliance",
  legacy_debt: "Infrastructure: Legacy Debt",
  legacy_jquery: "Library: Legacy Dependency Debt",
  grade_f: "Infrastructure: Security Header Deficit",
  http_insecure: "Infrastructure: Insecure Transport",
  outdated_cms: "Application: Outdated CMS",
  domain_age_risk: "Identity: Domain Age Risk",
};

/** Map slug to vertical_name for 5-Vertical Research (Matrix UI). */
export const SLUG_TO_VERTICAL: Record<string, string> = {
  identity_trust: 'IDENTITY & TRUST',
  performance_speed: 'PERFORMANCE & SPEED',
  accessibility_a11y: 'ACCESSIBILITY (A11Y)',
  legacy_debt: 'INFRASTRUCTURE & DEBT',
  legacy_jquery: 'SECURITY & COMPLIANCE',
  grade_f: 'SECURITY & COMPLIANCE',
  http_insecure: 'INFRASTRUCTURE & DEBT',
  outdated_cms: 'SECURITY & COMPLIANCE',
  domain_age_risk: 'IDENTITY & TRUST',
};

/** Get vertical_name for a slug; fallback to TECHNICAL MISSION. */
export function getVerticalStyle(slug: string): string {
  return SLUG_TO_VERTICAL[slug] ?? 'TECHNICAL MISSION';
}

/** Inline fallbacks when pursuit_internal_definitions is empty or missing slug. */
export const SLUG_FALLBACKS: Record<string, { technical_proof?: string; technical_why: string; alumni_deliverable: string }> = {
  identity_trust: {
    technical_why: "Domain identity gaps and weak sender protections increase impersonation and trust risk.",
    alumni_deliverable: "Implement DMARC/SPF alignment, domain trust stabilization, and verified branding controls.",
  },
  performance_speed: {
    technical_why: "High bounce rates and slow response times reduce lead conversion and operational efficiency.",
    alumni_deliverable: "Execute performance sprint: CDN + caching, asset optimization, and Core Web Vitals remediation.",
  },
  accessibility_a11y: {
    technical_why: "Accessibility gaps create legal and UX exposure for customer-facing platforms.",
    alumni_deliverable: "Deliver WCAG-focused accessibility sprint: ARIA fixes, keyboard navigation, and screen-reader parity.",
  },
  legacy_debt: {
    technical_why: "Aging platform dependencies and infra debt slow delivery and raise operational risk.",
    alumni_deliverable: "Reduce infrastructure debt: modernize runtime/dependencies and remove deprecated platform components.",
  },
  legacy_jquery: {
    technical_why: "Legacy JS creates liability for client data exposure. Law firms handling sensitive matters cannot afford XSS on intake forms or case portals.",
    alumni_deliverable: "Achieve XSS-free status: Migrate from jQuery 1.x to modern vanilla JS or React. Remove XSS-vulnerable patterns. Add Content-Security-Policy header to restrict inline scripts.",
  },
  grade_f: {
    technical_proof: "Mozilla Observatory: Verified lack of HSTS, CSP, and X-Frame-Options — Grade F",
    technical_why: "Mozilla F grade signals systemic header gaps. Clickjacking and injection risks undermine client trust and bar association expectations.",
    alumni_deliverable: "Achieve Grade B+ minimum: Implement Strict-Transport-Security (HSTS), Content-Security-Policy (CSP), X-Frame-Options: DENY. Re-scan with Mozilla Observatory.",
  },
  http_insecure: {
    technical_proof: "Site served over HTTP — no TLS. All traffic is plaintext and interceptable.",
    technical_why: "Unencrypted traffic exposes client communications. Ethical rules and bar expectations require HTTPS for attorney-client communications.",
    alumni_deliverable: "Achieve full HTTPS: Enable valid certificate, 301 redirects HTTP→HTTPS, HSTS header. Remove mixed-content resources.",
  },
  outdated_cms: {
    technical_why: "Outdated CMS = breach risk. Legal practices are high-value targets for ransomware and data exfiltration.",
    alumni_deliverable: "Achieve patched CMS: Update WordPress to 6.x LTS, update plugins, enable auto-updates. Add CSP to limit plugin damage radius.",
  },
  domain_age_risk: {
    technical_proof: "APIVoid: Domain age < 2 years — Identity Risk flag",
    technical_why: "New domains raise legitimacy questions. Partners and clients may hesitate before sharing sensitive data.",
    alumni_deliverable: "Achieve trust signals: Document domain ownership and SSL. Add org info and contact. Consider domain consolidation if multiple brands.",
  },
};
