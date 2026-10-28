// Toda tela precisa ter JavaScript que o navegador consiga ler.
//
// Isto existe por causa de um erro meu que chegou à produção: a tela de
// Documentação abriu EM BRANCO para o escritório. Eu havia inserido a função
// `textoDoAcompanhamento` entre um `}` e o `else` de uma cadeia de if — e uma
// declaração de função nesse ponto é erro de sintaxe. O navegador para de ler
// o script inteiro, e a página fica vazia.
//
// Tínhamos 1.545 testes e nenhum pegou. Todos conferiam CONTEÚDO — se tal
// botão existe, se tal cor está certa, se tal campo aparece. Nenhum perguntava
// a coisa mais básica: isto aqui roda?
//
// Um erro de sintaxe não aparece no diff, não aparece em nenhum teste de
// conteúdo, e só se manifesta quando alguém abre a tela. É a classe de defeito
// mais barata de prevenir e mais cara de descobrir.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const telas = readdirSync(DOCS).filter((f) => f.endsWith('.html'));
const pasta = mkdtempSync(join(tmpdir(), 'lw-sintaxe-'));

// Os <script> da própria página. Os que têm src são arquivos à parte e são
// conferidos pelo teste de baixo.
function scriptsDe(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).filter((js) => js.trim());
}

function checar(codigo, nome) {
  const arq = join(pasta, nome);
  writeFileSync(arq, codigo, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', arq], { stdio: 'pipe' });
    return null;
  } catch (e) {
    const saida = String(e.stderr || e.stdout || e.message);
    // A primeira linha útil basta para achar o lugar.
    const linha = saida.split('\n').find((l) => /SyntaxError|Unexpected/.test(l)) || saida.slice(0, 160);
    return linha.trim();
  }
}

test('o JavaScript de toda tela é válido', () => {
  const quebradas = [];
  for (const f of telas) {
    const html = readFileSync(join(DOCS, f), 'utf8');
    scriptsDe(html).forEach((js, i) => {
      const erro = checar(js, `${f}.${i}.js`);
      if (erro) quebradas.push(`${f} (script ${i + 1}): ${erro}`);
    });
  }
  assert.deepEqual(quebradas, [],
    'tela com erro de sintaxe abre EM BRANCO — o navegador para de ler o script inteiro');
});

test('os arquivos de script compartilhados também', () => {
  const assets = join(DOCS, 'assets');
  const arquivos = readdirSync(assets).filter((f) => f.endsWith('.js'));
  assert.ok(arquivos.length >= 3, `só achei ${arquivos.length} arquivos em assets`);
  const quebrados = [];
  for (const f of arquivos) {
    const erro = checar(readFileSync(join(assets, f), 'utf8'), `asset-${f}`);
    if (erro) quebrados.push(`assets/${f}: ${erro}`);
  }
  assert.deepEqual(quebrados, [],
    'comum.js quebrado derruba TODAS as telas de uma vez');
});

// Aqui eu tinha escrito um terceiro teste, procurando por expressão regular a
// declaração de função entre `}` e `else` — o erro exato que derrubou a tela.
// Ele deu 62 falsos positivos: a expressão casava com qualquer `}` seguido de
// uma função e, muito depois, um `else` sem relação nenhuma.
//
// Tirei. Procurar estrutura de JavaScript com expressão regular é a ferramenta
// errada, e um teste que grita sem motivo ensina a ignorar teste. O
// `node --check` acima pega esse erro e qualquer outro de sintaxe, com o
// arquivo e a linha — que é o que importa.
