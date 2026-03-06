/**
 * Generate proposed deliverables from vulnerability strings.
 * Matches LeadAuditor.generateDeliverables logic for UI display.
 */
export function generateDeliverables(
  vulnerabilities: string[],
  websiteUri?: string
): string[] {
  const out = new Set<string>();
  const vulns = Array.isArray(vulnerabilities) ? vulnerabilities : [];
  const combined = [...vulns];
  if (websiteUri) combined.push(websiteUri);

  for (const v of combined) {
    const s = String(v).toLowerCase();
    if (s.includes("legacy jquery") || s.includes("jquery")) {
      out.add("Secure JS Migration & XSS Patch");
    }
    if (s.includes("grade f") || s === "f") {
      out.add("Security Header Hardening (CSP/HSTS)");
    }
    if (s.startsWith("http://") || s.includes("http://")) {
      out.add("SSL/TLS Global Enforcement");
    }
  }

  return [...out];
}
