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
const links = html.match(/<link\b[^>]*>/gi) ?? [];
const hasLink = (rel, href) => links.some((link) =>
  link.match(/\brel=["']([^"']+)["']/i)?.[1] === rel &&
  link.match(/\bhref=["']([^"']+)["']/i)?.[1] === href
);

function checkSquarePng(src, size) {
  if (!/^\/[\w.-]+\.png$/.test(src) || !fs.existsSync(path.join(dist, src))) {
    throw new Error(`Missing home-screen icon: ${src}`);
  }
  const png = fs.readFileSync(path.join(dist, src));
  if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      png.toString('ascii', 12, 16) !== 'IHDR' ||
      png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) {
    throw new Error(`The home-screen icon ${src} must be a ${size}×${size} PNG.`);
  }
}

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
if (!hasLink('icon', '/favicon.ico') || !fs.existsSync(path.join(dist, 'favicon.ico'))) {
  throw new Error('The home HTML must link to the exported favicon.');
}
if (!hasLink('apple-touch-icon', '/apple-touch-icon.png') ||
    !hasLink('manifest', '/manifest.webmanifest')) {
  throw new Error('The home HTML must link to the home-screen icon and web app manifest.');
}
checkSquarePng('/apple-touch-icon.png', 180);
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
for (const size of [192, 512]) {
  const icon = manifest.icons?.find((item) => item.sizes === `${size}x${size}` && item.type === 'image/png');
  if (!icon?.src) throw new Error(`The web app manifest must declare a ${size}×${size} PNG icon.`);
  checkSquarePng(icon.src, size);
}
console.log(`Verified browser bundle API URL: ${apiUrl}`);
console.log('Verified non-blocking startup fonts.');
console.log('Verified the home share card, favicon and home-screen icons.');
