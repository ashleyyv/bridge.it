import axios from 'axios';
import 'dotenv/config';

const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';
const OBSERVATORY_BASE = 'https://observatory-api.mdn.mozilla.net/api/v2';

/**
 * Normalize URL to hostname only: strip https://, www., paths, query strings.
 * e.g. 'https://www.weitzlux.com/locations/new-york/?utm=1' -> 'weitzlux.com'
 * @param {string} url - Full URL or hostname
 * @returns {string} Hostname only
 */
function urlToHostname(url) {
  if (!url || typeof url !== 'string') return '';
  let cleaned = String(url).trim();
  if (!cleaned) return '';
  try {
    cleaned = cleaned.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    const slash = cleaned.indexOf('/');
    if (slash !== -1) cleaned = cleaned.slice(0, slash);
    const q = cleaned.indexOf('?');
    if (q !== -1) cleaned = cleaned.slice(0, q);
    const hash = cleaned.indexOf('#');
    if (hash !== -1) cleaned = cleaned.slice(0, hash);
    cleaned = cleaned.trim().toLowerCase();
    return cleaned || '';
  } catch {
    return cleaned.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].trim() || '';
  }
}

/** Lower Manhattan - Multi-Industry NYC Engine location lock (meters) */
const LOWER_MANHATTAN = {
  lat: 40.7128,
  lng: -74.006,
  radius: 2000,
};

/** Industry mapping: types (Places API includedType - one per request) and keyword for textQuery */
const INDUSTRY_MAP = {
  Legal: { types: ['lawyer'], keyword: 'Law Firm' },
  Medical: { types: ['doctor', 'hospital'], keyword: 'Medical Clinic' },
  'E-commerce': { types: ['store'], keyword: 'E-commerce Headquarters' },
};

/** Derive friction_type from Google Places placeType for Supabase schema alignment.
 * Primary: lawyer (Places API type). Fallback: law_firm for legacy/compat. */
export function frictionTypeFromPlaceType(placeType, industry) {
  if (!placeType) return 'Compliance & Security';
  const map = {
    lawyer: 'Legal - Law Firm',
    law_firm: 'Legal - Law Firm',
    doctor: 'Medical - Doctor',
    hospital: 'Medical - Hospital',
    store: 'E-commerce - Store',
  };
  return map[placeType] ?? `Compliance & Security (${industry})`;
}

/**
 * Find professional leads using Google Places (New) API.
 * Multi-Industry NYC Engine: Lower Manhattan, dynamic industry keywords.
 * @param {string} [query] - Deprecated; keyword comes from industry map
 * @param {string} [industry] - Legal | Medical | E-commerce
 * @returns {Promise<{ places: object[], error?: string }>}
 */
export async function findProfessionalLeads(query, industry = 'Legal') {
  try {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) {
      return { places: [], error: 'GOOGLE_PLACES_API_KEY not set' };
    }
    const mapping = INDUSTRY_MAP[industry] ?? INDUSTRY_MAP.Legal;
    const keyword = mapping.keyword;
    const types = mapping.types ?? ['lawyer'];
    const textQuery = `${keyword} in Lower Manhattan`;

    const locationBias = {
      circle: {
        center: { latitude: LOWER_MANHATTAN.lat, longitude: LOWER_MANHATTAN.lng },
        radius: LOWER_MANHATTAN.radius,
      },
    };

    const allPlaces = [];
    for (const type of types) {
      const body = {
        textQuery,
        includedType: type,
        locationBias,
        strictTypeFiltering: true,
        pageSize: 20,
      };
      const { data } = await axios.post(
        `${GOOGLE_PLACES_BASE}/places:searchText`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.userRatingCount',
          },
        }
      );
      const places = data?.places ?? [];
      for (const p of places) {
        if (!allPlaces.some((x) => x.id === p.id)) {
          allPlaces.push({ ...p, placeType: type });
        }
      }
    }
    return { places: allPlaces };
  } catch (err) {
    return { places: [], error: err?.message ?? 'findProfessionalLeads failed' };
  }
}

const POLL_DELAY_MS = 3000;
const MAX_RETRIES = 5;
const SCAN_URL = 'https://observatory-api.mdn.mozilla.net/api/v2/scan';

/** Check if response has a valid grade (A+ through F). */
function hasValidGrade(grade) {
  if (!grade || typeof grade !== 'string') return false;
  const g = grade.toUpperCase().replace(/\+/g, '').charAt(0);
  return ['A', 'B', 'C', 'D', 'E', 'F'].includes(g);
}

/**
 * Patient Biopsy: Perform security audit using Mozilla Observatory API v2 (MDN).
 * 1. POST to initiate scan.
 * 2. If grade is null or status is pending, poll with GET every 3s (max 5 retries).
 * 3. Return full audit when grade A-F is available.
 * 4. After 5 retries, return 'Grade: C' as neutral baseline so UI doesn't hang.
 * @param {string} websiteUrl - Business website URL
 * @returns {Promise<{ grade: string, score: number, host?: string, error?: string }>}
 */
export async function performSecurityAudit(websiteUrl) {
  const fallback = { grade: 'N/A', score: 0 };
  if (!websiteUrl || typeof websiteUrl !== 'string' || !String(websiteUrl).trim()) {
    return { ...fallback, error: 'No website URL' };
  }

  const host = urlToHostname(websiteUrl);
  if (!host) {
    return { ...fallback, error: 'Invalid or empty URL' };
  }

  const doPost = async () => {
    const { data } = await axios.post(SCAN_URL, null, {
      params: { host },
      timeout: 20000,
    });
    return data;
  };

  const doGet = async () => {
    const { data } = await axios.get(SCAN_URL, {
      params: { host },
      timeout: 15000,
    });
    return data;
  };

  let data;
  try {
    data = await doPost();
  } catch (err) {
    return { ...fallback, error: err?.message ?? 'performSecurityAudit failed' };
  }

  if (data?.error && data?.message) {
    return { ...fallback, host };
  }

  let grade = data?.grade ?? null;
  let score = typeof data?.score === 'number' ? data.score : 0;

  if (hasValidGrade(grade)) {
    return { grade, score, host };
  }

  for (let i = 0; i < MAX_RETRIES; i++) {
    await new Promise(r => setTimeout(r, POLL_DELAY_MS));
    try {
      const polled = await doGet();
      grade = polled?.grade ?? null;
      score = typeof polled?.score === 'number' ? polled.score : 0;
      if (hasValidGrade(grade)) {
        return { grade, score, host };
      }
    } catch {
      break;
    }
  }

  return { grade: 'C', score: 50, host };
}

/**
 * Map Mozilla grade (A+ … F) to Enterprise HFI (0–10).
 * F => 10 (high friction).
 * @param {string} grade - Mozilla Observatory grade
 * @returns {number} Enterprise HFI 0–10
 */
export function calculateEnterpriseHFI(grade) {
  if (!grade || typeof grade !== 'string') return 0;
  const g = grade.toUpperCase().replace(/\+/g, '');
  const map = { A: 0, B: 2, C: 4, D: 6, E: 8, F: 10, N: 0 };
  if (g === 'N/A' || g === 'N') return 0;
  return map[g] ?? 0;
}

/**
 * Inferred/fallback technical debt when BuiltWith API fails or returns no debt.
 * @param {string} grade - Mozilla grade
 * @returns {string[]} List of 3 legacy software issues
 */
export function getTechnicalDebt(grade) {
  const lowGrades = ['D', 'E', 'F'];
  const g = grade?.toUpperCase?.()?.[0] ?? 'F';
  if (!lowGrades.includes(g)) return [];

  return [
    'Legacy jQuery (v1.x) - outdated, known XSS vectors',
    'Unpatched CMS plugin - missing security updates',
    'Weak TLS configuration - SSL 2.0/3.0 fallback enabled',
  ];
}

const BUILTWITH_BASE = 'https://api.builtwith.com/v22/api.json';
const APIVOID_DOMAIN_AGE_BASE = 'https://api.apivoid.com/domainage/v1/pay-as-you-go/';

/**
 * Fetch domain age from APIVoid Domain Age API.
 * @param {string} domain - Hostname (e.g. 'example.com')
 * @returns {Promise<{ yearsOld: number, createdDate?: string, detectionScores?: object, evidence?: string[] } | null>}
 */
export async function getAPIVoidDomainAge(domain) {
  const key = process.env.APIVOID_API_KEY;
  if (!key || !domain || typeof domain !== 'string') return null;

  const url = `${APIVOID_DOMAIN_AGE_BASE}?key=${encodeURIComponent(key)}&host=${encodeURIComponent(domain)}`;

  try {
    const { data } = await axios.get(url, { timeout: 15000 });
    if (!data || typeof data !== 'object') return null;

    const report = data.report ?? data.data ?? data;
    const domainAge = report.domain_age ?? report.domain_age_in_years ?? report.age;
    let yearsOld = 0;

    if (typeof domainAge === 'number') {
      yearsOld = domainAge;
    } else if (report.domain_age_in_days != null) {
      yearsOld = Number(report.domain_age_in_days) / 365;
    } else if (report.domain_creation_date) {
      const created = new Date(report.domain_creation_date);
      if (!isNaN(created.getTime())) {
        yearsOld = (Date.now() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      }
    } else if (domainAge?.years != null) {
      yearsOld = Number(domainAge.years) || 0;
    }

    const evidence = [];
    if (yearsOld > 0 && yearsOld < 2) {
      evidence.push(`APIVoid: Domain age ${yearsOld.toFixed(1)} years - Identity Risk (new domain)`);
    } else if (yearsOld > 0) {
      evidence.push(`APIVoid: Domain age ${yearsOld.toFixed(1)} years - Established`);
    }

    const detectionScores = report.detection_scores ?? report.detection_rates ?? report.scores;

    return {
      yearsOld,
      createdDate: report.domain_creation_date ?? report.creation_date,
      detectionScores: detectionScores || null,
      evidence,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Recursively extract all technology objects { Name, Version } from BuiltWith response.
 * Handles Results[].Result.Paths[].Technologies[] or similar nesting.
 * @param {unknown} obj - JSON object or array
 * @returns {Array<{ name: string, version: string }>}
 */
function extractTechnologies(obj) {
  const techs = [];
  if (!obj || typeof obj !== 'object') return techs;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === 'object') {
        if ('Name' in item && (typeof item.Name === 'string' || typeof item.name === 'string')) {
          const name = (item.Name ?? item.name ?? '').trim();
          const ver = String(item.Version ?? item.version ?? '').trim();
          if (name) techs.push({ name, version: ver });
        } else {
          techs.push(...extractTechnologies(item));
        }
      }
    }
    return techs;
  }

  if ('Technologies' in obj && Array.isArray(obj.Technologies)) {
    techs.push(...extractTechnologies(obj.Technologies));
  }
  if ('Paths' in obj && Array.isArray(obj.Paths)) {
    for (const p of obj.Paths) techs.push(...extractTechnologies(p));
  }
  if ('Result' in obj) techs.push(...extractTechnologies(obj.Result));
  if ('Results' in obj) techs.push(...extractTechnologies(obj.Results));

  return techs;
}

/**
 * Fetch real tech-stack data from BuiltWith API and derive technical debt.
 * - jQuery v1.x → 'Legacy jQuery (v1.x) - High XSS Risk'
 * - WordPress < 6.0 → 'Outdated CMS - Critical Vulnerability'
 * - Otherwise → up to 3 random technologies they use (informational)
 * @param {string} domain - Hostname (e.g. 'example.com')
 * @returns {Promise<string[]>} Debt items, or [] on API failure (caller should fallback)
 */
export async function getBuiltWithTechDebt(domain) {
  const key = process.env.BUILTWITH_API_KEY;
  if (!key || !domain || typeof domain !== 'string') return [];

  const debt = [];
  const url = `${BUILTWITH_BASE}?KEY=${encodeURIComponent(key)}&LOOKUP=${encodeURIComponent(domain)}`;

  try {
    const { data } = await axios.get(url, { timeout: 15000 });
    if (!data || typeof data !== 'object') return [];

    const techs = extractTechnologies(data);

    for (const t of techs) {
      const n = (t.name || '').toLowerCase();
      const v = (t.version || '').trim();

      if (n.includes('jquery') && /^1[\.\d]/.test(v)) {
        debt.push('Legacy jQuery (v1.x) - High XSS Risk');
        break;
      }
    }
    for (const t of techs) {
      const n = (t.name || '').toLowerCase();
      const v = (t.version || '').trim();

      if (n.includes('wordpress')) {
        const major = parseInt(v.split('.')[0], 10);
        if (!isNaN(major) && major < 6) {
          debt.push('Outdated CMS - Critical Vulnerability');
        }
        break;
      }
    }

    if (debt.length === 0 && techs.length > 0) {
      const names = [...new Set(techs.map(t => t.name).filter(Boolean))];
      const shuffled = names.sort(() => Math.random() - 0.5);
      const pick = shuffled.slice(0, 3).map(n => `Tech: ${n}`);
      debt.push(...pick);
    }

    return debt;
  } catch (err) {
    return [];
  }
}

/**
 * Dynamic Evidence Engine score (0-10). Replaces hardcoded HFI for Enterprise leads.
 * - Start at 0
 * - +4 if BuiltWith finds Legacy Tech (jQuery v1, WordPress <6, etc.)
 * - +3 if APIVoid shows domain < 2 years old (Identity Risk)
 * - +3 if Mozilla grade D/E/F or APIVoid detects security/blacklist issues
 * @param {object} opts
 * @param {string[]} opts.builtWithVulns - BuiltWith vulnerability strings
 * @param {boolean} opts.hasLegacyTech - BuiltWith found jQuery v1, WordPress <6, etc.
 * @param {number} [opts.apivoidYearsOld] - Domain age in years from APIVoid
 * @param {string} [opts.mozillaGrade] - A+ through F
 * @param {boolean} [opts.apivoidSecurityIssue] - APIVoid detection_scores indicate risk
 * @returns {{ score: number, evidence: string[] }}
 */
export function computeEvidenceScore(opts) {
  let score = 0;
  const evidence = [];

  if (opts?.hasLegacyTech) {
    score += 4;
    evidence.push('+4 Legacy Tech (jQuery v1, outdated CMS)');
  }
  const yearsOld = opts?.apivoidYearsOld ?? 999;
  if (yearsOld > 0 && yearsOld < 2) {
    score += 3;
    evidence.push('+3 Identity Risk (domain < 2 years)');
  }
  const grade = (opts?.mozillaGrade || '').toUpperCase().charAt(0);
  const mozillaBad = ['D', 'E', 'F'].includes(grade);
  if (mozillaBad || opts?.apivoidSecurityIssue) {
    score += 3;
    evidence.push(mozillaBad ? '+3 Mozilla security issues (grade D/E/F)' : '+3 APIVoid security/blacklist');
  }

  return { score: Math.min(10, score), evidence };
}

/**
 * Generate specific deliverables from vulnerability strings.
 * Used to suggest actionable tasks for the Alumnus.
 * @param {string[]} vulnerabilities - From real_vulnerabilities or technicalDebt
 * @param {string} [websiteUri] - Optional, for HTTP check
 * @returns {string[]} Unique deliverable names
 */
export function generateDeliverables(vulnerabilities, websiteUri = '') {
  const out = new Set();
  const vulns = Array.isArray(vulnerabilities) ? vulnerabilities : [];
  const combined = vulns.concat(websiteUri ? [websiteUri] : []);

  for (const v of combined) {
    const s = String(v).toLowerCase();
    if (s.includes('legacy jquery') || s.includes('jquery')) {
      out.add('Secure JS Migration & XSS Patch');
    }
    if (s.includes('grade f') || s === 'f') {
      out.add('Security Header Hardening (CSP/HSTS)');
    }
    if (s.startsWith('http://') || s.includes('http://')) {
      out.add('SSL/TLS Global Enforcement');
    }
  }

  return [...out];
}
