import axios from 'axios';
import 'dotenv/config';

const DOHMH_RESOURCE =
  'https://data.cityofnewyork.us/resource/43nn-pn8j.json';

const STOP_WORDS = /\b(the|llc|inc|ltd|&|co\.?)\b/gi;

/** Clean business name: remove The, LLC, Inc, Ltd, &, Co */
function cleanBusinessName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.replace(STOP_WORDS, ' ').replace(/\s+/g, ' ').trim();
}

/** Extract first significant word from cleaned name */
function firstSignificantWord(name) {
  const cleaned = cleanBusinessName(name);
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words[0] || '';
}

/** Get zip from params or extract from address string */
function getZip(zipParam, address) {
  if (zipParam && String(zipParam).trim()) return String(zipParam).trim();
  if (address) {
    const m = String(address).match(/\b\d{5}(?:-\d{4})?\b/);
    return m ? m[0] : '';
  }
  return '';
}

/**
 * Fetch health violation records from NYC DOHMH Restaurant Inspection dataset.
 * Uses first significant word of business name + zip code. Filters to last 24 months.
 * @param {object} params - { businessName?: string, address?: string, borough?: string, zip?: string, limit?: number }
 * @returns {Promise<object[]>} Raw array of violation/inspection records from NYC Open Data
 */
export async function fetchDOHMHViolations(params = {}) {
  const { businessName, address, borough, zip, limit = 50 } = params;
  const zipCode = getZip(zip, address);

  const doSearch = async (searchTerm) => {
    if (!searchTerm || !String(searchTerm).trim()) return [];
    const d = new Date();
    d.setMonth(d.getMonth() - 24);
    const since = d.toISOString().slice(0, 10);
    const requestParams = {
      $limit: Math.min(limit, 100),
      $order: 'inspection_date DESC',
      $q: String(searchTerm).trim(),
      $where: `inspection_date >= '${since}'`,
    };
    const headers = { Accept: 'application/json' };
    const rawToken = process.env.NYC_OPEN_DATA_APP_TOKEN || '';
    const appToken = rawToken.replace(/^["']|["']$/g, '').trim().replace(/\s/g, '');
    if (appToken) headers['X-App-Token'] = appToken;
    try {
      const { data } = await axios.get(DOHMH_RESOURCE, { params: requestParams, headers });
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('NYC Health API error:', e?.message || e);
      return [];
    }
  };

  const firstWord = firstSignificantWord(businessName);
  const searchTerm = [firstWord, zipCode].filter(Boolean).join(' ').trim();

  if (!searchTerm) {
    console.log(`🔍 Searching NYC Health for: (empty) in ${zipCode || '(no zip)'} | Found: 0`);
    return [];
  }

  const results = await doSearch(searchTerm);
  console.log(`🔍 Searching NYC Health for: ${searchTerm} in ${zipCode || '(no zip)'} | Found: ${results.length}`);
  return results;
}
