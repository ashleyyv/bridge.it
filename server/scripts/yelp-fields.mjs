import 'dotenv/config';
import axios from 'axios';

const rawKey = process.env.YELP_API_KEY || '';
const apiKey = rawKey.replace(/['"]/g, '').trim().replace(/\s/g, '');

// Check exactly what fields come back for GAN-HOO
const { data } = await axios.get('https://api.yelp.com/v3/businesses/gan-hoo-bbq-flushing', {
  headers: { Authorization: `Bearer ${apiKey}` },
});
console.log('Top-level keys:', Object.keys(data).join(', '));
console.log('website_url field:', data.website_url);
console.log('url field (Yelp listing):', data.url);
