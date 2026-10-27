// Telefone se compara pelos ÚLTIMOS OITO dígitos, em todo lugar.
//
// O mesmo celular chega escrito de cinco jeitos: "+55 12 99797-5194",
// "12997975194", "(12) 99797-5194", com e sem código do país. Comparar o
// número inteiro faz cada grafia virar um cliente novo — e cliente duplicado
// parte o histórico em dois.
//
// A regra já existia (`LW.fimDoTelefone` no navegador, `fim()` no servidor) e
// o comentário dela conta o preço: "já custaram comissão de SDR não paga e
// ficha de cliente não encontrada".
//
// A tela de IMPORTAÇÃO tinha ficado de fora: detectava duplicata pelo número
// inteiro. É a mesma classe do gerador de id e do dia em UTC — a regra certa
// existe, e uma cópia antiga sobreviveu num arquivo que ninguém olhou.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const docs = new URL('../../docs/', import.meta.url);
const srv = new URL('../src/', import.meta.url);
const semComent = (t) => t.replace(/^\s*\/\/.*$/gm, '');
const fim = (t) => { const d = String(t ?? '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : ''; };

const GRAFIAS = ['+55 12 99797-5194', '12997975194', '(12) 99797-5194',
                 '55 12 997975194', '997975194'];

test('cinco grafias do mesmo celular dão UMA chave', () => {
  assert.equal(new Set(GRAFIAS.map(fim)).size, 1);
  // E a prova do contrário: comparar o número inteiro daria três clientes.
  assert.equal(new Set(GRAFIAS.map((g) => g.replace(/\D/g, ''))).size, 3);
});

test('número curto demais não vira chave', () => {
  // Sete dígitos ou menos casaria com gente demais. Melhor não casar nada.
  for (const curto of ['1234567', '123', '', null, undefined, 'abc']) {
    assert.equal(fim(curto), '', JSON.stringify(curto));
  }
  assert.equal(fim('12345678'), '12345678', 'oito já serve');
});

test('as duas pontas usam a mesma regra, letra por letra', () => {
  const comum = readFileSync(new URL('assets/comum.js', docs), 'utf8');
  const i = comum.indexOf('window.LW.fimDoTelefone');
  const noNavegador = comum.slice(i, comum.indexOf('\n', i));
  assert.match(noNavegador, /d\.length >= 8 \? d\.slice\(-8\) : ''/);
  for (const f of ['automacoes.js', 'caixa-entrada.js']) {
    const fonte = readFileSync(new URL(f, srv), 'utf8');
    assert.match(fonte, /d\.length >= 8 \? d\.slice\(-8\) : ''/, f + ' divergiu');
  }
});

test('a importação detecta duplicata pelos oito, não pelo número inteiro', () => {
  const imp = semComent(readFileSync(new URL('importar.html', docs), 'utf8'));
  assert.match(imp, /LW\.fimDoTelefone\(x\.telefone\)/, 'na lista do que já existe');
  assert.match(imp, /const chaveTel = LW\.fimDoTelefone\(tel\)/, 'e na linha que chega');
  assert.ok(!/jaTem = new Set\(atuais\.flatMap\(x => \[String\(x\.telefone\|\|''\)\.replace/.test(imp),
    'a comparação pelo número inteiro não pode voltar');
});

test('nenhuma tela monta chave de DUPLICATA com o telefone inteiro', () => {
  // Link de WhatsApp precisa do número cheio e está certo — o que não pode é
  // o número cheio virar critério de "é a mesma pessoa".
  const culpadas = [];
  for (const f of readdirSync(docs)) {
    if (!f.endsWith('.html')) continue;
    const fonte = semComent(readFileSync(new URL(f, docs), 'utf8'));
    for (const linha of fonte.split('\n')) {
      if (!/telefone/i.test(linha) || !/replace\(\/\\D\/g/.test(linha)) continue;
      if (/wa\.me|href=|tel:|whatsapp/i.test(linha)) continue;          // link: pode
      if (/includes\(qd\)|busca|pesquisa/i.test(linha)) continue;        // busca: pode
      if (/fimDoTelefone|slice\(-8\)/.test(linha)) continue;             // já usa a regra
      culpadas.push(f + ': ' + linha.trim().slice(0, 70));
    }
  }
  assert.deepEqual(culpadas, [], 'telefone inteiro como chave em:\n' + culpadas.join('\n'));
});
