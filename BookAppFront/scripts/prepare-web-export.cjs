const fs = require('node:fs');
const path = require('node:path');

// Pages excludes directories named node_modules, including Expo's exported
// icon fonts and navigation images. Keep their URLs through a static rewrite.
const assets = path.resolve(__dirname, '../dist/assets');
const source = path.join(assets, 'node_modules');
if (fs.existsSync(source)) {
  fs.cpSync(source, path.join(assets, 'vendor'), { recursive: true });
  console.log('Prepared Expo dependency assets for Cloudflare Pages.');
}
