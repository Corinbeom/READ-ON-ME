const fs = require('node:fs');
const path = require('node:path');

function prepareWebExport(dist) {
  // Pages excludes directories named node_modules, including Expo's exported
  // icon fonts and navigation images. Keep their URLs through a static rewrite.
  const assets = path.join(dist, 'assets');
  const source = path.join(assets, 'node_modules');
  if (fs.existsSync(source)) {
    fs.cpSync(source, path.join(assets, 'vendor'), { recursive: true });
  }

  // Safari can hold first paint for pending font preloads even with swap.
  // Keep @font-face rules and let CSS request fonts when text needs them.
  let removed = 0;
  function prepareHtml(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) prepareHtml(file);
      else if (entry.name.endsWith('.html')) {
        const html = fs.readFileSync(file, 'utf8');
        const prepared = html.replace(/<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']font["'])[^>]*>/gi, () => {
          removed += 1;
          return '';
        });
        if (prepared !== html) fs.writeFileSync(file, prepared);
      }
    }
  }
  prepareHtml(dist);
  return removed;
}

module.exports = { prepareWebExport };
if (require.main === module) {
  const removed = prepareWebExport(path.resolve(__dirname, '../dist'));
  console.log(`Prepared Expo assets; removed ${removed} blocking font preloads.`);
}
