// Em 21/10/2026 um lead cadastrado na Entrada "sumiu": a gravação falhou, o catch
// estava vazio, e a tela disse "cadastrado". Eram 28 pontos com o mesmo padrão.
//
// Este teste não prova que gravar funciona — prova que, quando NÃO funcionar,
// alguém fica sabendo. É um guarda de padrão, e é de propósito: o erro não foi
// de lógica, foi de hábito, e hábito volta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DOCS = new URL('../../docs/', import.meta.url).pathname;
const telas = readdirSync(DOCS).filter(f => f.endsWith('.html'));

test('nenhuma tela engole o erro de window.storage.set', () => {
  const culpados = [];
  for (const tela of telas) {
    const src = readFileSync(join(DOCS, tela), 'utf8');
    const re = /window\.storage\.set\(([^;]*);\s*\}\s*catch\s*\(\w*\)\s*\{\s*\}/g;
    for (const m of src.matchAll(re)) {
      // shared:false é localStorage deste navegador — conveniência, não dado do escritório.
      // Perder não apaga nada no servidor, então engolir ali é aceitável.
      if (/,\s*false\s*\)\s*$/.test(m[1].trim())) continue;
      const linha = src.slice(0, m.index).split('\n').length;
      culpados.push(`${tela}:${linha}`);
    }
  }
  assert.deepEqual(culpados, [],
    'gravação com catch vazio — use LW.gravar, que devolve o erro e avisa na tela:\n  ' + culpados.join('\n  '));
});

test('LW.gravar existe e avisa quando falha', () => {
  const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url).pathname, 'utf8');
  assert.match(comum, /window\.LW\.gravar\s*=\s*async function/, 'LW.gravar sumiu do comum.js');
  assert.match(comum, /window\.LW\.avisarFalhaGravacao\s*=\s*function/, 'o aviso de falha sumiu');
  // o caminho de erro tem que devolver a mensagem, não null — é o que o chamador testa
  const corpo = comum.slice(comum.indexOf('window.LW.gravar = async function'),
                            comum.indexOf('window.LW.avisarFalhaGravacao = function'));
  assert.match(corpo, /return msg;/, 'LW.gravar precisa devolver a mensagem do erro');
  assert.match(corpo, /return null;/, 'LW.gravar precisa devolver null quando dá certo');
});
