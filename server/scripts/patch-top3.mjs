/**
 * One-time patch: set real Yelp listing URLs and lead-specific deliverables
 * for the top 3 priority leads.
 * Safe to re-run — uses .update().eq('id', ...)
 */
import 'dotenv/config';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const rawKey = process.env.YELP_API_KEY || '';
const apiKey = rawKey.replace(/['"]/g, '').trim().replace(/\s/g, '');

const leads = [
  {
    id: 'd908ae3e-b4d5-4f6c-abfa-12480a03f5e5',
    name: 'GAN-HOO BBQ',
    alias: 'gan-hoo-bbq-flushing',
    // GAN-HOO has 20 violations — compliance + phone intake friction
    suggested_deliverables: [
      'Compliance Monitor Dashboard',
      'Automated Health Inspection Alerts',
      'Digital Menu & Online Ordering System',
      'Queue Management System',
      'SMS Waitlist Notifications',
      'Digital Launchpad',
    ],
  },
  {
    id: 'f4aea473-8e3a-4408-831b-66a9c3131793',
    name: 'The Alcove',
    alias: 'the-alcove-sunnyside',
    suggested_deliverables: [
      'React Reservation & Booking Dashboard',
      'Calendar API Integration',
      'Automated Confirmation & Reminders',
      'Real-time SMS Waitlist System',
      'Digital Launchpad',
    ],
  },
  {
    id: '0a2d36f1-6eeb-4895-a96b-5102f15a424d',
    name: 'Fogo de Chão Brazilian Steakhouse',
    alias: 'fogo-de-chao-brazilian-steakhouse-new-york-6',
    suggested_deliverables: [
      'Online Reservation Portal',
      'Stripe Group Booking & Pre-Payment',
      'Order Status API & Webhooks',
      'Customer Loyalty & CRM System',
      'Compliance Monitor Dashboard',
    ],
  },
];

for (const lead of leads) {
  // Fetch Yelp listing URL
  let yelpUrl = null;
  try {
    const { data } = await axios.get(`https://api.yelp.com/v3/businesses/${lead.alias}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    // Use clean URL without tracking params
    yelpUrl = `https://www.yelp.com/biz/${lead.alias}`;
    console.log(`✅ ${lead.name}: Yelp listing = ${yelpUrl}`);
  } catch (e) {
    console.log(`⚠️  ${lead.name}: Yelp fetch failed (${e.response?.status}), using fallback URL`);
    yelpUrl = `https://www.yelp.com/search?find_desc=${encodeURIComponent(lead.name)}&find_loc=Queens+NY`;
  }

  const { error } = await supabase
    .from('leads')
    .update({
      website_url: yelpUrl,
      suggested_deliverables: lead.suggested_deliverables,
      audit_status: 'completed',
    })
    .eq('id', lead.id);

  if (error) {
    console.error(`❌ ${lead.name}: DB update failed:`, error.message);
  } else {
    console.log(`💾 ${lead.name}: Saved ${lead.suggested_deliverables.length} deliverables + website_url`);
  }
}

console.log('\nDone. Verify:');
const { data } = await supabase
  .from('leads')
  .select('business_name,hfi_score,website_url,suggested_deliverables,audit_status')
  .in('id', leads.map(l => l.id));
data.forEach(r => {
  console.log(`  ${r.business_name}: hfi=${r.hfi_score} website=${r.website_url ? '✅' : '❌'} deliverables=${r.suggested_deliverables?.length ?? 0} status=${r.audit_status}`);
});
