// Confere se todo link interno do site gerado aponta para um arquivo que existe. Falha o build se não.
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');
const broken = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

for (const file of walk(DIST).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  if (/\{\{[^}]+\}\}/.test(html)) broken.push(`${path.relative(DIST, file)}: marcador {{...}} não substituído`);
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|#|data:)/.test(url)) continue;
    let target = path.resolve(path.dirname(file), url.split('#')[0].split('?')[0]);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) broken.push(`${path.relative(DIST, file)} → ${url}`);
  }
}
if (broken.length) {
  console.error('Links quebrados:\n' + broken.join('\n'));
  process.exit(1);
}
console.log('check-links: ok');
