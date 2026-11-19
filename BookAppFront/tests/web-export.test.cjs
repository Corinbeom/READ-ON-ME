const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { prepareWebExport } = require('../scripts/prepare-web-export.cjs');

test('web export removes font preloads from nested routes and preserves styles, other preloads and dependency assets', (t) => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'readonme-web-export-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dist, 'book'), { recursive: true });
  fs.mkdirSync(path.join(dist, 'assets/node_modules/icons'), { recursive: true });
  const style = '<style>@font-face{font-family:Test;src:url(/font.ttf);font-display:swap}</style>';
  const image = '<link rel="preload" href="/cover.png" as="image">';
  const html = style + '<link rel="preload" as="font" href="/font.ttf">' + image;
  fs.writeFileSync(path.join(dist, 'index.html'), html);
  fs.writeFileSync(path.join(dist, 'book/[isbn].html'), "<link as='font' href='/font.ttf' rel='preload'>" + style);
  const font = Buffer.from([0, 1, 0, 0]);
  fs.writeFileSync(path.join(dist, 'assets/node_modules/icons/font.ttf'), font);

  assert.equal(prepareWebExport(dist), 2);
  assert.equal(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), style + image);
  assert.equal(fs.readFileSync(path.join(dist, 'book/[isbn].html'), 'utf8'), style);
  assert.deepEqual(fs.readFileSync(path.join(dist, 'assets/vendor/icons/font.ttf')), font);
  assert.equal(prepareWebExport(dist), 0);
});

test('release verification rejects font preloads and blocking font display, and accepts the prepared bundle', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readonme-web-verify-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  const dist = path.join(root, 'dist');
  fs.mkdirSync(path.join(dist, '_expo/static/js'), { recursive: true });
  const script = path.join(root, 'scripts/verify-web-export.cjs');
  fs.copyFileSync(path.join(__dirname, '../scripts/verify-web-export.cjs'), script);
  fs.writeFileSync(path.join(dist, '_expo/static/js/entry.js'), 'const api="https://api.example.invalid";');
  const html = '<style>@font-face{font-display:swap;src:url(/font.ttf)}</style>' +
    '<meta property="og:image" content="https://web.example.invalid/galpi-share-card.png"/>' +
    '<link rel="icon" href="/favicon.ico"/>' +
    '<link as="font" rel="preload" href="/font.ttf"><script src="/_expo/static/js/entry.js"></script>';
  const verify = () => spawnSync(process.execPath, [script], {
    env: { ...process.env, EXPO_PUBLIC_API_URL: 'https://api.example.invalid' }, encoding: 'utf8',
  });
  fs.writeFileSync(path.join(dist, 'index.html'), html);
  assert.match(verify().stderr, /Remove startup font preloads/);
  prepareWebExport(dist);
  assert.match(verify().stderr, /exported share card/);
  fs.copyFileSync(path.join(__dirname, '../public/galpi-share-card.png'), path.join(dist, 'galpi-share-card.png'));
  assert.match(verify().stderr, /exported favicon/);
  fs.writeFileSync(path.join(dist, 'favicon.ico'), Buffer.from([0, 0, 1, 0]));
  assert.match(verify().stderr, /must link to the home-screen icon and web app manifest/);
  const prepared = fs.readFileSync(path.join(dist, 'index.html'), 'utf8') +
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>' +
    '<link rel="manifest" href="/manifest.webmanifest"/>';
  fs.writeFileSync(path.join(dist, 'index.html'), prepared);
  assert.match(verify().stderr, /Missing home-screen icon/);
  for (const file of ['apple-touch-icon.png', 'manifest.webmanifest', 'galpi-app-icon-192.png']) {
    fs.copyFileSync(path.join(__dirname, '../public', file), path.join(dist, file));
  }
  fs.copyFileSync(path.join(dist, 'galpi-app-icon-192.png'), path.join(dist, 'galpi-app-icon-512.png'));
  assert.match(verify().stderr, /must be a 512×512 PNG/);
  fs.copyFileSync(path.join(__dirname, '../public/galpi-app-icon-512.png'), path.join(dist, 'galpi-app-icon-512.png'));
  assert.equal(verify().status, 0);
  fs.writeFileSync(path.join(dist, 'index.html'), prepared.replace('https://web.example.invalid/galpi-share-card.png', '/galpi-share-card.png'));
  assert.match(verify().stderr, /public HTTPS URL/);
  fs.writeFileSync(path.join(dist, 'index.html'), html.replace('font-display:swap', 'font-display:auto'));
  assert.match(verify().stderr, /Startup fonts must use font-display: swap/);
});
