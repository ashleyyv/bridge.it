import axios from 'axios';
import 'dotenv/config';

const PAGE_SPEED_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

/**
 * Fetch PageSpeed performance and accessibility scores for a website URL.
 * Uses Google PageSpeed Insights API (Lighthouse).
 * @param {string} websiteUrl - The URL to analyze (e.g. https://example.com)
 * @param {object} options - Optional: { strategy: 'mobile'|'desktop', locale: string }
 * @returns {Promise<object>} Raw PageSpeed API response (includes lighthouseResult.categories with performance/accessibility scores)
 */
export async function fetchPageSpeedScores(websiteUrl, options = {}) {
  const rawKey = process.env.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_API_KEY || '';
  const apiKey = rawKey.replace(/^["']|["']$/g, '').trim().replace(/\s/g, '');

  const params = {
    url: websiteUrl,
    category: ['performance', 'accessibility'],
    strategy: options.strategy || 'mobile',
  };
  if (options.locale) params.locale = options.locale;
  if (apiKey) params.key = apiKey;

  const { data } = await axios.get(PAGE_SPEED_BASE, { params });
  return data;
}
