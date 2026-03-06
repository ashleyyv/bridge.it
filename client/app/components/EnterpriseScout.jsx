'use client';

import { useEffect, useState, useCallback } from 'react';
import { generateDeliverables } from '@/lib/deliverables';
import { vulnerabilityToSlug, getHttpSlugIfInsecure, SLUG_DISPLAY_TITLES, SLUG_FALLBACKS } from '@/lib/auditSlugs';
/** @typedef {{
 *   id: string;
 *   name: string;
 *   formattedAddress: string | null;
 *   websiteUri: string | null;
 *   reviewCount?: number;
 *   securityGrade: string;
 *   securityScore: number;
 *   enterpriseHFI: number;
 *   technicalDebt: string[];
 *   tech_audit_status?: string | null;
 *   real_vulnerabilities?: string[];
 *   security_debt_score?: number | null;
 * }} EnterpriseLead */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

/**
 * EnterpriseScout - Risk Profile cards for Enterprise leads (Law Firms, etc.)
 * Fetches from /api/enterprise/audit and displays Security Debt & Vulnerabilities.
 * On-demand BuiltWith audit via "Run Deep Audit" button.
 */
export default function EnterpriseScout({ onLaunchComplianceSprint }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [auditingDomain, setAuditingDomain] = useState(null);
  const [dossierLead, setDossierLead] = useState(null);
  const [pursuitDefinitions, setPursuitDefinitions] = useState({ entries: [] });
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);

  const runDeepAudit = async (lead) => {
    const uri = lead?.websiteUri;
    if (!uri) return;
    const domain = String(uri).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0] || '';
    if (!domain) return;

    setAuditingDomain(domain);
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/audit-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
        mode: 'cors',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Audit failed');

      setLeads((prev) =>
        prev.map((l) => {
          const lDomain = String(l.websiteUri || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0] || '';
          if (lDomain !== domain) return l;
          return {
            ...l,
            tech_audit_status: data.tech_audit_status ?? 'completed',
            real_vulnerabilities: data.real_vulnerabilities ?? [],
            security_debt_score: data.security_debt_score ?? 0,
            technicalDebt: data.real_vulnerabilities ?? [],
          };
        })
      );
    } catch (err) {
      setError(err?.message || 'Deep audit failed');
    } finally {
      setAuditingDomain(null);
    }
  };

  useEffect(() => {
    const fetchPursuitDefinitions = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/enterprise/pursuit-internal-definitions`, {
          mode: 'cors',
          credentials: 'include',
        });
        const data = await res.json();
        setPursuitDefinitions({ entries: data?.entries ?? [] });
      } catch {
        setPursuitDefinitions({ entries: [] });
      }
    };
    fetchPursuitDefinitions();
  }, []);

  // Refetch pursuit definitions when modal opens to ensure fresh data for the lead
  useEffect(() => {
    if (!dossierLead) {
      setBriefingLoading(false);
      return;
    }
    const fetchForModal = async () => {
      setBriefingLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/enterprise/pursuit-internal-definitions`, {
          mode: 'cors',
          credentials: 'include',
        });
        const data = await res.json();
        setPursuitDefinitions({ entries: data?.entries ?? [] });
      } catch {
        setPursuitDefinitions((prev) => prev);
      } finally {
        setBriefingLoading(false);
      }
    };
    fetchForModal();
  }, [dossierLead]);

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        setLoading(true);
        setError(null);
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
        const res = await fetch(`${API_BASE}/api/enterprise/audit?query=Law%20Firms%20in%20NYC`, {
          mode: 'cors',
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || 'Failed to fetch enterprise leads');
          setLeads([]);
          return;
        }
        setLeads(data?.leads ?? []);
      } catch (err) {
        setError(err?.message || 'Failed to load enterprise audit');
        setLeads([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLeads();
  }, []);

  const getRiskLevel = (score) => {
    if (score > 7) return { label: 'CRITICAL', className: 'bg-red-600 text-white' };
    if (score >= 5) return { label: 'HIGH', className: 'bg-orange-600 text-white' };
    if (score >= 2) return { label: 'MODERATE', className: 'bg-amber-600 text-white' };
    return { label: 'LOW RISK', className: 'bg-emerald-700 text-white' };
  };

  const getPursuitBySlug = useCallback(() => {
    const bySlug = {};
    for (const e of pursuitDefinitions.entries) {
      if (e.vulnerability_slug) bySlug[e.vulnerability_slug] = e;
    }
    return bySlug;
  }, [pursuitDefinitions.entries]);

  const buildSprintBriefMarkdown = useCallback((lead) => {
    const vulns = lead.real_vulnerabilities ?? lead.technicalDebt ?? [];
    const bySlug = getPursuitBySlug();
    const fb = (slug) => SLUG_FALLBACKS[slug];
    const PENDING = (slug) => `Briefing Pending for ${slug}`;

    const items = [];
    const seenSlugs = new Set();
    for (const v of vulns) {
      if (/verified stable|no debt found|established|pass$/i.test(String(v))) continue;
      const slug = vulnerabilityToSlug(v, lead.websiteUri);
      if (slug && !seenSlugs.has(slug)) {
        seenSlugs.add(slug);
        const e = bySlug[slug];
        const title = e?.internal_title ?? e?.display_title ?? SLUG_DISPLAY_TITLES[slug] ?? slug;
        items.push({
          title,
          triage: e?.technical_why ?? e?.admin_triage_note ?? fb(slug)?.technical_why ?? PENDING(slug),
          deliverable: e?.alumni_deliverable ?? e?.fellow_what ?? e?.fellow_assignment_task ?? fb(slug)?.alumni_deliverable ?? PENDING(slug),
        });
      }
    }
    const httpSlug = getHttpSlugIfInsecure(lead.websiteUri);
    if (httpSlug && !seenSlugs.has(httpSlug)) {
      const e = bySlug[httpSlug];
      const title = e?.internal_title ?? e?.display_title ?? SLUG_DISPLAY_TITLES[httpSlug] ?? httpSlug;
      items.push({
        title,
        triage: e?.technical_why ?? e?.admin_triage_note ?? fb(httpSlug)?.technical_why ?? PENDING(httpSlug),
        deliverable: e?.alumni_deliverable ?? e?.fellow_what ?? e?.fellow_assignment_task ?? fb(httpSlug)?.alumni_deliverable ?? PENDING(httpSlug),
      });
    }

    let md = `### SPRINT ASSIGNMENT: ${lead.name}\n\n`;
    for (const { triage, deliverable } of items) {
      md += `**Triage Note:** ${triage}\n`;
      md += `**Fellow Deliverable:** ${deliverable}\n\n`;
    }
    return md.trim();
  }, [getPursuitBySlug]);

  if (loading) {
    return (
      <div className="min-h-[240px] flex items-center justify-center bg-slate-900/50 rounded-xl border border-slate-700">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-500 border-t-cyan-500 rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">Loading enterprise risk profiles…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-slate-900/80 border border-red-900/50 rounded-xl">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {leads.map((lead) => {
          const isPreAudit = lead.security_debt_score == null;
          const displayScore = lead.security_debt_score ?? 0;
          const risk = getRiskLevel(displayScore);
          const isCritical = !isPreAudit && displayScore > 7;

          const isHttp = (lead.websiteUri || '').toLowerCase().startsWith('http://');
          const reviewCount = lead.reviewCount ?? 0;
          const isTier1 = reviewCount > 50;

          const priorityLabel = isPreAudit
            ? isHttp
              ? 'Immediate Risk (Insecure)'
              : isTier1
                ? 'Tier 1 Enterprise'
                : 'High Priority'
            : null;
          const priorityOrange = isPreAudit && isHttp;

          const domain = String(lead.websiteUri || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0] || '';
          const potentialRisk = isPreAudit && domain
            ? isHttp
              ? 'Critical SSL Debt'
              : domain.endsWith('.com')
                ? 'Standard Tech Stack'
                : 'Specialty TLD'
            : null;

          const isAudited = !isPreAudit;
          return (
            <div
              key={lead.id}
              onClick={() => isAudited && setDossierLead(lead)}
              className={`bg-slate-800/90 border border-slate-700 rounded-xl overflow-hidden shadow-lg transition-colors ${isAudited ? 'cursor-pointer hover:border-cyan-500/50' : 'hover:border-slate-600'}`}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-700">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-white text-lg truncate">{lead.name}</h3>
                </div>
                {lead.websiteUri && (
                  <a
                    href={lead.websiteUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 text-sm mt-1 truncate block"
                  >
                    {lead.websiteUri.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                  </a>
                )}
                {lead.formattedAddress && (
                  <p className="text-slate-400 text-xs mt-1">{lead.formattedAddress}</p>
                )}
              </div>

              {/* Grade & Score: Pre-Audit = Lead Priority (Gold/Orange) + Potential Risk; Post-Audit = Risk Level (Red/Green) */}
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-xs uppercase tracking-wider">
                    {isPreAudit ? 'Lead Priority' : 'Risk Level'}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded text-xs font-bold ${
                      isPreAudit
                        ? priorityOrange
                          ? 'bg-orange-500/90 text-orange-950'
                          : 'bg-amber-500/90 text-amber-950'
                        : isCritical
                          ? 'bg-red-600 text-white'
                          : risk.className
                    }`}
                  >
                    {isPreAudit ? (priorityLabel ?? 'Vetting Required') : risk.label}
                  </span>
                </div>
                {isPreAudit ? (
                  potentialRisk && (
                    <p className="text-slate-500 text-xs">
                      Potential Risk: {potentialRisk}
                    </p>
                  )
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">
                      Security Debt Score
                    </span>
                    <span className="text-white font-mono font-semibold">{displayScore}/10</span>
                  </div>
                )}
              </div>

              {/* Proposed Deliverables - from audit (shown on card and in Launch modal) */}
              {(() => {
                const deliverables = generateDeliverables(
                  lead.real_vulnerabilities ?? lead.technicalDebt ?? [],
                  lead.websiteUri ?? undefined
                );
                if (deliverables.length === 0) return null;
                return (
                  <div className="px-5 py-3 bg-slate-900/60 border-t border-slate-700">
                    <h4 className="text-slate-400 text-xs uppercase tracking-wider mb-2">Proposed Deliverables</h4>
                    <ul className="space-y-1">
                      {deliverables.map((d, idx) => (
                        <li key={idx} className="text-cyan-300 text-sm">• {d}</li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {/* Evidence / Vulnerabilities (from on-demand audit: BuiltWith, APIVoid, Mozilla) */}
              {((lead.real_vulnerabilities?.length ?? 0) > 0 || (lead.technicalDebt?.length ?? 0) > 0) && (
                <div className="px-5 py-3 bg-slate-900/60 border-t border-slate-700">
                  <h4 className="text-slate-400 text-xs uppercase tracking-wider mb-2">
                    {displayScore === 0 ? 'Evidence' : 'Vulnerabilities Found'}
                  </h4>
                  <ul className="space-y-1.5">
                    {(lead.real_vulnerabilities ?? lead.technicalDebt ?? []).map((item, idx) => {
                      const isVerified = String(item).includes('Verified Stable') || String(item).includes('Established') || String(item).includes('Pass');
                      return (
                        <li key={idx} className={`text-sm flex items-start gap-2 ${isVerified ? 'text-emerald-400' : 'text-slate-300'}`}>
                          <span className={`mt-0.5 ${isVerified ? 'text-emerald-500' : 'text-red-500'}`}>•</span>
                          <span>{item}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* On-Demand Audit & Launch */}
              <div className="px-5 py-4 border-t border-slate-700 space-y-2">
                {lead.websiteUri && (
                  (() => {
                    const domain = String(lead.websiteUri).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0] || '';
                    const isCompleted = lead.tech_audit_status === 'completed' || lead.tech_audit_status === 'no_debt_found' || lead.tech_audit_status === 'failed';
                    const isAuditing = auditingDomain === domain;
                    return isCompleted ? (
                      <button disabled className="w-full py-2 px-4 bg-emerald-800 text-emerald-200 font-medium rounded-lg cursor-not-allowed">
                        Audit Synced
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); runDeepAudit(lead); }}
                        disabled={isAuditing}
                        className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 disabled:cursor-wait text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        {isAuditing ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Running audit…
                          </>
                        ) : (
                          'Run Deep Audit'
                        )}
                      </button>
                    );
                  })()
                )}
                <button
                  onClick={() => {
                    if (typeof onLaunchComplianceSprint === 'function') {
                      onLaunchComplianceSprint(lead);
                    } else {
                      console.warn('EnterpriseScout: onLaunchComplianceSprint not provided');
                    }
                  }}
                  className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition-colors"
                >
                  Launch Compliance Sprint
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {leads.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          No enterprise leads found. Try a different query.
        </div>
      )}

      {/* Pursuit Technical Briefing Modal - internal diagnostic UI */}
      {dossierLead && (() => {
        const vulns = dossierLead.real_vulnerabilities ?? dossierLead.technicalDebt ?? [];
        const bySlug = getPursuitBySlug();
        const score = dossierLead.security_debt_score ?? 0;

        const items = [];
        const seenSlugs = new Set();
        const fb = (slug) => SLUG_FALLBACKS[slug];
        const PENDING = (slug) => `Briefing Pending for ${slug}`;

        for (const v of vulns) {
          if (/verified stable|no debt found|established|pass$/i.test(String(v))) continue;
          const slug = vulnerabilityToSlug(v, dossierLead.websiteUri);
          if (slug && !seenSlugs.has(slug)) {
            seenSlugs.add(slug);
            const e = bySlug[slug];
            const title = e?.internal_title ?? e?.display_title ?? SLUG_DISPLAY_TITLES[slug] ?? slug;
            items.push({
              title,
              proof: e?.technical_proof ?? fb(slug)?.technical_proof ?? v,
              triage: e?.technical_why ?? e?.admin_triage_note ?? fb(slug)?.technical_why ?? PENDING(slug),
              deliverable: e?.alumni_deliverable ?? e?.fellow_what ?? e?.fellow_assignment_task ?? fb(slug)?.alumni_deliverable ?? PENDING(slug),
            });
          }
        }
        const httpSlug = getHttpSlugIfInsecure(dossierLead.websiteUri);
        if (httpSlug && !seenSlugs.has(httpSlug)) {
          const e = bySlug[httpSlug];
          const title = e?.internal_title ?? e?.display_title ?? SLUG_DISPLAY_TITLES[httpSlug] ?? httpSlug;
          items.push({
            title,
            proof: e?.technical_proof ?? fb(httpSlug)?.technical_proof ?? 'Site served over HTTP (insecure)',
            triage: e?.technical_why ?? e?.admin_triage_note ?? fb(httpSlug)?.technical_why ?? PENDING(httpSlug),
            deliverable: e?.alumni_deliverable ?? e?.fellow_what ?? e?.fellow_assignment_task ?? fb(httpSlug)?.alumni_deliverable ?? PENDING(httpSlug),
          });
        }

        return (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[80] p-4" onClick={() => setDossierLead(null)}>
            <div className="bg-slate-950 border border-slate-700 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {/* Header - Internal Briefing */}
              <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0 bg-slate-900/60">
                <div>
                  <h2 className="text-base font-bold text-slate-200 tracking-tight">Internal Briefing</h2>
                  <p className="text-slate-500 text-xs mt-1 font-mono">{dossierLead.name} — Debt: {score}/10</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const md = buildSprintBriefMarkdown(dossierLead);
                      navigator.clipboard?.writeText(md).then(() => {
                        setCopyFeedback(true);
                        setTimeout(() => setCopyFeedback(false), 2000);
                      });
                    }}
                    className="px-3 py-1.5 bg-slate-800 border border-slate-600 hover:border-slate-500 text-slate-300 text-xs font-medium rounded"
                  >
                    {copyFeedback ? 'Copied!' : 'Copy Brief'}
                  </button>
                  <button onClick={() => setDossierLead(null)} className="text-slate-500 hover:text-white text-lg leading-none">×</button>
                </div>
              </div>

              {/* Diagnostic Cards - one per vulnerability, full width */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {briefingLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-slate-500 border-t-cyan-500 rounded-full animate-spin" />
                      <span className="text-slate-500 text-sm">Loading briefing…</span>
                    </div>
                  </div>
                ) : items.length === 0 ? (
                  <div className="border border-slate-700 rounded p-4 text-slate-500 text-sm">No technical findings.</div>
                ) : (
                  items.map(({ title, proof, triage, deliverable }, i) => (
                    <div key={i} className="border border-slate-600 rounded-lg bg-slate-900/50 overflow-hidden w-full">
                      <div className="px-4 py-2 border-b border-slate-600 bg-slate-800/60">
                        <span className="text-slate-200 font-semibold text-sm">{title}</span>
                      </div>
                      <div className="p-4 space-y-3">
                        {/* WHY (Admin Triage): technical_why — high-contrast */}
                        <div className="border border-amber-500/70 rounded bg-amber-950/40 p-3">
                          <div className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1">Why (Admin Triage)</div>
                          <p className="text-slate-100 text-sm leading-relaxed">{triage}</p>
                        </div>
                        {/* WHAT (Fellow Deliverable): alumni_deliverable — Action block */}
                        <div className="border border-emerald-500/70 rounded bg-emerald-950/30 p-3">
                          <div className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">What (Fellow Deliverable)</div>
                          <p className="text-slate-100 text-sm leading-relaxed">{deliverable}</p>
                        </div>
                        <pre className="text-slate-500 text-xs font-mono overflow-x-auto pt-1" style={{ fontFamily: '"Courier New", Courier, monospace' }}>{proof}</pre>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
