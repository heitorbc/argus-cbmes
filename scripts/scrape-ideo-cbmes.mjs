// Scrape one-shot do site institucional do IDEO (Itens Diários de Entrega Operacional).
// Roda Puppeteer headless contra https://sites.google.com/view/ideocbmes/
// e gera apps/api/src/modules/ideo/seed-ideo-cbmes.json com 31 dias × 2 tipos = 62 entries.
//
// Uso (rodar quando precisar atualizar o seed):
//   1. Instalar puppeteer temporariamente:
//        pnpm add -w -D puppeteer
//        node node_modules/puppeteer/install.mjs   # baixa Chromium
//   2. Rodar o scrape:
//        pnpm scrape:ideo
//   3. Remover puppeteer:
//        pnpm remove -w puppeteer
//
// Por que não fica permanente: pnpm 11 exige aprovação explícita do build script de
// puppeteer (instala Chromium ~200MB). Mantemos o JSON congelado no repositório e o
// script é idempotente — re-roda só quando o site IDEO institucional mudar.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '..', 'apps', 'api', 'src', 'modules', 'ideo', 'seed-ideo-cbmes.json');

const TIPOS = [
  { slug: 'abts', tipo: 'ABTS' },
  { slug: 'resgate', tipo: 'RESGATE' },
];

async function scrapePagina(page, slug, dia) {
  const url = `https://sites.google.com/view/ideocbmes/${slug}-dia-${dia}?authuser=0`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
  // Aguarda os iframes do Google Sites popularem o conteúdo real.
  await new Promise((r) => setTimeout(r, 4000));

  const items = await page.evaluate(() => {
    // Itens IDEO aparecem em parágrafos no formato "N) NOME DO ITEM EM CAIXA ALTA".
    // Extraímos só o nome (depois do ")") e dedupamos.
    const itensPattern = /^\s*(\d+)\s*\)\s*(.+)$/;
    const out = new Map(); // numero -> nome
    document.querySelectorAll('p, span, h1, h2, h3, h4, div').forEach((el) => {
      const t = el.textContent?.replace(/\s+/g, ' ').trim();
      if (!t || t.length > 80) return;
      const m = t.match(itensPattern);
      if (!m) return;
      const numero = Number.parseInt(m[1], 10);
      const nomeRaw = m[2].trim();
      // Filtro: nome deve ter ao menos 1 caractere alfa e não ser uma instrução longa.
      if (!/[A-Za-zÀ-ÿ]/.test(nomeRaw)) return;
      // Capitaliza primeira letra de cada palavra (evita ALL CAPS no app).
      const nome = nomeRaw
        .toLowerCase()
        .split(' ')
        .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ')
        .trim();
      // Mantém o primeiro encontrado para cada número (alguns elementos repetem).
      if (!out.has(numero)) out.set(numero, nome);
    });
    return [...out.entries()].sort(([a], [b]) => a - b).map(([, nome]) => nome);
  });
  return items;
}

async function main() {
  console.log('Iniciando scrape IDEO CBMES...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30_000);

  const entries = [];
  for (const { slug, tipo } of TIPOS) {
    for (let dia = 1; dia <= 31; dia++) {
      try {
        const itens = await scrapePagina(page, slug, dia);
        entries.push({ dia, tipo, itens });
        console.log(`✓ ${tipo} dia ${dia}: ${itens.length} itens`);
      } catch (err) {
        console.warn(`✗ ${tipo} dia ${dia}: ${err.message}`);
        entries.push({ dia, tipo, itens: [] });
      }
      // throttle para não disparar rate-limit do Google
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  await browser.close();
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(entries, null, 2), 'utf8');
  console.log(`\nGerado ${OUT_PATH} com ${entries.length} entries.`);
}

main().catch((err) => {
  console.error('Falha no scrape:', err);
  process.exit(1);
});
