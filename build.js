/*
 * Bundles the modular src/ files into a single self-contained index.html.
 * Run: node build.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const ORDER = [
  'stats.js', 'lmm.js', 'glmm.js', 'bayes.js', 'rng.js',
  'levels.js', 'levels.c2.js', 'levels.c3.js', 'levels.c4.js', 'levels.c5.js', 'campaigns.js',
  'engine.js', 'charts.js', 'knowledge.js', 'content.js', 'ui.js',
];

const js = ORDER.map((f) => {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  return `// ===================== ${f} =====================\n${code}`;
}).join('\n\n');

const css = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');
const shell = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8');

const html = shell
  .replace('/*__STYLE__*/', () => '\n' + css + '\n')
  .replace('/*__SCRIPT__*/', () => '\n' + js + '\n');

fs.writeFileSync(path.join(__dirname, 'index.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`Built index.html (${kb} KB) from ${ORDER.length} modules.`);
