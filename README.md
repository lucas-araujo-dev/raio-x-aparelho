# Raio-X do Aparelho

Site grátis que descobre a especificação **real** de projetores, TV boxes, centrais multimídia e celulares
direto no navegador (GPU, Android, RAM, resolução, 32/64 bits) e compara com o que o anúncio prometeu.
Em volta da ferramenta há guias baseados em testes reais (HY300, central "Android 13" falsa, Android Auto sem fio) e
uma tabela de chips.

**Como gera dinheiro:** links de afiliado (Amazon, Shopee, Mercado Livre), anúncios (AdSense) e apoio via Pix.
Quem chega ao site é justamente quem está comprando ou acabou de comprar um aparelho desses.

## O que roda sozinho (GitHub Actions, sem seu PC ligado)

| Quando | O quê |
|---|---|
| Toda segunda, ~06h | Busca as ofertas mais vendidas e bem avaliadas na API da Shopee Afiliados (links já com a sua comissão), gera o site, confere links, roda os testes e publica |
| A cada push | Mesmo processo |
| Toda execução agendada | Registra a data em `data/ultima-execucao.txt`. Isso evita que o GitHub desligue o agendamento após 60 dias sem atividade |

Se algo falhar, o GitHub manda e-mail. Com falha na API da Shopee, o site é publicado mesmo assim, sem a página de ofertas.

## Configuração única (o que só você pode fazer)

São cadastros no seu nome/CPF, que exigem aceitar termos e informar dados de pagamento. Tudo é colado em
**GitHub → repositório → Settings → Secrets and variables → Actions**, sem mexer em código.

| # | Cadastro | Onde colar | Efeito |
|---|---|---|---|
| 1 | [Shopee Afiliados](https://affiliate.shopee.com.br) → após aprovado, menu *Open API* → App ID e Secret | **Secrets**: `SHOPEE_APP_ID`, `SHOPEE_APP_SECRET` | Página "Ofertas" atualizada toda semana com seus links |
| 2 | [Amazon Associados](https://associados.amazon.com.br) → seu ID de rastreamento (ex.: `seunome-20`) | **Variables**: `AMAZON_TAG` | Botões "Ver na Amazon" em todos os guias |
| 3 | Chave Pix (pode ser aleatória) | **Variables**: `PIX_KEY`, `PIX_NAME`, `PIX_CITY` | Caixa "Apoie via Pix" com copia e cola |
| 4 | [Google Search Console](https://search.google.com/search-console) → método *tag HTML* → só o valor de `content` | **Variables**: `GOOGLE_SITE_VERIFICATION` | Depois, enviar `sitemap.xml` no Search Console. Acelera a indexação |
| 5 | (opcional) [GoatCounter](https://www.goatcounter.com) grátis, ex.: `raiox` | **Variables**: `GOATCOUNTER_CODE` | Contagem de visitas sem cookies |
| 6 | (opcional) domínio `.com.br` (~R$ 40/ano no registro.br) | **Variables**: `CUSTOM_DOMAIN` + DNS CNAME para `lucas-araujo-dev.github.io` | Necessário para o AdSense |
| 7 | (depois do domínio e de ter tráfego) [AdSense](https://adsense.google.com) → `ca-pub-...` | **Variables**: `ADSENSE_CLIENT` | Anúncios automáticos + `ads.txt` |
| — | (opcional) links curtos de afiliado do Mercado Livre/Shopee por produto | **Variables**: `AFFILIATE_LINKS` = `{"projetor-1080p-nativo":"https://...","central-uis7862":"https://..."}` | Botão "Ver oferta" nos guias |

Depois de salvar as variáveis: **Actions → Publicar site → Run workflow** (ou espere a próxima segunda).

## Expectativa realista

- Site novo leva de **2 a 6 meses** para começar a aparecer bem no Google. Antes disso, a renda tende a zero.
- O maior acelerador é gente compartilhando o resultado do teste (botão de WhatsApp na própria página).
  Postar o link **uma vez** em grupos de donos de HY300, TV box e centrais multimídia ajuda muito no começo.
- Comissão de afiliado em eletrônico é de alguns reais por venda. Cobrir uma assinatura de ~R$ 110/mês pede algo como
  10 a 20 vendas/mês ou o equivalente em anúncios, o que é alcançável com alguns milhares de visitas mensais, mas **não garantido**.

## Desenvolvimento

```bash
npm run build   # gera dist/ e confere links
npm test        # testes da detecção (casos reais HY300 e central)
npx serve dist  # ou: python3 -m http.server -d dist
```

- Páginas: `src/pages/**.html`, com bloco `<!--meta {...} -->` no topo. `{{buy id "busca"}}` vira botões de compra.
- Mapa GPU → chip: `src/assets/raiox.js` (`GPU_FAMILIES`). Só entram chips com fonte confiável; chip fora do mapa
  nunca gera acusação de "chip falso".
- O JavaScript da ferramenta é ES2017 sem `?.`/`??`, para rodar em WebViews antigas (Chrome 66).
