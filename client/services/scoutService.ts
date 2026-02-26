/**
 * Scout service: build tier, audit defaults, and address normalization for NYC Open Data fuzzy match.
 * Uses existing Supabase client when persisting; Yelp insert defaults prepared for server/Supabase use.
 */

import { createClient } from "@/lib/supabase";

export type AuditStatus = "pending" | "processing" | "completed" | "failed";

export interface LeadForTier {
  website_url?: string | null;
}

export interface LeadWithAudit {
  audit_status?: AuditStatus | null;
  technical_audit?: Record<string, unknown> | null;
  civic_audit?: Record<string, unknown> | null;
  website_url?: string | null;
}

/** Returns 'No Web Presence' if no website_url, otherwise 'Technical Optimization'. */
export function getBuildTier(lead: LeadForTier): "No Web Presence" | "Technical Optimization" {
  const url = lead?.website_url;
  if (url == null || String(url).trim() === "") return "No Web Presence";
  return "Technical Optimization";
}

/** Default audit fields for new leads (e.g. from Yelp). Use when inserting into Supabase leads table. */
export const DEFAULT_AUDIT_STATUS: AuditStatus = "pending";

export function getDefaultLeadAuditPayload(): Pick<LeadWithAudit, "audit_status"> {
  return { audit_status: DEFAULT_AUDIT_STATUS };
}

/**
 * Cleans a business address for NYC Open Data cross-referencing:
 * trim, uppercase, remove common street suffixes (St, Ave, Road, etc.).
 */
export function cleanAddressForFuzzyMatch(address: string): string {
  if (address == null) return "";
  let s = String(address).trim();
  if (s === "") return "";

  s = s.toUpperCase();

  const suffixes = [
    /\s+ST\.?\s*$/i,
    /\s+STREET\s*$/i,
    /\s+AVE\.?\s*$/i,
    /\s+AVENUE\s*$/i,
    /\s+ROAD\s*$/i,
    /\s+RD\.?\s*$/i,
    /\s+BLVD\.?\s*$/i,
    /\s+BOULEVARD\s*$/i,
    /\s+LN\.?\s*$/i,
    /\s+LANE\s*$/i,
    /\s+DR\.?\s*$/i,
    /\s+DRIVE\s*$/i,
    /\s+PL\.?\s*$/i,
    /\s+PLACE\s*$/i,
  ];

  for (const re of suffixes) {
    s = s.replace(re, " ");
  }

  return s.replace(/\s+/g, " ").trim();
}

/** Supabase client for scout-related persistence. Use from server or client as appropriate. */
export function getSupabase() {
  return createClient();
}
