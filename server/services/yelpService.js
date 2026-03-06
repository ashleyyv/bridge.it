import axios from 'axios';
import 'dotenv/config';

const YELP_BASE_URL = 'https://api.yelp.com/v3';

/**
 * Map a Yelp business object to our Supabase/lead shape.
 * @param {object} business - Raw business from Yelp Fusion API
 * @returns {object} Mapped lead record
 */
function parseNeighborhoodFromYelp(loc) {
  const displayAddress = Array.isArray(loc.display_address) ? loc.display_address : [];
  // display_address[1] is often "Neighborhood, STATE ZIP" (e.g. "Forest Hills, NY 11375")
  if (displayAddress.length >= 2 && typeof displayAddress[1] === 'string') {
    const match = displayAddress[1].match(/^([^,]+)/);
    if (match) {
      const parsed = match[1].trim();
      if (parsed && parsed.length < 50) return parsed;
    }
  }
  // Fallback: use city (Yelp city can be neighborhood in NYC)
  if (loc.city) return loc.city;
  // Last resort: address1 only if it looks like a place name (no leading digits)
  const addr1 = loc.address1 || (displayAddress[0] || '');
  if (addr1 && !/^\d+[\s,]/.test(addr1) && addr1.length < 40) return addr1;
  return loc.city || '';
}

function mapYelpBusinessToLead(business) {
  const loc = business.location || {};
  const displayAddress = Array.isArray(loc.display_address) ? loc.display_address : [];
  const neighborhood = parseNeighborhoodFromYelp(loc);
  return {
    yelp_id: business.id ?? null,
    yelp_alias: business.alias ?? null,
    business_name: business.name ?? '',
    website_url: null, // Yelp url is the listing page, not business website; audit will populate
    location: {
      neighborhood,
      borough: loc.city || '',
      zip: loc.zip_code || '',
    },
    audit_status: 'pending',
    rating: business.rating ?? null,
    review_count: business.review_count ?? null,
    price: business.price ?? null,
  };
}

/**
 * Fetch full business details from Yelp Fusion API using alias or Yelp business ID.
 * This is the only call that returns the real website_url for a business.
 * @param {string} aliasOrId - Yelp business alias (e.g. "gan-hoo-bbq-flushing") or Yelp ID
 * @returns {Promise<{ website_url: string|null, phone: string|null, rating: number|null, review_count: number|null }>}
 */
export async function getYelpBusinessDetails(aliasOrId) {
  if (!aliasOrId || !String(aliasOrId).trim()) return { website_url: null };
  const rawKey = process.env.YELP_API_KEY || '';
  const apiKey = rawKey.replace(/^["']|["']$/g, '').trim().replace(/\s/g, '');
  if (!apiKey) throw new Error('YELP_API_KEY is not set in .env');

  try {
    const { data } = await axios.get(`${YELP_BASE_URL}/businesses/${encodeURIComponent(String(aliasOrId).trim())}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    // Yelp free tier does not return website_url; it only returns the Yelp listing url.
    // We set website_url to null and return yelp_listing_url separately so the caller
    // can decide whether to use the listing URL as a fallback.
    return {
      website_url: data.website_url || null,
      yelp_listing_url: data.url || null,
      phone: data.phone || data.display_phone || null,
      rating: data.rating ?? null,
      review_count: data.review_count ?? null,
    };
  } catch (err) {
    const status = err.response && err.response.status;
    console.error(`Yelp business details fetch failed for "${aliasOrId}": ${status} ${err.message}`);
    return { website_url: null };
  }
}

/**
 * Search Yelp Fusion API by business name + location to find the Yelp alias.
 * Used when yelp_alias was not stored at scout time.
 * @param {string} businessName
 * @param {string} location
 * @returns {Promise<string|null>} Yelp alias or null
 */
export async function findYelpAlias(businessName, location) {
  if (!businessName || !location) return null;
  const rawKey = process.env.YELP_API_KEY || '';
  const apiKey = rawKey.replace(/^["']|["']$/g, '').trim().replace(/\s/g, '');
  if (!apiKey) return null;

  try {
    const { data } = await axios.get(`${YELP_BASE_URL}/businesses/search`, {
      params: { term: businessName, location, limit: 1 },
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const first = (data.businesses || [])[0];
    if (first) return first.alias || first.id || null;
    return null;
  } catch (err) {
    console.error(`Yelp alias search failed for "${businessName}": ${err.message}`);
    return null;
  }
}

/**
 * Search Yelp Fusion API and return results formatted for our Supabase table.
 * @param {object} params - Search params (e.g. { term, location, limit })
 * @returns {Promise<object[]>} Array of mapped lead records
 */
export async function searchYelp(params = {}) {
  // Normalize key: trim and remove accidental spaces (e.g. from .env paste)
  const rawKey = process.env.YELP_API_KEY || '';
  const apiKey = rawKey.replace(/^["']|["']$/g, '').trim().replace(/\s/g, '');
  if (!apiKey) {
    throw new Error('YELP_API_KEY is not set in .env');
  }

  const requestParams = {
    term: params.term,
    location: params.location,
    limit: params.limit ?? 20,
    offset: params.offset ?? 0,
  };
  if (params.latitude != null) requestParams.latitude = params.latitude;
  if (params.longitude != null) requestParams.longitude = params.longitude;

  try {
    const { data } = await axios.get(`${YELP_BASE_URL}/businesses/search`, {
      params: requestParams,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const businesses = data.businesses || [];
    return businesses.map(mapYelpBusinessToLead);
  } catch (err) {
    const status = err.response && err.response.status;
    const yelpBody = err.response && err.response.data;
    fetch('http://127.0.0.1:7242/ingest/55c61c3c-05b2-454b-916e-a4f02d3031dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'yelpService.js:searchYelp:catch',message:'Yelp API error',data:{status,yelpBody,message:err.message},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
    throw err;
  }
}
