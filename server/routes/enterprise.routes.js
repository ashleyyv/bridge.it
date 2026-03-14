import express from 'express';
import { createClient } from '@supabase/supabase-js';
import * as LeadAuditor from '../services/LeadAuditor.service.js';

const router = express.Router();
const supabase = (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY))
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  : null;

/**
 * GET /api/enterprise/audit-knowledge-base
 * @deprecated Use pursuit-internal-definitions for Pursuit Technical Briefing.
 */
router.get('/audit-knowledge-base', async (req, res) => {
  try {
    if (!supabase) return res.json({ entries: [] });
    const { data, error } = await supabase.from('audit_knowledge_base').select('*');
    if (error) return res.json({ entries: [] });
    return res.json({ entries: data ?? [] });
  } catch (err) {
    return res.json({ entries: [] });
  }
});

/**
 * GET /api/enterprise/pursuit-internal-definitions
 * Query params: industry (default: Legal)
 * Returns vulnerability slug -> technical_proof, admin_triage_note, fellow_assignment_task, vertical_name.
 */
router.get('/pursuit-internal-definitions', async (req, res) => {
  try {
    const industry = String(req.query?.industry ?? 'Legal').trim() || 'Legal';
    if (!supabase) return res.json({ entries: [] });
    const { data, error } = await supabase
      .from('pursuit_internal_definitions')
      .select('vulnerability_slug, vertical_name, technical_why, alumni_deliverable');
    if (error) {
      console.error('pursuit-internal-definitions fetch error:', error);
      return res.json({ entries: [] });
    }
    return res.json({ entries: data ?? [] });
  } catch (err) {
    console.error('pursuit-internal-definitions error:', err);
    return res.json({ entries: [] });
  }
});

/**
 * GET /api/enterprise/leads
 * Fetch enterprise leads from Supabase leads table (Lead Library).
 * Query params: industry_type (optional) - filter by Legal | Medical | E-commerce
 * Returns leads in EnterpriseScout-compatible shape.
 */
router.get('/leads', async (req, res) => {
  try {
    if (!supabase) return res.json({ leads: [] });
    const query = supabase
      .from('leads')
      .select('*')
      .or('industry_type.eq.Legal,industry_type.eq.Medical,industry_type.eq.E-commerce')
      .eq('location->>borough', 'Manhattan')
      .order('id', { ascending: false });
    const { data: rows, error } = await query;
    if (error) {
      console.error('Enterprise leads fetch error:', error);
      return res.json({ leads: [] });
    }
    const leads = (rows ?? []).map((row) => {
      const loc = row.location && typeof row.location === 'object' ? row.location : {};
      const addr = [loc.neighborhood, loc.borough, loc.zip].filter(Boolean).join(', ');
      return {
        id: row.id,
        name: row.business_name ?? row.name ?? 'Enterprise Lead',
        formattedAddress: addr || null,
        websiteUri: row.website_url ?? null,
        reviewCount: row.review_count ?? 0,
        securityGrade: null,
        securityScore: 0,
        enterpriseHFI: row.hfi_score ?? 0,
        technicalDebt: row.real_vulnerabilities ?? [],
        tech_audit_status: row.tech_audit_status ?? null,
        real_vulnerabilities: row.real_vulnerabilities ?? [],
        security_debt_score: row.security_debt_score ?? null,
        industry_type: row.industry_type ?? null,
      };
    });
    return res.json({ leads });
  } catch (err) {
    console.error('Enterprise leads route error:', err);
    return res.status(500).json({ error: err?.message ?? 'Failed to load leads', leads: [] });
  }
});

const ALLOWED_INDUSTRIES = ['Legal', 'Medical', 'E-commerce'];
const ALLOWED_PLACE_TYPES = ['lawyer', 'law_firm', 'doctor', 'hospital', 'store'];

/**
 * POST /api/enterprise/scout
 * Scout new leads via Google Places, SAVE to Supabase, return saved leads.
 * Body: { industry: 'Legal' | 'Medical' | 'E-commerce' }
 */
router.post('/scout', async (req, res) => {
  try {
    let industry = String(req.body?.industry ?? 'Legal').trim() || 'Legal';
    if (industry === 'lawyer' || industry === 'law_firm') industry = 'Legal';
    if (!ALLOWED_INDUSTRIES.includes(industry)) {
      return res.status(400).json({ error: `Invalid industry. Allowed: ${ALLOWED_INDUSTRIES.join(', ')}`, leads: [] });
    }
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured', leads: [] });
    }
    const { places, error: leadsError } = await LeadAuditor.findProfessionalLeads(null, industry);
    if (leadsError) {
      return res.status(500).json({ error: leadsError, leads: [] });
    }
    const rawCount = places?.length ?? 0;
    const deduplicatedCount = new Set(places?.map((p) => p.id) ?? []).size;
    console.log(`[Scout] industry=${industry} rawPlaces=${rawCount} mergedAndDeduplicated=${deduplicatedCount}`);

    const saved = [];
    for (const place of places ?? []) {
      const name = place.displayName?.text ?? place.displayName ?? place.id ?? 'Unknown';
      const websiteUri = place.websiteUri ?? null;
      const frictionType = LeadAuditor.frictionTypeFromPlaceType?.(place.placeType, industry) ?? 'Compliance & Security';
      const payload = {
        business_name: name,
        website_url: websiteUri,
        location: { neighborhood: 'Lower Manhattan', borough: 'Manhattan', zip: '' },
        hfi_score: 0,
        friction_type: frictionType,
        status: 'qualified',
        suggested_deliverables: ['Compliance & Security Review'],
        tech_audit_status: null,
        real_vulnerabilities: [],
        security_debt_score: null,
        industry_type: industry,
      };
      const { data: created, error: insertErr } = await supabase.from('leads').insert(payload).select().single();
      if (insertErr) {
        console.error('Enterprise scout insert error:', insertErr);
        continue;
      }
      const loc = created.location && typeof created.location === 'object' ? created.location : {};
      const addr = [loc.neighborhood, loc.borough, loc.zip].filter(Boolean).join(', ');
      saved.push({
        id: created.id,
        name: created.business_name ?? name,
        formattedAddress: addr || null,
        websiteUri: created.website_url ?? null,
        reviewCount: 0,
        securityGrade: null,
        securityScore: 0,
        enterpriseHFI: created.hfi_score ?? 0,
        technicalDebt: [],
        tech_audit_status: null,
        real_vulnerabilities: [],
        security_debt_score: null,
        industry_type: created.industry_type ?? industry,
      });
    }
    return res.json({ leads: saved });
  } catch (err) {
    console.error('Enterprise scout route error:', err);
    return res.status(500).json({ error: err?.message ?? 'Scout failed', leads: [] });
  }
});

/**
 * GET /api/enterprise/audit
 * Query params: query (e.g. "Law Firms in NYC"), industry (default: Legal)
 * Returns: leads with security grade and HFI for each
 */
router.get('/audit', async (req, res) => {
  try {
    const query = String(req.query?.query ?? 'Law Firms in NYC').trim() || 'Law Firms in NYC';
    const industry = String(req.query?.industry ?? 'Legal').trim() || 'Legal';

    const { places, error: leadsError } = await LeadAuditor.findProfessionalLeads(query, industry);
    if (leadsError) {
      return res.status(500).json({ error: leadsError, leads: [] });
    }

    const leads = [];
    for (const place of places || []) {
      const name = place.displayName?.text ?? place.displayName ?? place.id ?? 'Unknown';
      const websiteUri = place.websiteUri ?? null;
      let grade = 'N/A';
      let score = 0;
      let technicalDebt = [];

      if (websiteUri) {
        try {
          const audit = await LeadAuditor.performSecurityAudit(websiteUri);
          grade = audit.grade ?? 'N/A';
          score = typeof audit.score === 'number' ? audit.score : 0;
        } catch {
          grade = 'N/A';
          score = 0;
        }
      }

      const hfi = LeadAuditor.calculateEnterpriseHFI(grade);

      leads.push({
        id: place.id,
        name,
        formattedAddress: place.formattedAddress ?? null,
        websiteUri,
        reviewCount: place.userRatingCount ?? 0,
        securityGrade: grade,
        securityScore: score,
        enterpriseHFI: hfi,
        technicalDebt: [],
        tech_audit_status: websiteUri ? 'pending' : null,
        real_vulnerabilities: [],
        security_debt_score: null,
      });
    }

    return res.json({ query, leads });
  } catch (err) {
    console.error('Enterprise audit route error:', err);
    return res.status(500).json({ error: err?.message ?? 'Audit failed', leads: [] });
  }
});

/**
 * POST /api/enterprise/audit-lead
 * Body: { domain, leadId? } - hostname (e.g. weitzlux.com); leadId to persist audit to leads table
 * On-demand BuiltWith audit. Returns cached data if already completed (0 credits).
 * Saves 'no_debt_found' on API failure so we don't re-scan dead links.
 */
router.post('/audit-lead', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ error: 'domain is required' });
    }

    const cleanDomain = String(domain).trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0] || '';
    if (!cleanDomain) {
      return res.status(400).json({ error: 'invalid domain' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: cached, error: fetchError } = await supabase
      .from('enterprise_audit_cache')
      .select('tech_audit_status, real_vulnerabilities, security_debt_score')
      .eq('domain', cleanDomain)
      .single();

    if (!fetchError && cached && ['completed', 'no_debt_found', 'failed'].includes(cached.tech_audit_status)) {
      return res.json({
        tech_audit_status: cached.tech_audit_status,
        real_vulnerabilities: cached.real_vulnerabilities ?? [],
        security_debt_score: cached.security_debt_score ?? 0,
      });
    }

    const [builtWithVulns, apivoidResult, mozillaAudit] = await Promise.all([
      LeadAuditor.getBuiltWithTechDebt(cleanDomain),
      LeadAuditor.getAPIVoidDomainAge(cleanDomain),
      LeadAuditor.performSecurityAudit(`https://${cleanDomain}`),
    ]);

    const hasLegacyTech = (builtWithVulns || []).some(
      (v) => /legacy jquery|outdated cms|high xss|critical vulnerability/i.test(String(v))
    );

    const { score, evidence: scoreEvidence } = LeadAuditor.computeEvidenceScore({
      builtWithVulns: builtWithVulns || [],
      hasLegacyTech,
      apivoidYearsOld: apivoidResult?.yearsOld ?? 999,
      mozillaGrade: mozillaAudit?.grade ?? null,
      apivoidSecurityIssue: false,
    });

    const realVulns = [];

    if (builtWithVulns && builtWithVulns.length > 0) {
      realVulns.push(...builtWithVulns);
    }
    if (apivoidResult?.evidence?.length) {
      realVulns.push(...apivoidResult.evidence);
    }
    if (mozillaAudit?.grade && mozillaAudit.grade !== 'N/A') {
      const g = mozillaAudit.grade;
      if (['D', 'E', 'F'].includes(g.toUpperCase().charAt(0))) {
        realVulns.push(`Mozilla Observatory: Grade ${g} - Security issues detected`);
      } else {
        realVulns.push(`Mozilla Observatory: Grade ${g} - Pass`);
      }
    }

    const hasAnyData = (builtWithVulns?.length ?? 0) > 0 || apivoidResult != null || (mozillaAudit?.grade && mozillaAudit.grade !== 'N/A');
    if (realVulns.length === 0) {
      realVulns.push(score === 0 && hasAnyData ? 'Verified Stable' : 'No Debt Found');
    } else if (score === 0 && hasAnyData) {
      realVulns.push('Verified Stable');
    }

    const status = realVulns.some((v) => !['No Debt Found', 'Verified Stable'].includes(v)) ? 'completed' : 'no_debt_found';

    const { error: upsertError } = await supabase.from('enterprise_audit_cache').upsert(
      {
        domain: cleanDomain,
        tech_audit_status: status,
        real_vulnerabilities: realVulns,
        security_debt_score: score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'domain' }
    );

    if (upsertError) {
      console.error('Enterprise audit cache upsert error:', upsertError);
    }

    const leadId = req.body?.leadId;
    if (leadId && typeof leadId === 'string' && supabase) {
      await supabase.from('leads').update({
        tech_audit_status: status,
        real_vulnerabilities: realVulns,
        security_debt_score: score,
      }).eq('id', leadId.trim());
    }

    return res.json({
      tech_audit_status: status,
      real_vulnerabilities: realVulns,
      security_debt_score: score,
    });
  } catch (err) {
    console.error('Enterprise audit-lead error:', err);
    return res.status(500).json({ error: err?.message ?? 'Audit failed' });
  }
});

/**
 * POST /api/enterprise/launch-sprint
 * Create enterprise lead in Supabase and launch sprint (same flow as SMB).
 */
router.post('/launch-sprint', async (req, res) => {
  try {
    const { lead, maxSlots, duration: bodyDuration, sprintDuration, deliverables } = req.body;
    const duration = bodyDuration ?? sprintDuration ?? 3;
    if (!lead || !maxSlots || !duration) {
      return res.status(400).json({ error: 'lead, maxSlots, and duration are required' });
    }
    if (maxSlots < 1 || maxSlots > 4 || duration < 2 || duration > 4) {
      return res.status(400).json({ error: 'maxSlots 1-4, duration 2-4 weeks' });
    }
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    const generated = LeadAuditor.generateDeliverables(
      lead.real_vulnerabilities ?? lead.technicalDebt ?? [],
      lead.websiteUri ?? ''
    );
    const suggestedDeliverables = Array.isArray(deliverables) && deliverables.length > 0
      ? deliverables
      : generated.length > 0
        ? generated
        : lead.real_vulnerabilities ?? lead.technicalDebt ?? ['Compliance & Security Review'];
    const frictionType = lead.friction_type ?? 'Compliance & Security';
    const payload = {
      business_name: lead.name ?? 'Enterprise Lead',
      website_url: lead.websiteUri ?? null,
      location: lead.location ?? { neighborhood: '', borough: '', zip: '' },
      hfi_score: lead.enterpriseHFI ?? 0,
      friction_type: frictionType,
      industry_type: lead.industry_type ?? null,
      status: 'qualified',
      suggested_deliverables: suggestedDeliverables,
      tech_audit_status: lead.tech_audit_status ?? null,
      real_vulnerabilities: lead.real_vulnerabilities ?? [],
      security_debt_score: lead.security_debt_score ?? null,
      sprintActive: true,
      maxSlots,
      sprintDuration: duration,
      sprintStartedAt: new Date().toISOString(),
      audit_status: 'completed',
    };
    const { data: created, error } = await supabase.from('leads').insert(payload).select().single();
    if (error) {
      console.error('Enterprise launch-sprint insert error:', error);
      return res.status(500).json({ error: 'Failed to create lead', message: error.message });
    }
    return res.json(created);
  } catch (err) {
    console.error('Enterprise launch-sprint error:', err);
    return res.status(500).json({ error: err?.message ?? 'Launch failed' });
  }
});

export default router;
