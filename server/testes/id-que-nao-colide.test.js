// O id de um registro novo não pode repetir.
//
// É o pior defeito possível neste sistema: a mescla do servidor casa os
// registros por id. Dois com o mesmo id e um apaga o outro em silêncio — sem
// erro, sem aviso, sem nada no histórico. Não existe chave primária no JSON
// para impedir, e o próprio módulo de conciliação já alertava para isso.
//
// O gerador antigo era `p + Date.now() + Math.floor(Math.random() * 1000)`.
// Na auditoria de hoje, contra a cópia local, havia 39 pares de parcelas com
// id repetido — de CLIENTES DIFERENTES. Exemplo real:
//
//   fr179286953210766 -> "Teste 06 · Parcela 7/12"  E  "Teste 10 · Entrada"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { novoId } from '../src/ids.js';

test('mil ids seguidos, nenhum repetido', () => {
  // O gerador antigo falha aqui: mil registros no mesmo punhado de
  // milissegundos, com só mil sorteios possíveis.
  const vistos = new Set();
  for (let i = 0; i < 1000; i++) vistos.add(novoId('fr'));
  assert.equal(vistos.size, 1000);
});

test('cem mil ids, nenhum repetido', () => {
  // A automação cria doze parcelas por contrato e roda sobre centenas de
  // contratos. O volume de verdade é este.
  const vistos = new Set();
  for (let i = 0; i < 100000; i++) vistos.add(novoId('x'));
  assert.equal(vistos.size, 100000);
});

test('o prefixo fica na frente e o resto é separado', () => {
  // Sem separador, "...07" + "66" dá o mesmo texto que "...076" + "6": dois
  // instantes distintos, um id só. Foi a segunda causa da colisão.
  const id = novoId('fr');
  assert.ok(id.startsWith('fr'), id);
  assert.match(id, /^fr[a-z0-9]+-[0-9a-f]{12}$/, id);
});

test('ids nascem ordenáveis por data', () => {
  // O instante vem antes do acaso, em base 36: ordenar por id dá quase a
  // ordem de criação, que ajuda quando alguém lê o bloco cru.
  const a = novoId('x');
  const b = novoId('x');
  assert.ok(a <= b || a.split('-')[0] <= b.split('-')[0]);
});

test('sem prefixo também funciona', () => {
  assert.match(novoId(), /^[a-z0-9]+-[0-9a-f]{12}$/);
});

test('o gerador que colide não pode voltar a lugar nenhum', () => {
  // Estava copiado em SEIS arquivos. Um que escape volta a produzir id
  // repetido, e ninguém percebe até um registro sumir.
  const dir = new URL('../src/', import.meta.url);
  const culpados = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js') || f === 'ids.js') continue;
    const fonte = readFileSync(new URL(f, dir), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    if (/Date\.now\(\) \+ Math\.floor\(Math\.random\(\) \* 1000\)/.test(fonte)) culpados.push(f);
  }
  assert.deepEqual(culpados, [], 'voltou o gerador que colide em: ' + culpados.join(', '));
});

test('quem gera id usa o gerador de verdade', () => {
  const dir = new URL('../src/', import.meta.url);
  const faltando = [];
  for (const f of ['automacoes.js', 'avisos-cliente.js', 'prazos.js',
                   'primeiro-contato.js', 'instalacao.js', 'uscis.js']) {
    const fonte = readFileSync(new URL(f, dir), 'utf8');
    if (!/from '\.\/ids\.js'/.test(fonte)) faltando.push(f);
  }
  assert.deepEqual(faltando, []);
});

test('as telas também não podem gerar id fraco', () => {
  // O navegador JÁ tinha sido corrigido antes — o comentário em api.js conta a
  // mesma história: "deu 12 ids repetidos em 25 processos, e editar um mexia
  // no outro". Consertaram de um lado e o servidor ficou com o gerador velho
  // por meses. Este teste cobre os DOIS lados, para não repetir isso.
  const docs = new URL('../../docs/', import.meta.url);
  const fracos = [];
  const varrer = (dir, prefixo = '') => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) { varrer(new URL(f.name + '/', dir), prefixo + f.name + '/'); continue; }
      if (!/\.(html|js)$/.test(f.name)) continue;
      const fonte = readFileSync(new URL(f.name, dir), 'utf8').replace(/^\s*\/\/.*$/gm, '');
      // Qualquer id montado com Math.random, fora do próprio novoId (que tem
      // o caminho de reserva para navegador sem crypto).
      if (/\buid\w*\s*=\s*\(?\w*\)?\s*=>[^;]*Math\.random/.test(fonte)) fracos.push(prefixo + f.name);
    }
  };
  varrer(docs);
  assert.deepEqual(fracos, [], 'gerador de id fraco em: ' + fracos.join(', '));
});

test('o navegador usa crypto, com reserva', () => {
  const api = readFileSync(new URL('../../docs/assets/api.js', import.meta.url), 'utf8');
  const i = api.indexOf('function novoId(prefixo)');
  const corpo = api.slice(i, api.indexOf('\n  }', i));
  assert.match(corpo, /crypto\.randomUUID/);
  assert.match(corpo, /Date\.now\(\)\.toString\(36\)/, 'e uma reserva para navegador sem crypto');
});
