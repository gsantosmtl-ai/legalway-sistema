// A aba Acompanhamento: o registro do que foi avisado ao cliente depois do
// processo ser protocolado.
//
// Ela perguntou "o que é acompanhamento" olhando uma aba que mostrava isto:
//
//   [Certidao de Nascimento.pdf](https://trello.com/1/cards/699dd37b8b369a0660de7282/attachments/699dde7...)
//
// Ou seja, o comentário cru que veio da importação do Trello, com a marcação
// de link inteira. A aba existe e faz sentido; o que estava ilegível era o
// conteúdo importado.
//
// E havia um problema mais sério no mesmo lugar: o texto entrava como HTML
// SEM ESCAPE, enquanto o Histórico ao lado usa esc(). Boa parte desse texto
// veio de fora do sistema. Texto de fora injetado como HTML é por onde entra
// script.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TELA = join(dirname(fileURLToPath(import.meta.url)), '../../docs/documentos.html');
const html = readFileSync(TELA, 'utf8');

function corpo(nome) {
  const i = html.indexOf(`function ${nome}(`);
  assert.ok(i > 0, `não achei ${nome}`);
  let nivel = 0, fim = -1;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') nivel++;
    else if (html[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
  }
  return html.slice(i, fim);
}

const ctx = createContext({ String });
runInContext(
  `function esc(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;')`
  + `.replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }\n`
  + corpo('textoDoAcompanhamento')
  + '\nglobalThis.F = textoDoAcompanhamento;', ctx);
const F = ctx.F;

test('o link do Trello vira o nome do arquivo, clicável', () => {
  const cru = '[Certidao de Nascimento.pdf](https://trello.com/1/cards/699dd37/attachments/699dde7)';
  const r = F(cru);
  assert.match(r, />Certidao de Nascimento\.pdf</, 'o nome do arquivo precisa aparecer');
  assert.match(r, /href="https:\/\/trello\.com\/1\/cards\/699dd37\/attachments\/699dde7"/);
  assert.ok(!r.includes('](http'), 'a marcação crua não pode sobrar na tela');
});

test('link abre em outra aba sem dar carona para a página de origem', () => {
  // `noopener` impede que a página aberta mexa na aba do sistema.
  assert.match(F('[x](https://trello.com/a)'), /rel="noopener noreferrer"/);
  assert.match(F('[x](https://trello.com/a)'), /target="_blank"/);
});

test('o texto é escapado — é por aqui que entraria script', () => {
  const r = F('<img src=x onerror="alert(1)">');
  assert.ok(!/<img/i.test(r), 'HTML de fora não pode ser executado');
  assert.match(r, /&lt;img/);
});

test('o escape vem ANTES de montar o link, não depois', () => {
  // Montar o link primeiro e escapar depois destruiria o próprio link; fazer
  // só o link e não escapar deixa o furo aberto. A ordem importa.
  const r = F('[<b>nome</b>](https://trello.com/a)');
  assert.ok(!/<b>/.test(r), 'o HTML dentro do nome do link também tem que ser escapado');
  assert.match(r, /href="https:\/\/trello\.com\/a"/, 'e o link continua funcionando');
});

test('URL solta e longa é encurtada para não esticar a coluna', () => {
  const longa = 'https://docs.google.com/document/d/1BkKNkrJ7EdVSW81fw8Nxmd2jexjTFhDPd/edit?usp=sharing';
  const r = F('veja ' + longa);
  assert.match(r, /…<\/a>/, 'a URL longa precisa aparecer cortada');
  assert.match(r, new RegExp(`href="${longa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
    'mas o endereço completo continua no link');
});

test('a quebra de linha do comentário é respeitada', () => {
  assert.match(F('linha um\nlinha dois'), /linha um<br>linha dois/);
});

test('a aba continua explicando quando ela vale', () => {
  assert.match(html, /O acompanhamento começa depois que o processo é protocolado/,
    'sem protocolo a aba precisa dizer por que está vazia');
  assert.match(html, /Registrar atualização enviada ao cliente/,
    'é esta a ação da aba: registrar o que foi avisado ao cliente');
});
