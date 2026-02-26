import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendFileSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import jsPDF from 'jspdf';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { searchYelp } from './services/yelpService.js';
import { fetchPageSpeedScores } from './services/pageSpeedService.js';
import { fetchDOHMHViolations } from './services/nycOpenDataService.js';
import { fetchReviewSentiment } from './services/outscraperService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase client for scout/DB bridge (use SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env)
const supabase = (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY))
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    )
  : null;

// Mock email transporter for demo (would use real SMTP in production)
const transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email', // Demo service
  port: 587,
  secure: false,
  auth: {
    user: 'demo@bridge.it',
    pass: 'demo-password'
  }
});

// Wrapper to forward async rejections to error handler (prevents unhandled rejection → non-JSON 500)
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Middleware
app.use(cors());
app.use(express.json());

// #region agent log
app.use((req, _res, next) => {
  const p = { location: 'server/index.js:request-middleware', message: 'Incoming request', data: { method: req.method, url: req.url }, timestamp: Date.now(), hypothesisId: 'Hreq' };
  fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).catch(() => {});
  try { appendFileSync(join(__dirname, '..', '.cursor', 'debug.log'), JSON.stringify(p) + '\n'); } catch (_) {}
  next();
});
// #endregion

// Root route: avoid "Cannot GET /" when opening API base URL in browser
app.get('/', (req, res) => {
  res.type('html').send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>Bridge.it API</title></head>
    <body style="font-family:sans-serif;max-width:40em;margin:2em auto;padding:0 1em;">
      <h1>Bridge.it API</h1>
      <p>This is the API server. Use the app at <strong>http://localhost:3000</strong> or <strong>http://localhost:3003</strong> (Next.js).</p>
      <p><a href="/health">Health check</a> · <a href="/api/leads">Leads API</a></p>
    </body></html>
  `);
});

// Helper function to load alumni data
async function loadAlumniData() {
  try {
    const alumniPath = join(__dirname, '..', '_architect_ref', 'mockAlumni.json');
    const rawData = await readFile(alumniPath, 'utf-8');
    const data = JSON.parse(rawData);
    return data.alumni || [];
  } catch (error) {
    console.error('Error loading alumni data:', error);
    return [];
  }
}

// Helper function to populate builder details from alumni registry
async function populateBuilderDetails(builder) {
  const alumni = await loadAlumniData();
  const alumniData = alumni.find(a => a.id === builder.userId);
  
  if (alumniData) {
    return {
      ...builder,
      name: alumniData.name,
      avatar: alumniData.avatar,
      specialty: alumniData.specialty,
      qualityRating: alumniData.qualityRating,
      skills: alumniData.skills,
      completedProjects: alumniData.completedProjects,
      averageCompletionTime: alumniData.averageCompletionTime
    };
  }
  
  // Return builder as-is if not found in registry
  return builder;
}

// Helper function to populate activeBuilders with alumni details
async function populateActiveBuilders(lead) {
  if (!lead.activeBuilders || lead.activeBuilders.length === 0) {
    return lead;
  }
  
  const populatedBuilders = await Promise.all(
    lead.activeBuilders.map(builder => populateBuilderDetails(builder))
  );
  
  return {
    ...lead,
    activeBuilders: populatedBuilders
  };
}

// Calculate HFI score (0-100) from Yelp rating, review_count, and price for scout leads
function calculateHFI(rating, review_count, price) {
  const r = rating != null && !Number.isNaN(Number(rating)) ? Math.min(5, Math.max(0, Number(rating))) : 0;
  const c = review_count != null && !Number.isNaN(Number(review_count)) ? Math.max(0, Number(review_count)) : 0;
  const priceLevel = price != null && typeof price === 'string' ? price.length : 0; // $=1, $$=2, etc.
  const ratingScore = (r / 5) * 60; // 0-60 from rating
  const engagementScore = Math.min(25, Math.log10(c + 1) * 8); // 0-25 from log(review_count)
  const priceScore = Math.min(15, priceLevel * 5); // 0-15 from price tier
  return Math.round(Math.min(100, Math.max(0, ratingScore + engagementScore + priceScore)));
}

// Helper function to apply recency weights to HFI scores
function applyRecencyWeights(lead) {
  if (!lead.recency_data || typeof lead.recency_data !== 'object') {
    return { ...lead, weighted_issues: 0, recency_score: 0 };
  }
  const recent = lead.recency_data["0_30_days"] || 0;
  const supporting = lead.recency_data["31_90_days"] || 0;
  const historical = lead.recency_data["90_plus_days"] || 0;
  
  // Calculate weighted score (0-30 days: 1.0x, 31-90 days: 0.5x, 90+ days: 0.0x)
  const weightedIssues = (recent * 1.0) + (supporting * 0.5) + (historical * 0.0);
  
  return {
    ...lead,
    weighted_issues: weightedIssues,
    recency_score: recent / (recent + supporting + historical) || 0
  };
}

// Ensure lead has Supabase audit/website fields for frontend (defaults when missing)
function ensureLeadAuditFields(lead) {
  const safe = (v) => (v != null && typeof v === 'object') ? v : null;
  return {
    ...lead,
    website_url: lead.website_url ?? null,
    audit_status: lead.audit_status ?? 'pending',
    technical_audit: safe(lead.technical_audit),
    civic_audit: Array.isArray(lead.civic_audit) ? lead.civic_audit : (safe(lead.civic_audit) ?? []),
    sentiment_audit: safe(lead.sentiment_audit) ?? (Array.isArray(lead.sentiment_audit) ? lead.sentiment_audit : null),
  };
}

// API Routes
app.get('/api/yelp/search', async (req, res) => {
  try {
    const { term, location, limit } = req.query;
    const results = await searchYelp({ term, location, limit: limit ? parseInt(limit, 10) : undefined });
    res.json(results);
  } catch (err) {
    console.error('Yelp search error:', err);
    res.status(err.response?.status === 401 ? 401 : 500).json({
      error: 'Yelp search failed',
      message: err.message ?? String(err),
    });
  }
});

// Scout: Yelp → Supabase leads (upsert by business_name to avoid duplicates)
app.post('/api/scout/yelp', async (req, res) => {
  try {
    // #region agent log
    const contentType = req.headers && req.headers['content-type'];
    const bodyKeys = req.body && typeof req.body === 'object' ? Object.keys(req.body) : [];
    fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:POST /api/scout/yelp',message:'Scout handler entry',data:{contentType,bodyKeys,body:req.body,hasSupabase:!!supabase},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    const { location, term } = req.body || {};
    if (!location && !term) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:scout/yelp:400',message:'Returning 400 missing body',data:{location,term},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      return res.status(400).json({
        error: 'Missing required body fields',
        message: 'Provide at least "location" or "term" in the request body.',
      });
    }
    if (!supabase) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:scout/yelp:503',message:'Returning 503 no supabase',data:{},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      return res.status(503).json({
        error: 'Database not configured',
        message: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env',
      });
    }

    const results = await searchYelp({ location, term });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:scout/yelp:afterYelp',message:'Yelp search completed',data:{resultCount:results?.length,firstKeys:results?.[0]?Object.keys(results[0]):[]},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    if (results.length === 0) {
      return res.json({ count: 0 });
    }

    const batchId = crypto.randomUUID();
    const payload = results.map((row) => {
      const { yelp_id, yelp_alias, rating, review_count, price, ...rest } = row;
      const hfi_score = calculateHFI(rating, review_count, price);
      return { ...rest, hfi_score, batch_id: batchId };
    });

    // Insert leads. Use upsert with onConflict: 'business_name' only after adding
    // UNIQUE(business_name) to the leads table in Supabase.
    const { data, error } = await supabase
      .from('leads')
      .insert(payload)
      .select();

    if (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:scout/yelp:insertError',message:'Supabase insert failed',data:{code:error?.code,message:error?.message,details:error?.details,hint:error?.hint},timestamp:Date.now(),hypothesisId:'H1',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      console.error('Scout Yelp insert error:', error);
      return res.status(500).json({
        error: 'Failed to save leads',
        message: error.message,
      });
    }

    const count = data?.length ?? results.length;
    return res.json({ count });
  } catch (err) {
    // #region agent log
    const yelpStatus = err.response && err.response.status;
    const yelpData = err.response && err.response.data;
    fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:scout/yelp:catch',message:'Scout Yelp catch',data:{message:err.message,stack:err.stack?.slice(0,500),yelpStatus,yelpData},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    console.error('Scout Yelp error:', err);
    const body = {
      error: 'Scout Yelp failed',
      message: err.message ?? String(err),
    };
    if (err.response != null) {
      body.yelpStatus = err.response.status;
      body.yelpError = err.response.data;
    }
    res.status(500).json(body);
  }
});

app.get('/api/leads', asyncHandler(async (req, res) => {
  const sendJson = (status, body) => {
    if (res.headersSent) return;
    res.status(status).setHeader('Content-Type', 'application/json');
    try {
      res.send(JSON.stringify(body));
    } catch (e) {
      try { res.send(JSON.stringify({ error: 'Response serialization failed' })); } catch (_) {}
    }
  };
  try {
    const entryPayload = { location: 'server/index.js:GET-api-leads:entry', message: 'GET /api/leads entry', data: { hasSupabase: !!supabase }, timestamp: Date.now(), hypothesisId: 'H1' };
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entryPayload) }).catch(() => {});
    try { appendFileSync(join(__dirname, '..', '.cursor', 'debug.log'), JSON.stringify(entryPayload) + '\n'); } catch (_) {}
    // #endregion
    if (!supabase) {
      return sendJson(503, { error: 'Database not configured', message: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env' });
    }

    const viewAll = req.query?.view === 'all';
    let rows;
    if (!viewAll) {
      let query = supabase.from('leads').select('*').order('id', { ascending: false });
      query = query.or('hfi_score.gte.75,is_priority.eq.true');
      const { data, error: qerr } = await query;
      if (qerr) {
        if (qerr.code === '42703' && qerr.message?.includes('promoted')) {
          query = supabase.from('leads').select('*').order('id', { ascending: false }).gte('hfi_score', 75);
          const { data: fallback, error: fallbackErr } = await query;
          if (fallbackErr) {
            const supErr = { location: 'server/index.js:GET-api-leads:supabaseError', message: 'Supabase fetch error', data: { msg: fallbackErr.message }, timestamp: Date.now(), hypothesisId: 'H2' };
            fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(supErr) }).catch(() => {});
            console.error('Error fetching leads from Supabase:', fallbackErr);
            return sendJson(500, { error: 'Failed to load leads', message: fallbackErr.message });
          }
          rows = fallback;
        } else {
          const supErr = { location: 'server/index.js:GET-api-leads:supabaseError', message: 'Supabase fetch error', data: { msg: qerr.message, code: qerr.code }, timestamp: Date.now(), hypothesisId: 'H2' };
          fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(supErr) }).catch(() => {});
          try { appendFileSync(join(__dirname, '..', '.cursor', 'debug.log'), JSON.stringify(supErr) + '\n'); } catch (_) {}
          console.error('Error fetching leads from Supabase:', qerr);
          return sendJson(500, { error: 'Failed to load leads', message: qerr.message });
        }
      } else {
        rows = data;
      }
    } else {
      const { data, error } = await supabase.from('leads').select('*').order('id', { ascending: false });
      if (error) {
        const supErr = { location: 'server/index.js:GET-api-leads:supabaseError', message: 'Supabase fetch error', data: { msg: error.message, code: error.code }, timestamp: Date.now(), hypothesisId: 'H2' };
        fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(supErr) }).catch(() => {});
        try { appendFileSync(join(__dirname, '..', '.cursor', 'debug.log'), JSON.stringify(supErr) + '\n'); } catch (_) {}
        console.error('Error fetching leads from Supabase:', error);
        return sendJson(500, { error: 'Failed to load leads', message: error.message });
      }
      rows = data;
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:GET-api-leads:afterSupabase',message:'Supabase fetch OK',data:{rowCount:(rows||[]).length},timestamp:Date.now(),hypothesisId:'H2b'})}).catch(()=>{});
    // #endregion

    const leads = (rows || []).map((row) => {
      const lead = {
        ...row,
        business_name: row.business_name ?? row.name ?? '',
        location: row.location && typeof row.location === 'object'
          ? row.location
          : { neighborhood: '', borough: '', zip: '' },
        status: row.status ?? 'qualified',
        hfi_score: row.hfi_score ?? 0,
        is_priority: Boolean(row.is_priority),
        time_on_task_estimate: row.time_on_task_estimate ?? '2-3 weeks',
        friction_type: row.friction_type ?? 'Website / Digital Presence',
      };
      const withAudit = ensureLeadAuditFields(lead);
      return applyRecencyWeights(withAudit);
    });

    // Pivot to Queens, NY: exclude Bronx leads so UI only shows Queens data
    const borough = (l) => (l.location?.borough ?? '').toString().toLowerCase();
    const queensOnly = leads.filter((l) => borough(l) !== 'bronx');

    // Audit trigger: call NYC DOHMH for leads that don't have civic_audit yet
    const needsCivicAudit = (l) => !Array.isArray(l.civic_audit) || l.civic_audit.length === 0;
    const enrichCivicAudit = async (lead) => {
      if (!needsCivicAudit(lead)) return lead;
      const loc = lead.location && typeof lead.location === 'object' ? lead.location : {};
      const businessName = lead.business_name ?? lead.name ?? '';
      const addressPart = [loc.neighborhood, loc.borough, loc.zip].filter(Boolean).join(', ');
      const searchQuery = [businessName, addressPart, 'NYC'].filter(Boolean).join(' ');
      if (!searchQuery.trim()) return lead;
      try {
        const violations = await fetchDOHMHViolations({
          businessName,
          address: addressPart,
          borough: loc.borough,
          zip: loc.zip,
          limit: 20,
        });
        const enriched = { ...lead, civic_audit: violations };
        if (supabase) {
          supabase.from('leads').update({ civic_audit: violations }).eq('id', lead.id).then(() => {}).catch((e) => console.error('Civic audit persist error:', e?.message || e));
        }
        return enriched;
      } catch (e) {
        console.error('Civic audit fetch error for', businessName, ':', e?.message || e);
        return lead;
      }
    };
    const afterEnrich = await Promise.all(queensOnly.map(enrichCivicAudit));

    const processedLeads = await Promise.all(afterEnrich.map((lead) => populateActiveBuilders(lead)));

    const highPriorityCount = processedLeads.filter((l) => (l.hfi_score ?? 0) >= 75 || Boolean(l.is_priority)).length;
    const avgHfi = processedLeads.length > 0
      ? processedLeads.reduce((sum, l) => sum + (l.hfi_score ?? 0), 0) / processedLeads.length
      : 0;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:GET-api-leads:beforeSend',message:'About to send response',data:{processedCount:processedLeads.length},timestamp:Date.now(),hypothesisId:'H2d'})}).catch(()=>{});
    // #endregion

    const payload = {
      leads: processedLeads,
      metadata: {
        total_leads: processedLeads.length,
        high_priority_count: highPriorityCount,
        avg_hfi_score: Math.round(avgHfi * 10) / 10,
      },
    };
    try {
      JSON.stringify(payload);
    } catch (serialErr) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:GET-api-leads:serialErr',message:'Payload serialization failed',data:{msg:String(serialErr?.message||serialErr)},timestamp:Date.now(),hypothesisId:'H3b'})}).catch(()=>{});
      // #endregion
      console.error('Leads payload serialization error:', serialErr);
      return sendJson(500, { error: 'Failed to serialize leads', message: 'Response data contains non-JSON-serializable values' });
    }

    return sendJson(200, payload);
  } catch (err) {
    const errPayload = { location: 'server/index.js:GET-api-leads:catch', message: 'GET /api/leads catch', data: { msg: String(err?.message || err), name: err?.name, stack: (err?.stack || '').slice(0, 500) }, timestamp: Date.now(), hypothesisId: 'H3' };
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(errPayload) }).catch(() => {});
    try { appendFileSync(join(__dirname, '..', '.cursor', 'debug.log'), JSON.stringify(errPayload) + '\n'); } catch (_) {}
    // #endregion
    console.error('Error loading leads:', err);
    const msg = (err && (err.message || err.reason)) ? String(err.message || err.reason) : String(err);
    return sendJson(500, { error: 'Failed to load leads data', message: msg });
  }
}));

// Promote lead to Main list (MUST be before /api/leads/:id for path matching)
app.patch('/api/leads/:id/promote', async (req, res) => {
  try {
    const { id } = req.params;
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { data, error } = await supabase
      .from('leads')
      .update({ is_priority: true })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      if (error.code === '42703' && (String(error.message || '').includes('promoted') || String(error.message || '').includes('is_priority'))) {
        return res.status(400).json({
          error: 'is_priority column not found',
          message: 'Run the migration: ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT false;'
        });
      }
      console.error('Promote error:', error);
      return res.status(500).json({ error: 'Failed to promote lead', message: error.message });
    }
    if (!data) return res.status(404).json({ error: 'Lead not found' });
    res.json(data);
  } catch (err) {
    console.error('Promote error:', err);
    res.status(500).json({ error: 'Failed to promote lead', message: err?.message ?? 'Unknown error' });
  }
});

// Get single lead by ID
app.get('/api/leads/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { data: row, error } = await supabase.from('leads').select('*').eq('id', req.params.id).single();
    if (error || !row) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    const lead = {
      ...row,
      business_name: row.business_name ?? row.name ?? '',
      location: row.location && typeof row.location === 'object' ? row.location : { neighborhood: '', borough: '', zip: '' },
      status: row.status ?? 'qualified',
      hfi_score: row.hfi_score ?? 0,
      time_on_task_estimate: row.time_on_task_estimate ?? '2-3 weeks',
      friction_type: row.friction_type ?? 'Website / Digital Presence',
    };
    const withAudit = ensureLeadAuditFields(lead);
    const weightedLead = applyRecencyWeights(withAudit);
    const populatedLead = await populateActiveBuilders(weightedLead);
    res.json(populatedLead);
  } catch (error) {
    console.error('Error loading lead:', error);
    res.status(500).json({ error: 'Failed to load lead data', message: error.message });
  }
});

// Deep audit: run PageSpeed, NYC DOHMH, and Outscraper in parallel; save to technical_audit, civic_audit, sentiment_audit
app.post('/api/leads/:id/deep-audit', async (req, res) => {
  const sendJson = (status, body) => {
    if (res.headersSent) return;
    res.status(status).setHeader('Content-Type', 'application/json');
    let payload;
    try {
      payload = JSON.stringify(body);
    } catch (e) {
      payload = JSON.stringify({ error: 'Response serialization failed', message: String(e?.message || e) });
    }
    res.send(payload);
  };
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:deep-audit:entry',message:'Deep-audit route entry',data:{leadId:req.params.id,hasSupabase:!!supabase},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    if (!supabase) {
      return sendJson(503, { error: 'Database not configured' });
    }
    const id = req.params?.id;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return sendJson(400, { error: 'Invalid lead id' });
    }
    const { data: lead, error: fetchError } = await supabase.from('leads').select('*').eq('id', id).single();
    if (fetchError || !lead) {
      return sendJson(404, { error: 'Lead not found' });
    }

    const websiteUrl = lead.website_url && String(lead.website_url).trim() ? lead.website_url.trim() : null;
    const businessName = lead.business_name ?? lead.name ?? '';
    const loc = lead.location && typeof lead.location === 'object' ? lead.location : {};
    const addressPart = [loc.neighborhood, loc.borough, loc.zip].filter(Boolean).join(', ');
    const searchQuery = [businessName, addressPart, 'NYC'].filter(Boolean).join(' ');

    const [pageSpeedResult, dohmhResult, outscraperResult] = await Promise.allSettled([
      websiteUrl ? fetchPageSpeedScores(websiteUrl) : Promise.resolve(null),
      searchQuery.trim() ? fetchDOHMHViolations({ businessName, address: addressPart, borough: loc.borough, zip: loc.zip, limit: 20 }) : Promise.resolve([]),
      searchQuery.trim() ? fetchReviewSentiment({ query: searchQuery, limit: 10 }) : Promise.resolve({ data: [], reviews: [] }),
    ]);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:deep-audit:settled',message:'Deep-audit allSettled summary',data:{leadId:id,pageSpeedStatus:pageSpeedResult.status,dohmhStatus:dohmhResult.status,outscraperStatus:outscraperResult.status},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    const updates = { audit_status: 'completed' };
    const toJsonb = (v) => { try { return v != null ? JSON.parse(JSON.stringify(v)) : undefined; } catch (_) { return undefined; } };
    const t = pageSpeedResult.status === 'fulfilled' && pageSpeedResult.value != null ? toJsonb(pageSpeedResult.value) : undefined;
    if (t !== undefined) updates.technical_audit = t;
    const c = dohmhResult.status === 'fulfilled' && Array.isArray(dohmhResult.value) ? toJsonb(dohmhResult.value) : undefined;
    if (c !== undefined) updates.civic_audit = c;
    const s = outscraperResult.status === 'fulfilled' && outscraperResult.value != null ? toJsonb(outscraperResult.value) : undefined;
    if (s !== undefined) updates.sentiment_audit = s;

    const { data: updated, error: updateError } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:deep-audit:updateError',message:'Deep-audit DB update failed',data:{leadId:id,message:updateError.message,details:updateError.details,hint:updateError.hint,code:updateError.code},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
      // #endregion
      console.error('Deep audit update error:', updateError);
      return sendJson(500, { error: 'Failed to save audit', message: updateError?.message ?? 'Unknown database error' });
    }
    return sendJson(200, updated ?? { ok: true });
  } catch (err) {
    console.error('Deep audit error:', err);
    const msg = (err && (err.message || err.reason)) ? String(err.message || err.reason) : String(err);
    return sendJson(500, { error: 'Deep audit failed', message: msg });
  }
});

// Update lead status
app.patch('/api/leads/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const mockDataPath = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const rawData = await readFile(mockDataPath, 'utf-8');
    const data = JSON.parse(rawData);
    
    const leadIndex = data.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Update lead status
    data.leads[leadIndex].status = status;
    
    // Add claimed_at timestamp if status is 'matched'
    if (status === 'matched') {
      data.leads[leadIndex].claimed_at = new Date().toISOString();
    }
    
    // Write updated data back to file
    await writeFile(mockDataPath, JSON.stringify(data, null, 2), 'utf-8');
    
    // Return updated lead with recency weights applied
    const updatedLead = applyRecencyWeights(data.leads[leadIndex]);
    res.json(updatedLead);
    
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({ 
      error: 'Failed to update lead status',
      message: error.message 
    });
  }
});

// Helper function to generate Staff Pitch Hook
function generateStaffPitchHook(lead) {
  const recent = lead.recency_data["0_30_days"] || 0;
  const supporting = lead.recency_data["31_90_days"] || 0;
  const primaryCluster = lead.friction_clusters[0];
  const topQuote = primaryCluster?.sample_quotes[0] || '';
  
  return `**Staff Pitch Hook**

${lead.business_name} is experiencing a ${recent}% spike in ${lead.friction_type.toLowerCase()} complaints in the last 30 days, with ${supporting} supporting issues from the previous 60 days. This represents a clear technical friction point that our alumni network can address.

**Key Customer Voice:**
"${topQuote}"

**Impact:** ${lead.time_on_task_estimate}`;
}

// Helper function to generate Efficiency Table
function generateEfficiencyTable(lead) {
  const primaryCluster = lead.friction_clusters[0];
  const category = primaryCluster?.category || 'intake';
  
  // Map categories to efficiency metrics
  const efficiencyMap = {
    intake: {
      manual: '15-20 min per order',
      digital: '2-3 min per order',
      benchmark: 'Industry Benchmarks: 80-90% time reduction'
    },
    booking: {
      manual: '5-8 min per reservation',
      digital: '30-60 sec per reservation',
      benchmark: 'Industry Benchmarks: 85-90% time reduction'
    },
    logistics: {
      manual: '10-15 min per order coordination',
      digital: '2-4 min per order coordination',
      benchmark: 'Industry Benchmarks: 75-85% time reduction'
    }
  };
  
  const metrics = efficiencyMap[category] || efficiencyMap.intake;
  
  return `**Efficiency Table (Time-on-Task Metrics)**

| Process Type | Time-on-Task | Industry Benchmarks |
|--------------|--------------|---------------------|
| Manual Process | ${metrics.manual} | ${metrics.benchmark} |
| Digital Solution | ${metrics.digital} | ${metrics.benchmark} |
| Efficiency Gain | 75-90% reduction | Standard for ${category} automation |`;
}

// Generate Markdown brief
function generateMarkdownBrief(lead) {
  const processedLead = applyRecencyWeights(lead);
  const pitchHook = generateStaffPitchHook(processedLead);
  const efficiencyTable = generateEfficiencyTable(processedLead);
  
  // Collect all customer quotes
  const allQuotes = processedLead.friction_clusters.flatMap(cluster => 
    cluster.sample_quotes.map(quote => `- "${quote}"`)
  );
  
  // Format friction details
  const frictionDetails = processedLead.friction_clusters.map(cluster => 
    `**${cluster.category.toUpperCase()}** (${cluster.recent_count} recent, ${cluster.count} total)`
  ).join('\n');
  
  return `# Handoff Brief: ${processedLead.business_name}

## HFI Score: ${processedLead.hfi_score}/100

**Friction Type:** ${processedLead.friction_type}
**Status:** ${processedLead.status}
**Discovered:** ${processedLead.discovered_at ? new Date(processedLead.discovered_at).toLocaleDateString() : '—'}

---

${pitchHook}

---

${efficiencyTable}

---

## Friction Details

${frictionDetails}

## Customer Quotes

${allQuotes.join('\n')}

---

*Generated by Bridge.it Handoff Engine v4.2*
*Date: ${new Date().toISOString()}*`;
}

// Generate PDF report
function generatePDFReport(lead) {
  const processedLead = applyRecencyWeights(lead);
  const doc = new jsPDF.jsPDF();
  
  // Industrial Professional colors
  const slate = '#1e293b';
  const navy = '#0f172a';
  const white = '#ffffff';
  
  let yPos = 20;
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - (margin * 2);
  
  // Set font (Inter-like, using Helvetica as fallback)
  doc.setFont('helvetica');
  
  // Header
  doc.setFillColor(30, 41, 59); // Slate
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Bridge.it Handoff Report', margin, 25);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toISOString().split('T')[0]}`, margin, 35);
  
  // Reset text color
  doc.setTextColor(15, 23, 42); // Navy
  
  yPos = 50;
  
  // Business Name
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(processedLead.business_name, margin, yPos);
  yPos += 10;
  
  // HFI Score Badge
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(margin, yPos - 5, 60, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(`HFI Score: ${processedLead.hfi_score}/100`, margin + 5, yPos);
  doc.setTextColor(15, 23, 42);
  yPos += 15;
  
  // Friction Type
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Friction Type: ${processedLead.friction_type}`, margin, yPos);
  yPos += 8;
  doc.text(`Status: ${processedLead.status}`, margin, yPos);
  yPos += 15;
  
  // Staff Pitch Hook Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Staff Pitch Hook', margin, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const recent = processedLead.recency_data["0_30_days"] || 0;
  const supporting = processedLead.recency_data["31_90_days"] || 0;
  const pitchText = `${processedLead.business_name} is experiencing a ${recent}% spike in ${processedLead.friction_type.toLowerCase()} complaints in the last 30 days, with ${supporting} supporting issues from the previous 60 days.`;
  const pitchLines = doc.splitTextToSize(pitchText, contentWidth);
  doc.text(pitchLines, margin, yPos);
  yPos += pitchLines.length * 5 + 5;
  
  // Key Customer Voice
  doc.setFont('helvetica', 'bold');
  doc.text('Key Customer Voice:', margin, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'italic');
  const primaryCluster = processedLead.friction_clusters[0];
  const topQuote = primaryCluster?.sample_quotes[0] || '';
  const quoteLines = doc.splitTextToSize(`"${topQuote}"`, contentWidth);
  doc.text(quoteLines, margin, yPos);
  yPos += quoteLines.length * 5 + 8;
  
  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }
  
  // Efficiency Table Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Efficiency Table (Time-on-Task Metrics)', margin, yPos);
  yPos += 10;
  
  // Table header
  doc.setFillColor(241, 245, 249); // Light gray background
  doc.rect(margin, yPos - 5, contentWidth, 8, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Process Type', margin + 2, yPos);
  doc.text('Time-on-Task', margin + 60, yPos);
  doc.text('Industry Benchmarks', margin + 120, yPos);
  yPos += 8;
  
  // Table rows
  doc.setFont('helvetica', 'normal');
  const category = primaryCluster?.category || 'intake';
  const efficiencyMap = {
    intake: {
      manual: '15-20 min per order',
      digital: '2-3 min per order',
      benchmark: '80-90% time reduction'
    },
    booking: {
      manual: '5-8 min per reservation',
      digital: '30-60 sec per reservation',
      benchmark: '85-90% time reduction'
    },
    logistics: {
      manual: '10-15 min per order',
      digital: '2-4 min per order',
      benchmark: '75-85% time reduction'
    }
  };
  const metrics = efficiencyMap[category] || efficiencyMap.intake;
  
  // Manual Process row
  doc.rect(margin, yPos - 5, contentWidth, 7, 'S');
  doc.text('Manual Process', margin + 2, yPos);
  doc.text(metrics.manual, margin + 60, yPos);
  doc.text(metrics.benchmark, margin + 120, yPos);
  yPos += 7;
  
  // Digital Solution row
  doc.rect(margin, yPos - 5, contentWidth, 7, 'S');
  doc.text('Digital Solution', margin + 2, yPos);
  doc.text(metrics.digital, margin + 60, yPos);
  doc.text(metrics.benchmark, margin + 120, yPos);
  yPos += 7;
  
  // Efficiency Gain row
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, yPos - 5, contentWidth, 7, 'F');
  doc.rect(margin, yPos - 5, contentWidth, 7, 'S');
  doc.setFont('helvetica', 'bold');
  doc.text('Efficiency Gain', margin + 2, yPos);
  doc.text('75-90% reduction', margin + 60, yPos);
  doc.text(`Standard for ${category}`, margin + 120, yPos);
  yPos += 15;
  
  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }
  
  // Friction Details Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Friction Details', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  processedLead.friction_clusters.forEach(cluster => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${cluster.category.toUpperCase()}:`, margin, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`${cluster.recent_count} recent issues, ${cluster.count} total`, margin + 5, yPos);
    yPos += 8;
  });
  
  yPos += 5;
  
  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }
  
  // Customer Quotes Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Customer Quotes', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  const allQuotes = processedLead.friction_clusters.flatMap(cluster => cluster.sample_quotes);
  allQuotes.slice(0, 5).forEach(quote => {
    const quoteLines = doc.splitTextToSize(`"${quote}"`, contentWidth);
    doc.text(quoteLines, margin + 5, yPos);
    yPos += quoteLines.length * 4 + 5;
    
    if (yPos > 270) {
      doc.addPage();
      yPos = 20;
    }
  });
  
  return doc;
}

// Helper function to load lead by ID
async function loadLeadById(leadId) {
  const mockDataPath = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
  const rawData = await readFile(mockDataPath, 'utf-8');
  const data = JSON.parse(rawData);
  return data.leads.find(l => l.id === leadId);
}

// Generate Handoff Route - Returns JSON with both files
app.post('/generate-handoff', async (req, res) => {
  try {
    const { leadId } = req.body;
    
    if (!leadId) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }
    
    const lead = await loadLeadById(leadId);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Generate markdown brief
    const markdownBrief = generateMarkdownBrief(lead);
    
    // Generate PDF report
    const pdfDoc = generatePDFReport(lead);
    const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));
    
    const filename = `${lead.business_name.replace(/\s+/g, '_')}_handoff_${new Date().toISOString().split('T')[0]}`;
    
    // Set response headers for both files
    res.setHeader('Content-Type', 'application/json');
    res.json({
      markdown: markdownBrief,
      pdf: pdfBuffer.toString('base64'),
      filename: filename
    });
    
  } catch (error) {
    console.error('Error generating handoff:', error);
    res.status(500).json({ 
      error: 'Failed to generate handoff',
      message: error.message 
    });
  }
});

// Download Markdown Brief
app.get('/generate-handoff/:leadId/markdown', async (req, res) => {
  try {
    const { leadId } = req.params;
    const lead = await loadLeadById(leadId);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const markdownBrief = generateMarkdownBrief(lead);
    const filename = `${lead.business_name.replace(/\s+/g, '_')}_handoff_${new Date().toISOString().split('T')[0]}.md`;
    
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(markdownBrief);
    
  } catch (error) {
    console.error('Error generating markdown:', error);
    res.status(500).json({ 
      error: 'Failed to generate markdown',
      message: error.message 
    });
  }
});

// Download PDF Report
app.get('/generate-handoff/:leadId/pdf', async (req, res) => {
  try {
    const { leadId } = req.params;
    const lead = await loadLeadById(leadId);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const pdfDoc = generatePDFReport(lead);
    const filename = `${lead.business_name.replace(/\s+/g, '_')}_handoff_${new Date().toISOString().split('T')[0]}.pdf`;
    
    const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      message: error.message 
    });
  }
});

// Helper function to load and save data
async function loadData() {
  const mockDataPath = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
  const rawData = await readFile(mockDataPath, 'utf-8');
  return JSON.parse(rawData);
}

async function saveData(data) {
  const mockDataPath = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
  await writeFile(mockDataPath, JSON.stringify(data, null, 2), 'utf-8');
}

async function loadBuilds() {
  try {
    const path = join(__dirname, '..', '_architect_ref', 'builds.json');
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

async function saveBuilds(builds) {
  const path = join(__dirname, '..', '_architect_ref', 'builds.json');
  await writeFile(path, JSON.stringify(builds, null, 2), 'utf-8');
}

async function loadBuildVotes() {
  try {
    const path = join(__dirname, '..', '_architect_ref', 'build_votes.json');
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

async function saveBuildVotes(votes) {
  const path = join(__dirname, '..', '_architect_ref', 'build_votes.json');
  await writeFile(path, JSON.stringify(votes, null, 2), 'utf-8');
}

// POST /api/leads/:id/launch-sprint - Scout launches a sprint
app.post('/api/leads/:id/launch-sprint', async (req, res) => {
  try {
    const { id } = req.params;
    const { maxSlots, duration } = req.body;
    
    if (!maxSlots || !duration) {
      return res.status(400).json({ error: 'maxSlots and duration are required' });
    }
    
    if (maxSlots < 1 || maxSlots > 4) {
      return res.status(400).json({ error: 'maxSlots must be between 1 and 4' });
    }
    
    if (duration < 2 || duration > 4) {
      return res.status(400).json({ error: 'duration must be between 2 and 4 weeks' });
    }
    
    const data = await loadData();
    const leadIndex = data.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = data.leads[leadIndex];
    
    // Check if sprint is already active
    if (lead.sprintActive) {
      return res.status(400).json({ error: 'Sprint is already active for this lead' });
    }
    
    // Initialize activeBuilders if it doesn't exist
    if (!lead.activeBuilders) {
      lead.activeBuilders = [];
    }
    
    // Set sprint configuration
    lead.sprintActive = true;
    lead.maxSlots = maxSlots;
    lead.sprintDuration = duration;
    lead.sprintStartedAt = new Date().toISOString();
    
    await saveData(data);
    
    const weightedLead = applyRecencyWeights(lead);
    const populatedLead = await populateActiveBuilders(weightedLead);
    res.json(populatedLead);
    
  } catch (error) {
    console.error('Error launching sprint:', error);
    res.status(500).json({ 
      error: 'Failed to launch sprint',
      message: error.message 
    });
  }
});

// POST /api/leads/:id/join-sprint - Alumni joins a sprint
app.post('/api/leads/:id/join-sprint', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, selectedDeliverables } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Validate selectedDeliverables if provided
    if (selectedDeliverables && !Array.isArray(selectedDeliverables)) {
      return res.status(400).json({ error: 'selectedDeliverables must be an array' });
    }
    
    // Validate alumni ID exists in registry
    const alumni = await loadAlumniData();
    const alumniData = alumni.find(a => a.id === userId);
    
    if (!alumniData) {
      return res.status(404).json({ error: 'Alumni ID not found in registry' });
    }
    
    // Check if alumni is available (currentBuildCount < 3)
    if (alumniData.currentBuildCount >= 3) {
      return res.status(400).json({ error: 'Alumni has reached maximum concurrent builds (3)' });
    }
    
    const data = await loadData();
    const leadIndex = data.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = data.leads[leadIndex];
    
    // Check if user is already active on another project
    const activeOnOtherProject = data.leads.some(lead => 
      lead.id !== id &&
      lead.activeBuilders &&
      lead.activeBuilders.some(b => b.userId === userId)
    );
    
    if (activeOnOtherProject) {
      const otherProject = data.leads.find(lead =>
        lead.id !== id &&
        lead.activeBuilders &&
        lead.activeBuilders.some(b => b.userId === userId)
      );
      
      return res.status(400).json({ 
        error: 'Already active on another project',
        message: `You are already building ${otherProject.business_name}. Complete or leave that project first.`
      });
    }
    
    // Initialize activeBuilders if it doesn't exist
    if (!lead.activeBuilders) {
      lead.activeBuilders = [];
    }
    
    // Check if maxSlots reached
    if (lead.activeBuilders.length >= (lead.maxSlots || 4)) {
      return res.status(400).json({ error: 'Maximum slots reached for this sprint' });
    }
    
    // Check if builder already joined
    if (lead.activeBuilders.some(b => b.userId === userId)) {
      return res.status(400).json({ error: 'Builder already joined this sprint' });
    }
    
    // Add builder to activeBuilders with selectedDeliverables
    const now = new Date().toISOString();
    const builderEntry = {
      userId,
      joinedAt: now,
      checkpointsCompleted: 0,
      proofLinks: [],
      last_nudged_at: null,
      last_checkpoint_update: now // Initialize to join time
    };
    
    // Store selectedDeliverables if provided
    if (selectedDeliverables && selectedDeliverables.length > 0) {
      builderEntry.selectedDeliverables = selectedDeliverables;
    } else {
      // If no deliverables selected, mark as "full_project"
      builderEntry.selectedDeliverables = ['full_project'];
    }
    
    lead.activeBuilders.push(builderEntry);
    
    await saveData(data);
    
    const weightedLead = applyRecencyWeights(lead);
    const populatedLead = await populateActiveBuilders(weightedLead);
    res.json(populatedLead);
    
  } catch (error) {
    console.error('Error joining sprint:', error);
    res.status(500).json({ 
      error: 'Failed to join sprint',
      message: error.message 
    });
  }
});

// PATCH /api/leads/:id/checkpoint - Submit checkpoint proof
app.patch('/api/leads/:id/checkpoint', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, milestoneId, proofLink } = req.body;
    
    if (!userId || milestoneId === undefined || !proofLink) {
      return res.status(400).json({ error: 'userId, milestoneId, and proofLink are required' });
    }
    
    const data = await loadData();
    const leadIndex = data.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = data.leads[leadIndex];
    
    if (!lead.activeBuilders) {
      return res.status(400).json({ error: 'No active builders for this lead' });
    }
    
    const builderIndex = lead.activeBuilders.findIndex(b => b.userId === userId);
    
    if (builderIndex === -1) {
      return res.status(404).json({ error: 'Builder not found in this sprint' });
    }
    
    const builder = lead.activeBuilders[builderIndex];
    
    // Initialize proofLinks if it doesn't exist
    if (!builder.proofLinks) {
      builder.proofLinks = [];
    }
    
    // Update checkpoint completion
    builder.checkpointsCompleted = Math.max(builder.checkpointsCompleted, milestoneId);
    
    // Update last_checkpoint_update timestamp
    builder.last_checkpoint_update = new Date().toISOString();
    
    // Add proof link if not already present
    if (!builder.proofLinks.includes(proofLink)) {
      builder.proofLinks.push(proofLink);
    }
    
    // Check if all 4 checkpoints are completed
    const allCheckpointsDone = builder.checkpointsCompleted >= 4;
    
    // If all checkpoints done AND firstCompletionAt is null, set firstCompletionAt
    if (allCheckpointsDone && !lead.firstCompletionAt) {
      lead.firstCompletionAt = new Date().toISOString();
    }
    
    // If firstCompletionAt exists, check if within 48hr window
    if (lead.firstCompletionAt) {
      const firstCompletionTime = new Date(lead.firstCompletionAt).getTime();
      const now = new Date().getTime();
      const hoursSinceFirstCompletion = (now - firstCompletionTime) / (1000 * 60 * 60);
      
      lead.submissionWindowOpen = hoursSinceFirstCompletion <= 48;
    } else {
      lead.submissionWindowOpen = false;
    }
    
    await saveData(data);
    
    const weightedLead = applyRecencyWeights(lead);
    const populatedLead = await populateActiveBuilders(weightedLead);
    res.json(populatedLead);
    
  } catch (error) {
    console.error('Error submitting checkpoint:', error);
    res.status(500).json({ 
      error: 'Failed to submit checkpoint',
      message: error.message 
    });
  }
});

// PATCH /api/leads/:id/submit-checkpoint - Submit checkpoint proof with status tracking
app.patch('/api/leads/:id/submit-checkpoint', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, milestoneId, proofLink } = req.body;
    
    if (!userId || milestoneId === undefined || !proofLink) {
      return res.status(400).json({ error: 'userId, milestoneId, and proofLink are required' });
    }
    
    const data = await loadData();
    const leadIndex = data.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = data.leads[leadIndex];
    
    if (!lead.activeBuilders) {
      return res.status(400).json({ error: 'No active builders for this lead' });
    }
    
    const builderIndex = lead.activeBuilders.findIndex(b => b.userId === userId);
    
    if (builderIndex === -1) {
      return res.status(404).json({ error: 'Builder not found in this sprint' });
    }
    
    const builder = lead.activeBuilders[builderIndex];
    
    // Initialize checkpointStatuses if it doesn't exist
    if (!builder.checkpointStatuses) {
      builder.checkpointStatuses = {};
    }
    
    // Update checkpoint status to 'submitted' (awaiting Scout review)
    builder.checkpointStatuses[milestoneId] = {
      status: 'submitted',
      proofLink: proofLink,
      submittedAt: new Date().toISOString()
    };
    
    // Count verified checkpoints
    const verifiedCount = Object.values(builder.checkpointStatuses).filter(
      cp => cp.status === 'verified'
    ).length;
    
    builder.checkpointsCompleted = verifiedCount;
    
    // Update last_checkpoint_update timestamp
    builder.last_checkpoint_update = new Date().toISOString();
    
    // Initialize proofLinks array if needed and add proof
    if (!builder.proofLinks) {
      builder.proofLinks = [];
    }
    if (!builder.proofLinks.includes(proofLink)) {
      builder.proofLinks.push(proofLink);
    }
    
    await saveData(data);
    
    const weightedLead = applyRecencyWeights(lead);
    const populatedLead = await populateActiveBuilders(weightedLead);
    res.json(populatedLead);
    
  } catch (error) {
    console.error('Error submitting checkpoint:', error);
    res.status(500).json({ 
      error: 'Failed to submit checkpoint',
      message: error.message 
    });
  }
});

// POST /api/leads/:id/scout-review - Scout assigns quality scores to builders
app.post('/api/leads/:id/scout-review', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, qualityScore, scoutReviewScore, reviewNotes } = req.body;
    
    if (!userId || qualityScore === undefined) {
      return res.status(400).json({ error: 'userId and qualityScore (0-100) are required' });
    }
    
    if (qualityScore < 0 || qualityScore > 100) {
      return res.status(400).json({ error: 'qualityScore must be between 0 and 100' });
    }
    
    if (scoutReviewScore !== undefined && (scoutReviewScore < 0 || scoutReviewScore > 100)) {
      return res.status(400).json({ error: 'scoutReviewScore must be between 0 and 100' });
    }
    
    const data = await loadData();
    const leadIndex = data.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = data.leads[leadIndex];
    
    if (!lead.activeBuilders || lead.activeBuilders.length === 0) {
      return res.status(400).json({ error: 'No active builders for this lead' });
    }
    
    const builderIndex = lead.activeBuilders.findIndex(b => b.userId === userId);
    
    if (builderIndex === -1) {
      return res.status(404).json({ error: 'Builder not found in this sprint' });
    }
    
    // Store scout review data
    if (!lead.activeBuilders[builderIndex].scoutReview) {
      lead.activeBuilders[builderIndex].scoutReview = {};
    }
    
    lead.activeBuilders[builderIndex].scoutReview.qualityScore = qualityScore;
    if (scoutReviewScore !== undefined) {
      lead.activeBuilders[builderIndex].scoutReview.scoutReviewScore = scoutReviewScore;
    } else {
      // Default to qualityScore if not provided
      lead.activeBuilders[builderIndex].scoutReview.scoutReviewScore = qualityScore;
    }
    lead.activeBuilders[builderIndex].scoutReview.reviewNotes = reviewNotes || '';
    lead.activeBuilders[builderIndex].scoutReview.reviewedAt = new Date().toISOString();
    
    await saveData(data);
    
    // Check if submission window is closed and trigger winner calculation
    if (lead.firstCompletionAt) {
      const firstCompletionTime = new Date(lead.firstCompletionAt).getTime();
      const now = new Date().getTime();
      const hoursSinceFirstCompletion = (now - firstCompletionTime) / (1000 * 60 * 60);
      
      // If 48 hours passed and window is closed, calculate winner
      if (hoursSinceFirstCompletion > 48 && !lead.submissionWindowOpen && !lead.winnerUserId) {
        // Check if all builders have scout reviews
        const finalists = lead.activeBuilders.filter(b => b.checkpointsCompleted >= 4);
        const allReviewed = finalists.every(b => b.scoutReview && b.scoutReview.qualityScore !== undefined);
        
        if (allReviewed && finalists.length > 0) {
          // Calculate winner
          const scoredBuilders = finalists.map(builder => {
            // Calculate pace score
            const joinedTime = new Date(builder.joinedAt).getTime();
            const completionTime = joinedTime + (builder.checkpointsCompleted * 24 * 60 * 60 * 1000);
            const timeDifference = completionTime - firstCompletionTime;
            const hoursDifference = timeDifference / (1000 * 60 * 60);
            const paceScore = Math.max(4, 100 - (Math.abs(hoursDifference) * 2));
            
            // Use scout review quality score
            const qualityScoreValue = builder.scoutReview?.qualityScore || 0;
            
            // Scout review score (separate from quality score)
            const scoutReviewScore = builder.scoutReview?.scoutReviewScore ?? builder.scoutReview?.qualityScore ?? 0;
            
            // Total score: (Pace × 0.3) + (Quality × 0.5) + (Scout_Review × 0.2)
            const totalScore = (paceScore * 0.3) + (qualityScoreValue * 0.5) + (scoutReviewScore * 0.2);
            
            return {
              ...builder,
              scores: {
                pace: Math.round(paceScore * 100) / 100,
                quality: Math.round(qualityScoreValue * 100) / 100,
                scoutReview: Math.round(scoutReviewScore * 100) / 100,
                total: Math.round(totalScore * 100) / 100
              }
            };
          });
          
          const winner = scoredBuilders.reduce((prev, current) => 
            (current.scores.total > prev.scores.total) ? current : prev
          );
          
          lead.winnerUserId = winner.userId;
          lead.status = 'awarded';
          await saveData(data);
          
          const weightedLead = applyRecencyWeights(lead);
          const populatedLead = await populateActiveBuilders(weightedLead);
          return res.json({
            message: 'Scout review submitted and winner calculated',
            winner: {
              userId: winner.userId,
              name: winner.name,
              scores: winner.scores
            },
            lead: populatedLead
          });
        }
      }
    }
    
    const weightedLead = applyRecencyWeights(lead);
    const populatedLead = await populateActiveBuilders(weightedLead);
    res.json({
      message: 'Scout review submitted',
      lead: populatedLead
    });
    
  } catch (error) {
    console.error('Error submitting scout review:', error);
    res.status(500).json({ 
      error: 'Failed to submit scout review',
      message: error.message 
    });
  }
});

// POST /api/leads/:id/calculate-winner - Calculate winner (only if window closed)
app.post('/api/leads/:id/calculate-winner', async (req, res) => {
  try {
    const { id } = req.params;
    
    const data = await loadData();
    const leadIndex = data.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = data.leads[leadIndex];
    
    // Check if submission window is closed
    if (lead.submissionWindowOpen) {
      return res.status(400).json({ error: 'Submission window is still open. Cannot calculate winner yet.' });
    }
    
    // Check if 48 hours passed since firstCompletionAt
    if (!lead.firstCompletionAt) {
      return res.status(400).json({ error: 'No first completion time set' });
    }
    
    const firstCompletionTime = new Date(lead.firstCompletionAt).getTime();
    const now = new Date().getTime();
    const hoursSinceFirstCompletion = (now - firstCompletionTime) / (1000 * 60 * 60);
    
    if (hoursSinceFirstCompletion <= 48) {
      return res.status(400).json({ error: '48 hours have not passed since first completion. Submission window is still open.' });
    }
    
    if (!lead.activeBuilders || lead.activeBuilders.length === 0) {
      return res.status(400).json({ error: 'No active builders for this lead' });
    }
    
    // Get finalist pool (builders who completed all 4 checkpoints)
    const finalists = lead.activeBuilders.filter(b => b.checkpointsCompleted >= 4);
    
    if (finalists.length === 0) {
      return res.status(400).json({ error: 'No builders have completed all checkpoints' });
    }
    
    // Check if all finalists have scout reviews
    const allReviewed = finalists.every(b => b.scoutReview && b.scoutReview.qualityScore !== undefined);
    
    if (!allReviewed) {
      return res.status(400).json({ error: 'Not all builders have been reviewed by Scout. Please complete reviews first.' });
    }
    
    // Calculate scores for each finalist
    const scoredBuilders = finalists.map(builder => {
      // Calculate pace score
      const joinedTime = new Date(builder.joinedAt).getTime();
      const completionTime = joinedTime + (builder.checkpointsCompleted * 24 * 60 * 60 * 1000);
      const timeDifference = completionTime - firstCompletionTime;
      const hoursDifference = timeDifference / (1000 * 60 * 60);
      
      // Pace score: 100 if completed at same time, decreases by 2 points per hour after first
      const paceScore = Math.max(4, 100 - (Math.abs(hoursDifference) * 2));
      
      // Quality score from scout review
      const qualityScore = builder.scoutReview?.qualityScore || 0;
      
      // Scout review score (separate from quality score)
      const scoutReviewScore = builder.scoutReview?.scoutReviewScore ?? builder.scoutReview?.qualityScore ?? 0;
      
      // Total score: (Pace × 0.3) + (Quality × 0.5) + (Scout_Review × 0.2)
      const totalScore = (paceScore * 0.3) + (qualityScore * 0.5) + (scoutReviewScore * 0.2);
      
      return {
        ...builder,
        scores: {
          pace: Math.round(paceScore * 100) / 100,
          quality: Math.round(qualityScore * 100) / 100,
          scoutReview: Math.round(scoutReviewScore * 100) / 100,
          total: Math.round(totalScore * 100) / 100
        }
      };
    });
    
    // Find winner (highest total score)
    const winner = scoredBuilders.reduce((prev, current) => 
      (current.scores.total > prev.scores.total) ? current : prev
    );
    
    // Set winnerUserId and update status to 'awarded'
    lead.winnerUserId = winner.userId;
    lead.status = 'awarded';
    
    await saveData(data);
    
    const weightedLead = applyRecencyWeights(lead);
    const populatedLead = await populateActiveBuilders(weightedLead);
    
    res.json({
      winner: {
        userId: winner.userId,
        name: winner.name,
        scores: winner.scores
      },
      allScores: scoredBuilders.map(b => ({
        userId: b.userId,
        name: b.name,
        scores: b.scores
      })),
      lead: populatedLead
    });
    
  } catch (error) {
    console.error('Error calculating winner:', error);
    res.status(500).json({ 
      error: 'Failed to calculate winner',
      message: error.message 
    });
  }
});

// GET /api/leaderboard - Get platform-wide builder rankings
app.get('/api/leaderboard', async (req, res) => {
  try {
    const data = await loadData();
    const alumni = await loadAlumniData();
    
    // Create alumni lookup map
    const alumniMap = {};
    alumni.forEach(a => {
      alumniMap[a.id] = a;
    });
    
    // Collect all builders across all leads
    const builderStats = {};
    
    data.leads.forEach(lead => {
      if (lead.activeBuilders && lead.activeBuilders.length > 0) {
        lead.activeBuilders.forEach(builder => {
          if (!builderStats[builder.userId]) {
            const alumniData = alumniMap[builder.userId];
            builderStats[builder.userId] = {
              userId: builder.userId,
              name: alumniData?.name || builder.userId,
              specialty: alumniData?.specialty,
              qualityRating: alumniData?.qualityRating,
              totalSprints: 0,
              totalCheckpoints: 0,
              completedSprints: 0,
              wins: 0,
              joinedAt: builder.joinedAt
            };
          }
          
          builderStats[builder.userId].totalSprints++;
          builderStats[builder.userId].totalCheckpoints += builder.checkpointsCompleted || 0;
          
          if (builder.checkpointsCompleted >= 4) {
            builderStats[builder.userId].completedSprints++;
          }
          
          if (lead.winnerUserId === builder.userId) {
            builderStats[builder.userId].wins++;
          }
        });
      }
    });
    
    // Convert to array and sort by wins (descending), then by completed sprints
    const leaderboard = Object.values(builderStats).sort((a, b) => {
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      return b.completedSprints - a.completedSprints;
    });
    
    res.json({
      leaderboard,
      totalBuilders: leaderboard.length,
      updatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    res.status(500).json({ 
      error: 'Failed to load leaderboard',
      message: error.message 
    });
  }
});

// Submit checkpoint proof
app.post('/api/leads/:id/checkpoint', async (req, res) => {
  try {
    const { id } = req.params;
    const { checkpointId, proofLink, userId } = req.body;
    
    if (!checkpointId || !proofLink || !userId) {
      return res.status(400).json({ error: 'checkpointId, proofLink, and userId are required' });
    }
    
    // Validate URL format (GitHub or Loom)
    const urlPattern = /^https?:\/\/(github\.com|loom\.com|www\.github\.com|www\.loom\.com)/i;
    if (!urlPattern.test(proofLink)) {
      return res.status(400).json({ error: 'Proof link must be a GitHub or Loom URL' });
    }
    
    const mockDataPath = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const rawData = await readFile(mockDataPath, 'utf-8');
    const data = JSON.parse(rawData);
    
    const leadIndex = data.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = data.leads[leadIndex];
    
    // Find or create builder entry
    let builder = lead.activeBuilders?.find(b => b.userId === userId);
    
    if (!builder) {
      // Create new builder entry
      if (!lead.activeBuilders) {
        lead.activeBuilders = [];
      }
      builder = {
        userId: userId,
        name: userId, // Will be updated when we have user names
        joinedAt: new Date().toISOString(),
        checkpointsCompleted: 0,
        proofLinks: [],
        checkpointStatuses: {}
      };
      lead.activeBuilders.push(builder);
    }
    
    // Initialize checkpointStatuses if needed
    if (!builder.checkpointStatuses) {
      builder.checkpointStatuses = {};
    }
    
    // Update checkpoint status to "submitted"
    builder.checkpointStatuses[checkpointId] = {
      status: 'submitted',
      proofLink: proofLink,
      submittedAt: new Date().toISOString()
    };
    
    // Update last_checkpoint_update timestamp
    builder.last_checkpoint_update = new Date().toISOString();
    
    // Add proof link to array if not already present
    if (!builder.proofLinks.includes(proofLink)) {
      builder.proofLinks.push(proofLink);
    }
    
    // Write updated data back to file
    await writeFile(mockDataPath, JSON.stringify(data, null, 2), 'utf-8');
    
    // Return updated lead with recency weights applied and builder details populated
    const weightedLead = applyRecencyWeights(data.leads[leadIndex]);
    const populatedLead = await populateActiveBuilders(weightedLead);
    res.json(populatedLead);
    
  } catch (error) {
    console.error('Error submitting checkpoint:', error);
    res.status(500).json({ 
      error: 'Failed to submit checkpoint',
      message: error.message 
    });
  }
});

// GET /api/proofs/pending - Fetch all pending proof submissions
app.get('/api/proofs/pending', async (req, res) => {
  try {
    const data = await loadData();
    const pendingProofs = [];
    
    // Iterate through all leads
    data.leads.forEach(lead => {
      if (!lead.activeBuilders || lead.activeBuilders.length === 0) return;
      
      // Get milestone names from lead
      const milestoneMap = {};
      if (lead.milestones && Array.isArray(lead.milestones)) {
        lead.milestones.forEach(m => {
          milestoneMap[m.id] = m.name;
        });
      } else {
        // Default milestones if not defined
        milestoneMap[1] = 'Architecture';
        milestoneMap[2] = 'Core Logic';
        milestoneMap[3] = 'API Integration';
        milestoneMap[4] = 'Demo Ready';
      }
      
      // Check each builder's checkpoint statuses
      lead.activeBuilders.forEach(builder => {
        if (!builder.checkpointStatuses) return;
        
        Object.keys(builder.checkpointStatuses).forEach(milestoneId => {
          const checkpoint = builder.checkpointStatuses[milestoneId];
          
          // Only include submitted (pending) proofs
          if (checkpoint.status === 'submitted') {
            pendingProofs.push({
              id: `${lead.id}-${builder.userId}-${milestoneId}`,
              leadId: lead.id,
              businessName: lead.business_name,
              neighborhood: lead.location?.neighborhood || 'Unknown',
              builderId: builder.userId,
              builderName: builder.name || builder.userId,
              milestoneId: parseInt(milestoneId),
              milestoneName: milestoneMap[milestoneId] || `Milestone ${milestoneId}`,
              proofLink: checkpoint.proofLink || '',
              submittedAt: checkpoint.submittedAt || new Date().toISOString(),
              status: 'submitted'
            });
          }
        });
      });
    });
    
    res.json({
      proofs: pendingProofs,
      count: pendingProofs.length
    });
  } catch (error) {
    console.error('Error fetching pending proofs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch pending proofs',
      message: error.message 
    });
  }
});

// PATCH /api/leads/:id/verify-checkpoint - Verify a checkpoint proof
app.patch('/api/leads/:id/verify-checkpoint', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, milestoneId, approved, notes } = req.body;
    
    if (!userId || milestoneId === undefined || approved === undefined) {
      return res.status(400).json({ error: 'userId, milestoneId, and approved are required' });
    }
    
    const data = await loadData();
    const leadIndex = data.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = data.leads[leadIndex];
    
    if (!lead.activeBuilders) {
      return res.status(400).json({ error: 'No active builders for this lead' });
    }
    
    const builderIndex = lead.activeBuilders.findIndex(b => b.userId === userId);
    
    if (builderIndex === -1) {
      return res.status(404).json({ error: 'Builder not found in this sprint' });
    }
    
    const builder = lead.activeBuilders[builderIndex];
    
    // Initialize checkpointStatuses if needed
    if (!builder.checkpointStatuses) {
      builder.checkpointStatuses = {};
    }
    
    const milestoneKey = milestoneId.toString();
    
    if (!builder.checkpointStatuses[milestoneKey]) {
      return res.status(404).json({ error: 'Checkpoint not found' });
    }
    
    // Update checkpoint status
    builder.checkpointStatuses[milestoneKey].status = approved ? 'approved' : 'rejected';
    builder.checkpointStatuses[milestoneKey].verifiedAt = new Date().toISOString();
    if (notes) {
      builder.checkpointStatuses[milestoneKey].notes = notes;
    }
    
    // If approved, update checkpointsCompleted if needed
    if (approved && builder.checkpointsCompleted < milestoneId) {
      builder.checkpointsCompleted = milestoneId;
      // Update last_checkpoint_update timestamp when checkpoint is approved
      builder.last_checkpoint_update = new Date().toISOString();
    }
    
    // If rejected, builder needs to resubmit (status already set to rejected)
    
    await saveData(data);
    
    const weightedLead = applyRecencyWeights(lead);
    const populatedLead = await populateActiveBuilders(weightedLead);
    res.json({
      message: approved ? 'Checkpoint approved' : 'Checkpoint rejected',
      lead: populatedLead
    });
    
  } catch (error) {
    console.error('Error verifying checkpoint:', error);
    res.status(500).json({ 
      error: 'Failed to verify checkpoint',
      message: error.message 
    });
  }
});

// GET /api/alumni - Get list of available alumni
app.get('/api/alumni', async (req, res) => {
  try {
    const { available } = req.query;
    let alumni = await loadAlumniData();
    
    // Filter by availability if requested (currentBuildCount < 3)
    if (available === 'true') {
      alumni = alumni.filter(a => a.currentBuildCount < 3);
    }
    
    res.json({
      alumni,
      total: alumni.length,
      available: alumni.filter(a => a.currentBuildCount < 3).length
    });
  } catch (error) {
    console.error('Error loading alumni:', error);
    res.status(500).json({ 
      error: 'Failed to load alumni data',
      message: error.message 
    });
  }
});

// Stall Detection Function
function detectStalledBuilders(leads) {
  const stalledBuilders = [];
  const now = new Date();
  const STALL_THRESHOLD_MS = 72 * 60 * 60 * 1000; // 72 hours
  
  for (const lead of leads) {
    if (!lead.activeBuilders || lead.activeBuilders.length === 0) continue;
    
    for (const builder of lead.activeBuilders) {
      // Skip if already nudged recently
      if (builder.last_nudged_at) {
        const lastNudge = new Date(builder.last_nudged_at);
        const timeSinceNudge = now - lastNudge;
        if (timeSinceNudge < STALL_THRESHOLD_MS) continue;
      }
      
      // Check if stalled
      if (!builder.last_checkpoint_update) continue;
      
      const lastUpdate = new Date(builder.last_checkpoint_update);
      const timeSinceUpdate = now - lastUpdate;
      
      if (timeSinceUpdate >= STALL_THRESHOLD_MS && builder.checkpointsCompleted < 4) {
        stalledBuilders.push({
          leadId: lead.id,
          businessName: lead.business_name,
          neighborhood: lead.location?.neighborhood || lead.neighborhood || 'Unknown',
          builderId: builder.userId,
          checkpointsCompleted: builder.checkpointsCompleted,
          daysSinceUpdate: Math.floor(timeSinceUpdate / (24 * 60 * 60 * 1000))
        });
      }
    }
  }
  
  return stalledBuilders;
}

// Email Sending Function
async function sendNudgeEmail(builderData, builderProfile) {
  const emailTemplate = `
    <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0f172a;">Bridge.it System Update</h2>
      
      <p style="color: #475569; line-height: 1.6;">
        Hi ${builderProfile.name},
      </p>
      
      <p style="color: #475569; line-height: 1.6;">
        We noticed a pause in your <strong>${builderData.businessName}</strong> build 
        (${builderData.neighborhood}). You've completed ${builderData.checkpointsCompleted} of 4 milestones, 
        and it's been ${builderData.daysSinceUpdate} days since your last update.
      </p>
      
      <p style="color: #475569; line-height: 1.6;">
        <strong>Sprint Status:</strong> Active with ${4 - builderData.checkpointsCompleted} milestone(s) remaining.
      </p>
      
      <p style="color: #475569; line-height: 1.6;">
        If you're facing blockers or need technical guidance, please reach out to your Scout. 
        Otherwise, we encourage you to submit your next Proof of Progress to maintain momentum.
      </p>
      
      <div style="margin: 24px 0;">
        <a href="http://localhost:3000/alumni-dashboard" 
           style="background-color: #10b981; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 6px; display: inline-block;">
          Continue Your Build
        </a>
      </div>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 32px;">
        — The Bridge.it Team<br/>
        Connecting Institutional Scouts with Alumni Talent
      </p>
    </div>
  `;
  
  const mailOptions = {
    from: '"Bridge.it System" <system@bridge.it>',
    to: builderProfile.email || 'builder@example.com', // Mock email
    subject: `Sprint Pulse Check: ${builderData.businessName}`,
    html: emailTemplate
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log(`✓ Nudge email sent to ${builderProfile.name} for ${builderData.businessName}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to send nudge email:`, error);
    return false;
  }
}

// POST /api/nudge-service/check - Run stall detection and send nudges
app.post('/api/nudge-service/check', async (req, res) => {
  try {
    const MOCK_DATA_PATH = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const MOCK_ALUMNI_PATH = join(__dirname, '..', '_architect_ref', 'mockAlumni.json');
    
    const leadsData = JSON.parse(await readFile(MOCK_DATA_PATH, 'utf8'));
    const alumniDataRaw = await readFile(MOCK_ALUMNI_PATH, 'utf8');
    const alumniData = JSON.parse(alumniDataRaw).alumni || [];
    
    const stalledBuilders = detectStalledBuilders(leadsData.leads);
    const nudgeResults = [];
    
    for (const stalledBuilder of stalledBuilders) {
      const builderProfile = alumniData.find(a => a.id === stalledBuilder.builderId);
      if (!builderProfile) continue;
      
      const emailSent = await sendNudgeEmail(stalledBuilder, builderProfile);
      
      if (emailSent) {
        // Update last_nudged_at timestamp
        const leadIndex = leadsData.leads.findIndex(l => l.id === stalledBuilder.leadId);
        if (leadIndex !== -1) {
          const builderIndex = leadsData.leads[leadIndex].activeBuilders.findIndex(
            b => b.userId === stalledBuilder.builderId
          );
          
          if (builderIndex !== -1) {
            leadsData.leads[leadIndex].activeBuilders[builderIndex].last_nudged_at = new Date().toISOString();
            
            nudgeResults.push({
              leadId: stalledBuilder.leadId,
              builderId: stalledBuilder.builderId,
              status: 'sent'
            });
          }
        }
      }
    }
    
    // Save updated data
    await writeFile(MOCK_DATA_PATH, JSON.stringify(leadsData, null, 2));
    
    res.json({
      success: true,
      nudgesSent: nudgeResults.length,
      results: nudgeResults
    });
  } catch (error) {
    console.error('Nudge service error:', error);
    res.status(500).json({ error: 'Failed to process nudge service' });
  }
});

// GET /api/nudge-service/stalled - View stalled projects without sending emails
app.get('/api/nudge-service/stalled', async (req, res) => {
  try {
    const MOCK_DATA_PATH = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const leadsData = JSON.parse(await readFile(MOCK_DATA_PATH, 'utf8'));
    const stalledBuilders = detectStalledBuilders(leadsData.leads);
    
    res.json({
      count: stalledBuilders.length,
      stalled: stalledBuilders
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to detect stalled projects' });
  }
});

// PATCH /api/leads/:id/pause-sprint - Pause or resume sprint
app.patch('/api/leads/:id/pause-sprint', async (req, res) => {
  try {
    const { id } = req.params;
    const { isPaused, scoutName } = req.body;
    
    const MOCK_DATA_PATH = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const leadsData = JSON.parse(await readFile(MOCK_DATA_PATH, 'utf8'));
    const leadIndex = leadsData.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    leadsData.leads[leadIndex].isPaused = isPaused;
    
    // Add audit log entry
    if (!leadsData.leads[leadIndex].auditLog) {
      leadsData.leads[leadIndex].auditLog = [];
    }
    
    leadsData.leads[leadIndex].auditLog.push({
      action: isPaused ? 'paused_sprint' : 'resumed_sprint',
      performedBy: scoutName || 'Scout',
      timestamp: new Date().toISOString(),
      details: `Sprint ${isPaused ? 'paused' : 'resumed'} for ${leadsData.leads[leadIndex].business_name}`
    });
    
    await writeFile(MOCK_DATA_PATH, JSON.stringify(leadsData, null, 2));
    
    const weightedLead = applyRecencyWeights(leadsData.leads[leadIndex]);
    const populatedLead = await populateActiveBuilders(weightedLead);
    
    res.json({ 
      success: true, 
      isPaused: populatedLead.isPaused,
      lead: populatedLead
    });
  } catch (error) {
    console.error('Pause sprint error:', error);
    res.status(500).json({ error: 'Failed to pause sprint' });
  }
});

// PATCH /api/leads/:id/extend-deadline - Extend sprint deadline
app.patch('/api/leads/:id/extend-deadline', async (req, res) => {
  try {
    const { id } = req.params;
    const { days, scoutName } = req.body;
    
    const MOCK_DATA_PATH = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const leadsData = JSON.parse(await readFile(MOCK_DATA_PATH, 'utf8'));
    const leadIndex = leadsData.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const currentDeadline = new Date(leadsData.leads[leadIndex].sprintDeadline || new Date());
    const newDeadline = new Date(currentDeadline.getTime() + (days * 24 * 60 * 60 * 1000));
    leadsData.leads[leadIndex].sprintDeadline = newDeadline.toISOString();
    
    // Add audit log entry
    if (!leadsData.leads[leadIndex].auditLog) {
      leadsData.leads[leadIndex].auditLog = [];
    }
    
    leadsData.leads[leadIndex].auditLog.push({
      action: 'extended_deadline',
      performedBy: scoutName || 'Scout',
      timestamp: new Date().toISOString(),
      details: `Extended deadline by ${days} days for ${leadsData.leads[leadIndex].business_name}`
    });
    
    await writeFile(MOCK_DATA_PATH, JSON.stringify(leadsData, null, 2));
    
    const weightedLead = applyRecencyWeights(leadsData.leads[leadIndex]);
    const populatedLead = await populateActiveBuilders(weightedLead);
    
    res.json({ 
      success: true, 
      newDeadline: populatedLead.sprintDeadline,
      lead: populatedLead
    });
  } catch (error) {
    console.error('Extend deadline error:', error);
    res.status(500).json({ error: 'Failed to extend deadline' });
  }
});

// DELETE /api/leads/:id/evict-builder/:builderId - Evict builder from sprint
app.delete('/api/leads/:id/evict-builder/:builderId', async (req, res) => {
  try {
    const { id, builderId } = req.params;
    const { scoutName, reason } = req.body;
    
    const MOCK_DATA_PATH = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const MOCK_ALUMNI_PATH = join(__dirname, '..', '_architect_ref', 'mockAlumni.json');
    
    const leadsData = JSON.parse(await readFile(MOCK_DATA_PATH, 'utf8'));
    const alumniDataRaw = await readFile(MOCK_ALUMNI_PATH, 'utf8');
    const alumniData = JSON.parse(alumniDataRaw).alumni || [];
    
    const leadIndex = leadsData.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const builderProfile = alumniData.find(a => a.id === builderId);
    const builderName = builderProfile?.name || builderId;
    
    // Remove builder from activeBuilders
    leadsData.leads[leadIndex].activeBuilders = leadsData.leads[leadIndex].activeBuilders.filter(
      b => b.userId !== builderId
    );
    
    // Add audit log entry
    if (!leadsData.leads[leadIndex].auditLog) {
      leadsData.leads[leadIndex].auditLog = [];
    }
    
    leadsData.leads[leadIndex].auditLog.push({
      action: 'evicted_builder',
      performedBy: scoutName || 'Scout',
      timestamp: new Date().toISOString(),
      details: `Evicted ${builderName} from ${leadsData.leads[leadIndex].business_name}`,
      reason: reason || 'Inactivity'
    });
    
    await writeFile(MOCK_DATA_PATH, JSON.stringify(leadsData, null, 2));
    
    const weightedLead = applyRecencyWeights(leadsData.leads[leadIndex]);
    const populatedLead = await populateActiveBuilders(weightedLead);
    
    res.json({ 
      success: true,
      openSlots: populatedLead.maxSlots - (populatedLead.activeBuilders?.length || 0),
      lead: populatedLead
    });
  } catch (error) {
    console.error('Evict builder error:', error);
    res.status(500).json({ error: 'Failed to evict builder' });
  }
});

// POST /api/leads/:id/terminate-sprint - Terminate entire sprint (no winner)
app.post('/api/leads/:id/terminate-sprint', async (req, res) => {
  try {
    const { id } = req.params;
    const { scoutName } = req.body;
    
    const MOCK_DATA_PATH = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const leadsData = JSON.parse(await readFile(MOCK_DATA_PATH, 'utf8'));
    const leadIndex = leadsData.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = leadsData.leads[leadIndex];
    
    // Clear activeBuilders, end sprint, no winner
    leadsData.leads[leadIndex].activeBuilders = [];
    leadsData.leads[leadIndex].sprintActive = false;
    leadsData.leads[leadIndex].winnerUserId = null;
    leadsData.leads[leadIndex].status = 'terminated';
    
    if (!leadsData.leads[leadIndex].auditLog) {
      leadsData.leads[leadIndex].auditLog = [];
    }
    leadsData.leads[leadIndex].auditLog.push({
      action: 'terminated_sprint',
      performedBy: scoutName || 'Scout',
      timestamp: new Date().toISOString(),
      details: `Sprint terminated for ${lead.business_name}. No winner.`
    });
    
    await writeFile(MOCK_DATA_PATH, JSON.stringify(leadsData, null, 2));
    
    const weightedLead = applyRecencyWeights(leadsData.leads[leadIndex]);
    const populatedLead = await populateActiveBuilders(weightedLead);
    
    res.json({ success: true, lead: populatedLead });
  } catch (error) {
    console.error('Terminate sprint error:', error);
    res.status(500).json({ error: 'Failed to terminate sprint' });
  }
});

// POST /api/leads/:id/nudge-builder/:builderId - Nudge a specific builder (72h+ no milestone)
app.post('/api/leads/:id/nudge-builder/:builderId', async (req, res) => {
  try {
    const { id, builderId } = req.params;
    const { scoutName } = req.body;
    
    const MOCK_DATA_PATH = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const leadsData = JSON.parse(await readFile(MOCK_DATA_PATH, 'utf8'));
    const leadIndex = leadsData.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = leadsData.leads[leadIndex];
    const builderIndex = lead.activeBuilders?.findIndex(b => b.userId === builderId);
    
    if (builderIndex === -1) {
      return res.status(404).json({ error: 'Builder not found in this sprint' });
    }
    
    const now = new Date().toISOString();
    leadsData.leads[leadIndex].activeBuilders[builderIndex].last_nudged_at = now;
    
    if (!leadsData.leads[leadIndex].auditLog) {
      leadsData.leads[leadIndex].auditLog = [];
    }
    const builderName = lead.activeBuilders[builderIndex].name || builderId;
    leadsData.leads[leadIndex].auditLog.push({
      action: 'nudged_builder',
      performedBy: scoutName || 'Scout',
      timestamp: now,
      details: `Nudge sent to ${builderName} for ${lead.business_name}`
    });
    
    await writeFile(MOCK_DATA_PATH, JSON.stringify(leadsData, null, 2));
    
    const weightedLead = applyRecencyWeights(leadsData.leads[leadIndex]);
    const populatedLead = await populateActiveBuilders(weightedLead);
    
    res.json({ success: true, lead: populatedLead });
  } catch (error) {
    console.error('Nudge builder error:', error);
    res.status(500).json({ error: 'Failed to nudge builder' });
  }
});

// POST /api/leads/:id/flag-builder/:builderId - Flag builder with 5h warning (submit or be kicked)
app.post('/api/leads/:id/flag-builder/:builderId', async (req, res) => {
  try {
    const { id, builderId } = req.params;
    const { scoutName } = req.body;
    
    const MOCK_DATA_PATH = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const leadsData = JSON.parse(await readFile(MOCK_DATA_PATH, 'utf8'));
    const leadIndex = leadsData.leads.findIndex(l => l.id === id);
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = leadsData.leads[leadIndex];
    const builderIndex = lead.activeBuilders?.findIndex(b => b.userId === builderId);
    
    if (builderIndex === -1) {
      return res.status(404).json({ error: 'Builder not found in this sprint' });
    }
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    
    leadsData.leads[leadIndex].activeBuilders[builderIndex].flagged_at = now.toISOString();
    leadsData.leads[leadIndex].activeBuilders[builderIndex].flagged_expires_at = expiresAt.toISOString();
    
    if (!leadsData.leads[leadIndex].auditLog) {
      leadsData.leads[leadIndex].auditLog = [];
    }
    const builderName = lead.activeBuilders[builderIndex].name || builderId;
    leadsData.leads[leadIndex].auditLog.push({
      action: 'flagged_builder',
      performedBy: scoutName || 'Scout',
      timestamp: now.toISOString(),
      details: `Flagged ${builderName} - submit within 5 hours or be kicked from ${lead.business_name}`
    });
    
    await writeFile(MOCK_DATA_PATH, JSON.stringify(leadsData, null, 2));
    
    const weightedLead = applyRecencyWeights(leadsData.leads[leadIndex]);
    const populatedLead = await populateActiveBuilders(weightedLead);
    
    res.json({ success: true, lead: populatedLead });
  } catch (error) {
    console.error('Flag builder error:', error);
    res.status(500).json({ error: 'Failed to flag builder' });
  }
});

// GET /api/leads/:id/audit-log - Get audit log for a lead
app.get('/api/leads/:id/audit-log', async (req, res) => {
  try {
    const { id } = req.params;
    const MOCK_DATA_PATH = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const leadsData = JSON.parse(await readFile(MOCK_DATA_PATH, 'utf8'));
    const lead = leadsData.leads.find(l => l.id === id);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    res.json({ 
      auditLog: lead.auditLog || []
    });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// GET /api/library - Fetch completed builds
app.get('/api/library', async (req, res) => {
  try {
    const MOCK_DATA_PATH = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const MOCK_ALUMNI_PATH = join(__dirname, '..', '_architect_ref', 'mockAlumni.json');
    
    const leadsData = JSON.parse(await readFile(MOCK_DATA_PATH, 'utf8'));
    const alumniDataRaw = await readFile(MOCK_ALUMNI_PATH, 'utf8');
    const alumniData = JSON.parse(alumniDataRaw).alumni || [];
    
    // Get Ashley Vigo's completed builds
    const ashleyProfile = alumniData.find(a => a.id === 'alumni_ashley');
    const completedBuilds = [];
    
    if (ashleyProfile && ashleyProfile.completedBuilds) {
      ashleyProfile.completedBuilds.forEach((build, index) => {
        const lead = leadsData.leads.find(l => l.id === build.leadId);
        if (lead) {
          completedBuilds.push({
            id: `build_${index + 1}`,
            leadId: build.leadId,
            businessName: build.businessName,
            neighborhood: lead.location.neighborhood,
            borough: lead.location.borough,
            techStack: build.techStack,
            completedAt: build.completedAt,
            builderName: ashleyProfile.name,
            builderId: ashleyProfile.id,
            quality: build.quality,
            repoUrl: build.repoUrl,
            description: lead.friction_clusters[0]?.category || 'Technical Solution',
            isPioneer: index === 0 // First build is pioneer
          });
        }
      });
    }
    
    // Add some mock builds from other users
    const mockBuilds = [
      {
        id: 'build_4',
        leadId: 'lead_005',
        businessName: 'Jackson Heights Deli',
        neighborhood: 'Jackson Heights',
        borough: 'Queens',
        techStack: ['Vue.js', 'Node.js', 'MongoDB'],
        completedAt: '2026-01-10T10:00:00Z',
        builderName: 'Jordan Taylor',
        builderId: 'alumni_001',
        quality: 88,
        repoUrl: 'https://github.com/jordan-taylor/jackson-heights-deli',
        description: 'Phone Intake Optimization',
        isPioneer: true
      },
      {
        id: 'build_5',
        leadId: 'lead_009',
        businessName: 'Bushwick Bakery',
        neighborhood: 'Bushwick',
        borough: 'Brooklyn',
        techStack: ['React', 'Python', 'PostgreSQL'],
        completedAt: '2026-01-18T10:00:00Z',
        builderName: 'Alex Chen',
        builderId: 'alumni_003',
        quality: 91,
        repoUrl: 'https://github.com/alex-chen/bushwick-bakery',
        description: 'Inventory Management',
        isPioneer: false
      }
    ];
    
    res.json({
      builds: [...completedBuilds, ...mockBuilds],
      total: completedBuilds.length + mockBuilds.length
    });
  } catch (error) {
    console.error('Library fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch library' });
  }
});

// POST /api/leads/:id/open-voting - Open voting, create builds for finalists
app.post('/api/leads/:id/open-voting', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await loadData();
    const leadIndex = data.leads.findIndex(l => l.id === id);
    if (leadIndex === -1) return res.status(404).json({ error: 'Lead not found' });

    const lead = data.leads[leadIndex];
    const totalMilestones = lead.milestones?.length || 4;
    const finalists = (lead.activeBuilders || []).filter(b => b.checkpointsCompleted >= totalMilestones);
    if (finalists.length < 2) return res.status(400).json({ error: 'Need at least 2 builders with all milestones complete to open voting' });
    if (lead.voting_open) return res.status(400).json({ error: 'Voting already open' });
    if (lead.winnerUserId) return res.status(400).json({ error: 'Winner already selected' });

    const alumni = await loadAlumniData();
    const builds = await loadBuilds();

    for (const builder of finalists) {
      const alumniData = alumni.find(a => a.id === builder.userId);
      // Use final submission (last milestone proof link) as deployed link for voting
      let deployed_url = (builder.proofLinks && builder.proofLinks[builder.proofLinks.length - 1]) || '';
      if (!deployed_url && builder.checkpointStatuses) {
        const entries = Object.entries(builder.checkpointStatuses).filter(([, c]) => c?.proofLink);
        entries.sort(([a], [b]) => Number(b) - Number(a));
        deployed_url = entries[0]?.[1]?.proofLink || '';
      }
      const buildId = `build_${id}_${builder.userId}`;
      if (!builds.find(b => b.id === buildId)) {
        builds.push({
          id: buildId,
          lead_id: id,
          builder_user_id: builder.userId,
          builder_name: alumniData?.name || builder.userId,
          business_name: lead.business_name,
          deployed_url,
          created_at: new Date().toISOString()
        });
      }
    }

    await saveBuilds(builds);
    data.leads[leadIndex].voting_open = true;
    await saveData(data);

    const populatedLead = await populateActiveBuilders(applyRecencyWeights(data.leads[leadIndex]));
    res.json({ success: true, lead: populatedLead, builds: builds.filter(b => b.lead_id === id) });
  } catch (error) {
    console.error('Open voting error:', error);
    res.status(500).json({ error: 'Failed to open voting' });
  }
});

// GET /api/leads/:id/voting - Get voting status and builds for a lead
app.get('/api/leads/:id/voting', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await loadData();
    const lead = data.leads.find(l => l.id === id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const builds = await loadBuilds();
    const leadBuilds = builds.filter(b => b.lead_id === id);
    const votes = await loadBuildVotes();
    const buildVotes = votes.filter(v => leadBuilds.some(b => b.id === v.build_id));

    const totalVotes = buildVotes.length;
    const buildsWithVotes = leadBuilds.map(b => {
      const bVotes = buildVotes.filter(v => v.build_id === b.id);
      const avg = bVotes.length ? bVotes.reduce((s, v) => s + v.score, 0) / bVotes.length : 0;
      return { ...b, voteCount: bVotes.length, averageScore: Math.round(avg * 100) / 100 };
    });

    res.json({
      lead_id: id,
      business_name: lead.business_name,
      voting_open: !!lead.voting_open,
      winnerUserId: lead.winnerUserId,
      builds: buildsWithVotes,
      totalVotes,
      minVotesRequired: 10
    });
  } catch (error) {
    console.error('Get voting error:', error);
    res.status(500).json({ error: 'Failed to get voting status' });
  }
});

// Helper: ensure a lead has voting open and builds for finalists (2+ builders with all milestones). Mutates data/builds and saves.
async function ensureVotingOpenForLead(data, lead, builds, alumni) {
  const totalMilestones = lead.milestones?.length || 4;
  const finalists = (lead.activeBuilders || []).filter(b => b.checkpointsCompleted >= totalMilestones);
  if (finalists.length < 2 || lead.winnerUserId) return false;
  const leadIndex = data.leads.findIndex(l => l.id === lead.id);
  if (leadIndex === -1) return false;

  for (const builder of finalists) {
    const alumniData = alumni.find(a => a.id === builder.userId);
    let deployed_url = (builder.proofLinks && builder.proofLinks[builder.proofLinks.length - 1]) || '';
    if (!deployed_url && builder.checkpointStatuses) {
      const entries = Object.entries(builder.checkpointStatuses).filter(([, c]) => c?.proofLink);
      entries.sort(([a], [b]) => Number(b) - Number(a));
      deployed_url = entries[0]?.[1]?.proofLink || '';
    }
    const buildId = `build_${lead.id}_${builder.userId}`;
    if (!builds.find(b => b.id === buildId)) {
      builds.push({
        id: buildId,
        lead_id: lead.id,
        builder_user_id: builder.userId,
        builder_name: alumniData?.name || builder.userId,
        business_name: lead.business_name,
        deployed_url,
        created_at: new Date().toISOString()
      });
    }
  }
  data.leads[leadIndex].voting_open = true;
  return true;
}

// GET /api/voting/leads - Get all leads with voting open (for fellow voting UI). Auto-opens voting for leads with 2+ finalists.
// Query: voter_id - optional, if provided each build includes hasVoted for this voter
app.get('/api/voting/leads', async (req, res) => {
  try {
    const { voter_id } = req.query;
    const data = await loadData();
    const totalMilestonesDefault = 4;
    const alumni = await loadAlumniData();
    let builds = await loadBuilds();

    // Auto-open voting for any lead that has 2+ builders with all milestones complete (so voting card populates)
    for (const lead of data.leads || []) {
      if (lead.winnerUserId) continue;
      if (lead.voting_open) continue;
      const finalists = (lead.activeBuilders || []).filter(b => b.checkpointsCompleted >= (lead.milestones?.length || totalMilestonesDefault));
      if (finalists.length >= 2) {
        const changed = await ensureVotingOpenForLead(data, lead, builds, alumni);
        if (changed) {
          await saveBuilds(builds);
          await saveData(data);
        }
      }
    }

    const leads = (data.leads || []).filter(l => l.voting_open && !l.winnerUserId);
    const votes = await loadBuildVotes();

    const result = leads.map(lead => {
      const leadBuilds = builds.filter(b => b.lead_id === lead.id);
      const leadVotes = votes.filter(v => leadBuilds.some(b => b.id === v.build_id));
      return {
        lead_id: lead.id,
        business_name: lead.business_name,
        builds: leadBuilds.map(b => {
          const bVotes = votes.filter(v => v.build_id === b.id);
          const hasVoted = voter_id && bVotes.some(v => v.voter_id === voter_id);
          return {
            ...b,
            voteCount: bVotes.length,
            averageScore: bVotes.length ? Math.round((bVotes.reduce((s, v) => s + v.score, 0) / bVotes.length) * 100) / 100 : 0,
            hasVoted: !!hasVoted
          };
        }),
        totalVotes: leadVotes.length
      };
    });

    res.json({ leads: result });
  } catch (error) {
    console.error('Get voting leads error:', error);
    res.status(500).json({ error: 'Failed to get voting leads' });
  }
});

// POST /api/builds/:buildId/vote - Submit a vote (1-5)
app.post('/api/builds/:buildId/vote', async (req, res) => {
  try {
    const { buildId } = req.params;
    const { voter_id, score } = req.body;

    if (!voter_id || score === undefined) return res.status(400).json({ error: 'voter_id and score (1-5) required' });
    if (score < 1 || score > 5) return res.status(400).json({ error: 'score must be between 1 and 5' });

    const builds = await loadBuilds();
    const build = builds.find(b => b.id === buildId);
    if (!build) return res.status(404).json({ error: 'Build not found' });

    const data = await loadData();
    const lead = data.leads.find(l => l.id === build.lead_id);
    if (!lead?.voting_open) return res.status(400).json({ error: 'Voting is not open for this project' });
    if (lead.winnerUserId) return res.status(400).json({ error: 'Winner already selected' });

    const votes = await loadBuildVotes();
    const existing = votes.find(v => v.build_id === buildId && v.voter_id === voter_id);
    if (existing) return res.status(400).json({ error: 'Already voted on this build' });

    votes.push({
      id: `vote_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      build_id: buildId,
      voter_id,
      score,
      created_at: new Date().toISOString()
    });
    await saveBuildVotes(votes);

    res.json({ success: true, message: 'Vote submitted' });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ error: 'Failed to submit vote' });
  }
});

// POST /api/leads/:id/close-voting - Close voting and calculate winner (min 10 votes)
app.post('/api/leads/:id/close-voting', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await loadData();
    const leadIndex = data.leads.findIndex(l => l.id === id);
    if (leadIndex === -1) return res.status(404).json({ error: 'Lead not found' });

    const lead = data.leads[leadIndex];
    if (!lead.voting_open) return res.status(400).json({ error: 'Voting is not open' });
    if (lead.winnerUserId) return res.status(400).json({ error: 'Winner already selected' });

    const builds = await loadBuilds();
    const leadBuilds = builds.filter(b => b.lead_id === id);
    const votes = await loadBuildVotes();
    const leadVotes = votes.filter(v => leadBuilds.some(b => b.id === v.build_id));

    const totalVotes = leadVotes.length;
    if (totalVotes < 10) return res.status(400).json({ error: `Need at least 10 votes to close. Current: ${totalVotes}` });

    const scored = leadBuilds.map(b => {
      const bVotes = leadVotes.filter(v => v.build_id === b.id);
      const avg = bVotes.length ? bVotes.reduce((s, v) => s + v.score, 0) / bVotes.length : 0;
      return { ...b, voteCount: bVotes.length, averageScore: avg };
    });

    const winner = scored.reduce((prev, curr) => curr.averageScore > prev.averageScore ? curr : prev);

    data.leads[leadIndex].winnerUserId = winner.builder_user_id;
    data.leads[leadIndex].winnerAverageScore = Math.round(winner.averageScore * 100) / 100;
    data.leads[leadIndex].status = 'awarded';
    data.leads[leadIndex].voting_open = false;
    await saveData(data);

    const populatedLead = await populateActiveBuilders(applyRecencyWeights(data.leads[leadIndex]));
    res.json({
      success: true,
      winner: { userId: winner.builder_user_id, name: winner.builder_name, averageScore: winner.averageScore },
      lead: populatedLead
    });
  } catch (error) {
    console.error('Close voting error:', error);
    res.status(500).json({ error: 'Failed to close voting' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    version: '4.2.0',
    vertical: 'Hospitality',
    timestamp: new Date().toISOString()
  });
});

// Global error handler: ensure ALL errors return JSON (prevents "Unexpected token I" parse crash)
app.use((err, req, res, _next) => {
  if (res.headersSent) return;
  const msg = (err && (err.message || err.reason)) ? String(err.message || err.reason) : String(err);
  const globalErrPayload = { location: 'server/index.js:globalErrorHandler', message: 'Unhandled error', data: { path: req?.path, method: req?.method, msg, name: err?.name, stack: (err?.stack || '').slice(0, 500) }, timestamp: Date.now(), hypothesisId: 'H0' };
  try { appendFileSync(join(__dirname, '..', '.cursor', 'debug.log'), JSON.stringify(globalErrPayload) + '\n'); } catch (_) {}
  try {
    res.status(500).setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ error: err?.message || 'Internal server error', message: msg }));
  } catch (e) {
    try { res.send('{"error":"Internal server error"}'); } catch (_) {}
  }
});

app.listen(PORT, '0.0.0.0', () => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:listen',message:'Express server started',data:{port:PORT},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
  console.log(`🚀 Bridge.it API Server running on port ${PORT}`);
  console.log('🚀 Evidence Engine Wired. Outscraper Mock Mode: ACTIVE.');
  console.log(`📊 Endpoints:`);
  console.log(`   GET /api/leads                    - Fetch all restaurant leads`);
  console.log(`   GET /api/leads/:id                - Fetch single lead by ID`);
  console.log(`   PATCH /api/leads/:id/status       - Update lead status`);
  console.log(`   POST /api/leads/:id/checkpoint    - Submit checkpoint proof`);
  console.log(`   POST /api/leads/:id/join-sprint   - Join sprint race`);
  console.log(`   POST /api/leads/:id/scout-review  - Scout review submissions`);
  console.log(`   POST /api/leads/:id/calculate-winner - Calculate sprint winner`);
  console.log(`   GET /api/leaderboard              - Fetch top builders leaderboard`);
  console.log(`   GET /api/proofs/pending           - Fetch all pending proofs`);
  console.log(`   PATCH /api/leads/:id/verify-checkpoint - Verify checkpoint proof`);
  console.log(`   GET /api/alumni                   - Fetch alumni registry (add ?available=true for available only)`);
  console.log(`   POST /api/nudge-service/check     - Run stall detection and send nudges`);
  console.log(`   GET /api/nudge-service/stalled    - View stalled projects without sending emails`);
  console.log(`   PATCH /api/leads/:id/pause-sprint - Pause or resume sprint`);
  console.log(`   PATCH /api/leads/:id/extend-deadline - Extend sprint deadline`);
  console.log(`   DELETE /api/leads/:id/evict-builder/:builderId - Evict builder from sprint`);
  console.log(`   POST /api/leads/:id/terminate-sprint - Terminate entire sprint`);
  console.log(`   POST /api/leads/:id/nudge-builder/:builderId - Nudge a builder`);
  console.log(`   POST /api/leads/:id/flag-builder/:builderId - Flag builder (5h warning)`);
  console.log(`   GET /api/leads/:id/audit-log     - Get audit log for a lead`);
  console.log(`   GET /api/library                 - Fetch completed builds library`);
  console.log(`   POST /api/leads/:id/open-voting  - Open voting for finalists`);
  console.log(`   GET /api/leads/:id/voting        - Get voting status and builds`);
  console.log(`   GET /api/voting/leads            - Get all leads with voting open`);
  console.log(`   POST /api/builds/:buildId/vote   - Submit vote (1-5)`);
  console.log(`   POST /api/leads/:id/close-voting - Close voting and calculate winner (min 10 votes)`);
  console.log(`   POST /generate-handoff             - Generate handoff brief (JSON)`);
  console.log(`   GET /generate-handoff/:leadId/markdown - Download markdown brief`);
  console.log(`   GET /generate-handoff/:leadId/pdf      - Download PDF report`);
  console.log(`   GET /health                       - Health check`);
  console.log(`\n🎯 Ready for Feb 9th demo!`);
});
