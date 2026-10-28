// Gera o site estático em dist/ a partir de src/ e config.json. Sem dependências: só Node 18+.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
// Variáveis do repositório (Settings → Secrets and variables → Actions → Variables) têm prioridade sobre o config.json.
const env = process.env;
if (env.AMAZON_TAG) cfg.amazonTag = env.AMAZON_TAG;
if (env.ADSENSE_CLIENT) cfg.adsenseClient = env.ADSENSE_CLIENT;
if (env.GOATCOUNTER_CODE) cfg.goatcounterCode = env.GOATCOUNTER_CODE;
if (env.CUSTOM_DOMAIN) cfg.customDomain = env.CUSTOM_DOMAIN;
if (env.PIX_KEY) cfg.pix = { key: env.PIX_KEY, name: env.PIX_NAME || '', city: env.PIX_CITY || '' };
if (env.GOOGLE_SITE_VERIFICATION) cfg.googleSiteVerification = env.GOOGLE_SITE_VERIFICATION;
if (env.AFFILIATE_LINKS) Object.assign(cfg.links, JSON.parse(env.AFFILIATE_LINKS));
const siteUrl = (process.env.SITE_URL || cfg.customDomain && `https://${cfg.customDomain}` || cfg.siteUrl).replace(/\/$/, '');
const today = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

// Botões de compra. Só aparecem para as lojas configuradas; sem configuração, nada é exibido.
function buyButtons(id, query) {
  const out = [];
  const fixed = cfg.links && cfg.links[id];
  if (fixed) out.push(`<a class="btn buy" href="${esc(fixed)}" rel="sponsored nofollow noopener" target="_blank">Ver oferta</a>`);
  if (cfg.amazonTag) {
    const url = `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}&tag=${encodeURIComponent(cfg.amazonTag)}`;
    out.push(`<a class="btn buy alt" href="${esc(url)}" rel="sponsored nofollow noopener" target="_blank">Ver na Amazon</a>`);
  }
  return out.length ? `<span class="buy-row">${out.join(' ')}</span>` : '';
}

function ofertasHtml() {
  const file = path.join(ROOT, 'data', 'ofertas.json');
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data.groups || !data.groups.some((g) => g.items.length)) return null;
  const groups = data.groups.filter((g) => g.items.length).map((g) => `
    <h2>${esc(g.title)}</h2>
    ${g.note ? `<p class="muted">${esc(g.note)}</p>` : ''}
    <div class="offers">${g.items.map((it) => `
      <a class="offer" href="${esc(it.link)}" rel="sponsored nofollow noopener" target="_blank">
        ${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" width="120" height="120">` : ''}
        <span class="offer-name">${esc(it.name)}</span>
        <span class="offer-price">R$ ${esc(it.price)}</span>
        ${it.rating ? `<span class="muted">★ ${esc(it.rating)}${it.sales ? ` · ${esc(it.sales)} vendidos` : ''}</span>` : ''}
      </a>`).join('')}
    </div>`).join('');
  return `<p class="muted">Atualizado automaticamente em ${esc(data.updated)}. Preços e estoque mudam rápido; confira na loja.</p>${groups}`;
}

const layout = fs.readFileSync(path.join(SRC, 'layout.html'), 'utf8');
const ofertas = ofertasHtml();

const head = [];
if (cfg.googleSiteVerification) head.push(`<meta name="google-site-verification" content="${esc(cfg.googleSiteVerification)}">`);
if (cfg.adsenseClient) head.push(`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(cfg.adsenseClient)}" crossorigin="anonymous"></script>`);
if (cfg.goatcounterCode) head.push(`<script data-goatcounter="https://${esc(cfg.goatcounterCode)}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>`);

const pix = cfg.pix && cfg.pix.key ? `
  <aside class="support" id="apoie" data-pix-key="${esc(cfg.pix.key)}" data-pix-name="${esc(cfg.pix.name)}" data-pix-city="${esc(cfg.pix.city)}">
    <strong>O Raio-X te ajudou?</strong> O site é grátis e sem cadastro. Se quiser apoiar, qualquer valor via Pix ajuda a mantê-lo no ar.
    <button class="btn" type="button" data-pix-copy>Copiar Pix (copia e cola)</button>
    <span class="muted" data-pix-status></span>
  </aside>` : '';

fs.rmSync(DIST, { recursive: true, force: true });
const pages = [];

for (const file of walk(path.join(SRC, 'pages'))) {
  const rel = path.relative(path.join(SRC, 'pages'), file);
  let body = fs.readFileSync(file, 'utf8');
  const m = body.match(/^<!--meta\s+([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`${rel}: falta o bloco <!--meta {...} -->`);
  const meta = JSON.parse(m[1]);
  body = body.slice(m[0].length);

  if (body.includes('{{ofertas}}')) {
    if (!ofertas) continue; // página de ofertas só existe quando há ofertas reais
    body = body.replace('{{ofertas}}', ofertas);
  }
  body = body.replace(/\{\{buy\s+([\w-]+)\s+"([^"]+)"\}\}/g, (_, id, q) => buyButtons(id, q));

  const depth = rel.split(path.sep).length - 1;
  const base = depth ? '../'.repeat(depth) : './';
  const urlPath = rel.replace(/\\/g, '/').replace(/index\.html$/, '');
  const canonical = `${siteUrl}/${urlPath}`;

  const html = layout
    .replace('{{head}}', head.join('\n'))
    .replace('{{content}}', body)
    .replace('{{support}}', pix)
    .replace('{{amazon-disclosure}}', cfg.amazonTag ? '<p class="muted">Como participante do Programa de Associados da Amazon, este site é remunerado pelas compras qualificadas efetuadas.</p>' : '')
    .replace('{{nav-ofertas}}', ofertas ? `<a href="{{base}}ofertas.html">Ofertas</a>` : '')
    .replace(/\{\{title\}\}/g, esc(meta.title))
    .replace(/\{\{description\}\}/g, esc(meta.description))
    .replace(/\{\{canonical\}\}/g, esc(canonical))
    .replace(/\{\{siteName\}\}/g, esc(cfg.siteName))
    .replace(/\{\{year\}\}/g, String(new Date().getFullYear()))
    .replace(/\{\{base\}\}/g, base);

  const out = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  if (!meta.noindex) pages.push({ loc: canonical, priority: meta.priority || (depth ? '0.7' : '1.0') });
}

fs.cpSync(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true });
fs.cpSync(path.join(SRC, 'static'), DIST, { recursive: true }); // chave do IndexNow etc.

fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map((p) => `  <url><loc>${esc(p.loc)}</loc><lastmod>${today}</lastmod><priority>${p.priority}</priority></url>`)
    .join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
if (cfg.adsenseClient) {
  fs.writeFileSync(path.join(DIST, 'ads.txt'), `google.com, ${cfg.adsenseClient.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
}
if (cfg.customDomain) fs.writeFileSync(path.join(DIST, 'CNAME'), `${cfg.customDomain}\n`);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

console.log(`ok: ${pages.length} páginas em dist/ (${siteUrl})${ofertas ? ' + ofertas' : ''}`);
