// Avisa Bing, Yandex e outros buscadores (protocolo IndexNow) sobre as páginas do site publicado.
// Sem conta nem verificação: a posse é provada pelo arquivo de chave servido no próprio site.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const siteUrl = (process.env.SITE_URL || JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).siteUrl).replace(/\/$/, '');
const keyFile = fs.readdirSync(path.join(ROOT, 'src', 'static')).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
const key = keyFile.replace('.txt', '');

const sitemap = await (await fetch(`${siteUrl}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(siteUrl).host, key, keyLocation: `${siteUrl}/${keyFile}`, urlList }),
});
console.log(`indexnow: ${urlList.length} URLs → HTTP ${res.status}`);
// 200/202 = aceito. Qualquer outra resposta só é registrada: não pode derrubar a publicação.
