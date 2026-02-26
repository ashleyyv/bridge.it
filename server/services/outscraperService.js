import axios from 'axios';
import 'dotenv/config';

const OUTSCRAPER_BASE = 'https://api.app.outscraper.com';
/** When true, returns mock data immediately—Outscraper API is NEVER called (credit guard). */
const USE_MOCK_DATA = true;

/**
 * Fetch recent review sentiment from Outscraper (Google Maps/Business reviews).
 * Use to identify 'Customer Pain' points from review text.
 * @param {object} params - { query: string (business name + address), limit?: number, language?: string }
 * @returns {Promise<object>} Raw Outscraper API response (includes reviews with text, rating, date)
 */
export async function fetchReviewSentiment(params = {}) {
  // CREDIT GUARD: return mock data first; API key and axios call below are never reached when true
  if (USE_MOCK_DATA) {
    return [
      {
        rating: 2,
        text: 'The phone lines were busy for an hour and no one picked up.',
        pain_point: 'Phone intake bottleneck',
        source: 'mock',
        published_at: '2026-02-18T10:00:00Z',
      },
      {
        rating: 1,
        text: 'I kept getting transferred and had to repeat my order three times.',
        pain_point: 'Order workflow confusion',
        source: 'mock',
        published_at: '2026-02-17T09:10:00Z',
      },
      {
        rating: 2,
        text: 'Online ordering failed at checkout and support never responded.',
        pain_point: 'Checkout failure',
        source: 'mock',
        published_at: '2026-02-16T14:35:00Z',
      },
      {
        rating: 3,
        text: 'Pickup notifications were delayed so my food sat too long.',
        pain_point: 'Notification lag',
        source: 'mock',
        published_at: '2026-02-15T18:20:00Z',
      },
      {
        rating: 1,
        text: 'Reservation confirmations never arrived and we lost our table.',
        pain_point: 'Booking reliability',
        source: 'mock',
        published_at: '2026-02-14T20:05:00Z',
      },
    ];
  }

  const rawKey = process.env.OUTSCRAPER_API_KEY || '';
  const apiKey = rawKey.replace(/^["']|["']$/g, '').trim().replace(/\s/g, '');
  if (!apiKey) {
    throw new Error('OUTSCRAPER_API_KEY is not set in .env');
  }

  const { query, limit = 10, language = 'en' } = params;
  if (!query || !String(query).trim()) {
    return { data: [], reviews: [] };
  }

  const { data } = await axios.get(`${OUTSCRAPER_BASE}/maps/reviews-v2`, {
    params: {
      query: String(query).trim(),
      limit,
      language,
      async: false,
    },
    headers: {
      'X-API-KEY': apiKey,
      Accept: 'application/json',
    },
  });

  return data;
}
