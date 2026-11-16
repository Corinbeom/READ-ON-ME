const fs = require('node:fs');
const path = require('node:path');

// A successful static render does not prove Metro embedded the release URL.
// Check the actual browser entry before uploading it to Pages.
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL before verifying the web export.');
const url = new URL(apiUrl);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  throw new Error('The web export requires an external HTTPS API URL.');
}
const dist = path.resolve(__dirname, '../dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const entries = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
  .map((match) => match[1]).filter((src) => src.startsWith('/_expo/') && src.endsWith('.js'));
if (!entries.length || !entries.some((src) => fs.readFileSync(path.join(dist, src), 'utf8').includes(apiUrl))) {
  throw new Error('The browser bundle is missing EXPO_PUBLIC_API_URL. Rebuild with expo export --clear.');
}
console.log(`Verified browser bundle API URL: ${apiUrl}`);
