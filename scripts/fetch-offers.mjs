// Busca ofertas na API de afiliados da Shopee e grava data/ofertas.json (os links já saem com a comissão).
// Roda toda semana pelo GitHub Actions. Sem SHOPEE_APP_ID/SHOPEE_APP_SECRET, não faz nada e o site segue sem a página.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APP_ID = process.env.SHOPEE_APP_ID;
const SECRET = process.env.SHOPEE_APP_SECRET;
const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';

const GROUPS = [
  { title: 'Projetores', note: 'Procure "1080p nativo" e lúmens ANSI na descrição.', keywords: ['projetor 1080p nativo', 'projetor android'] },
  { title: 'TV boxes', note: 'Prefira chips RK3566, S905X4 ou S922X a modelos com Mali-450.', keywords: ['tv box rk3566', 'tv box android'] },
  { title: 'Centrais multimídia', note: 'Prefira UIS7862 e desconfie de "Android 13" muito barato.', keywords: ['central multimidia uis7862', 'central multimidia carplay android auto'] },
  { title: 'Adaptadores CarPlay / Android Auto sem fio', note: '', keywords: ['adaptador carplay android auto sem fio'] },
];
const PER_GROUP = 8;

async function query(gql) {
  const payload = JSON.stringify({ query: gql });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash('sha256').update(`${APP_ID}${ts}${payload}${SECRET}`).digest('hex');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `SHA256 Credential=${APP_ID}, Timestamp=${ts}, Signature=${sig}` },
    body: payload,
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function offers(keyword) {
  // sortType 2 = mais vendidos. Bem avaliados e com vendas reais tendem a converter melhor.
  const data = await query(`{ productOfferV2(keyword: ${JSON.stringify(keyword)}, sortType: 2, page: 1, limit: 20) {
    nodes { itemId productName priceMin priceMax sales ratingStar imageUrl offerLink }
  } }`);
  return data.productOfferV2.nodes;
}

async function main() {
  if (!APP_ID || !SECRET) {
    console.log('fetch-offers: SHOPEE_APP_ID/SHOPEE_APP_SECRET ausentes; pulando (o site é publicado sem a página de ofertas).');
    return;
  }
  const out = { updated: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }), groups: [] };
  for (const g of GROUPS) {
    const seen = new Set();
    const items = [];
    for (const kw of g.keywords) {
      for (const n of await offers(kw)) {
        if (seen.has(n.itemId) || Number(n.ratingStar) < 4.5 || Number(n.sales) < 10) continue;
        seen.add(n.itemId);
        items.push({
          name: n.productName,
          price: Number(n.priceMin).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          rating: Number(n.ratingStar).toFixed(1),
          sales: n.sales,
          image: n.imageUrl,
          link: n.offerLink,
        });
      }
    }
    out.groups.push({ title: g.title, note: g.note, items: items.slice(0, PER_GROUP) });
  }
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data', 'ofertas.json'), JSON.stringify(out, null, 2));
  console.log(`fetch-offers: ${out.groups.map((g) => `${g.title}=${g.items.length}`).join(', ')}`);
}

main().catch((e) => {
  // Falha na API não pode derrubar a publicação do site: registra e segue.
  console.error('fetch-offers falhou:', e.message);
  process.exitCode = 0;
});
