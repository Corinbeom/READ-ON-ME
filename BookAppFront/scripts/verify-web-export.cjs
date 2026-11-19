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
const fontFaces = html.match(/@font-face\s*\{[^}]*\}/g) ?? [];
if (!fontFaces.length || fontFaces.some((face) => !/font-display:\s*swap\b/.test(face))) {
  throw new Error('Startup fonts must use font-display: swap so slow downloads cannot hide the page.');
}
if (/<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']font["'])[^>]*>/i.test(html)) {
  throw new Error('Remove startup font preloads before deploying; they can delay first paint in Safari.');
}
const entries = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
  .map((match) => match[1]).filter((src) => src.startsWith('/_expo/') && src.endsWith('.js'));
if (!entries.length || !entries.some((src) => fs.readFileSync(path.join(dist, src), 'utf8').includes(apiUrl))) {
  throw new Error('The browser bundle is missing EXPO_PUBLIC_API_URL. Rebuild with expo export --clear.');
}
const image = html.match(/<meta\b(?=[^>]*\bproperty=["']og:image["'])[^>]*\bcontent=["']([^"']+)["']/i)?.[1];
let shareImage;
if (image) {
  try { shareImage = new URL(image); } catch { /* Report invalid URLs as missing share metadata. */ }
}
if (shareImage?.protocol !== 'https:' || shareImage.pathname !== '/galpi-share-card.png' ||
    !fs.existsSync(path.join(dist, 'galpi-share-card.png'))) {
  throw new Error('The home HTML must link to the exported share card at a public HTTPS URL.');
}
if (!/<link\b(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["']\/favicon\.ico["'])/i.test(html) ||
    !fs.existsSync(path.join(dist, 'favicon.ico'))) {
  throw new Error('The home HTML must link to the exported favicon.');
}
console.log(`Verified browser bundle API URL: ${apiUrl}`);
console.log('Verified non-blocking startup fonts.');
console.log('Verified the home share card and favicon.');
