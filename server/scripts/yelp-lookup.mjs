import 'dotenv/config';
import axios from 'axios';

const rawKey = process.env.YELP_API_KEY || '';
const apiKey = rawKey.replace(/['"]/g, '').trim().replace(/\s/g, '');

const searches = [
  ['GAN-HOO BBQ', 'Flushing, NY'],
  ['The Alcove', 'Queens, NY'],
  ['Fogo de Chao Brazilian Steakhouse', 'Manhattan, NY'],
];

for (const [term, location] of searches) {
  try {
    const { data } = await axios.get('https://api.yelp.com/v3/businesses/search', {
      params: { term, location, limit: 3 },
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const businesses = data.businesses || [];
    if (businesses.length === 0) {
      console.log(`${term}: NOT FOUND`);
    } else {
      for (const b of businesses) {
        const details = await axios.get(`https://api.yelp.com/v3/businesses/${b.alias}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        console.log(`${term}: alias=${b.alias} name="${b.name}" website="${details.data.website_url || 'NONE'}"`);
      }
    }
  } catch (e) {
    console.log(`${term} ERROR: ${e.response?.status} ${e.message}`);
  }
}
