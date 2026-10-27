// O indicador que pede ação carrega a cor do estado.
//
// "Nenhuma informação em destaque", "tudo opaco", "falta destaque".
// A crítica de design apontou a causa exata: as cores semânticas existem e
// estão certas, mas aparecem em doses pequenas demais — um ícone de 20px e um
// número. Numa faixa de seis cartões brancos iguais, isso não orienta ninguém.
//
// A regra: o indicador que representa um ESTADO que exige ação ganha o fundo
// daquele estado. "Atrasadas", "Sem retorno do cliente", "Na fila agora" param
// de parecer iguais a "Processos ativos".
//
// E o limite, que é o que impede isto de virar o mesmo problema com mais
// tinta: contagem neutra, total, meta e ticket médio NÃO ganham cor. Se todos
// ganharem, nenhum se destaca.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const ler = (f) => readFileSync(join(DOCS, f), 'utf8');
const padrao = ler('assets/padrao.css');

test('o padrão define os três tons de indicador', () => {
  for (const [classe, fundo] of [
    ['lw-alerta', '--red-bg'], ['lw-espera', '--amber-bg'], ['lw-ok', '--green-tag-bg'],
  ]) {
    assert.match(padrao, new RegExp(`\\.kpi-card\\.${classe}[^{]*\\{[^}]*background:var\\(${fundo}\\)`),
      `falta o tom ${classe}`);
  }
});

test('indicador zerado volta a ser branco', () => {
  // Fila vazia é boa notícia. Um "Atrasadas: 0" em fundo vermelho ensina a
  // ignorar o vermelho.
  assert.match(padrao, /\.lw-zero[^{]*\{[^}]*background:#fff/,
    'zero não pode alarmar');
  for (const f of ['tarefas.html', 'sdr.html', 'documentos.html']) {
    assert.match(ler(f), /lw-zero/, `${f} precisa neutralizar o indicador zerado`);
  }
});

test('Tarefas pinta atrasado, hoje e concluído — e deixa "Ativas" neutro', () => {
  const s = ler('tarefas.html');
  const i = s.indexOf('const cards = [');
  const bloco = s.slice(i, s.indexOf('];', i));
  assert.match(bloco, /lbl:'Atrasadas',\s*tom:'lw-alerta'/);
  assert.match(bloco, /lbl:'Pra hoje',\s*tom:'lw-espera'/);
  assert.match(bloco, /lbl:'Concluídas essa semana',\s*tom:'lw-ok'/);
  const ativas = bloco.slice(bloco.indexOf("lbl:'Ativas'") - 120, bloco.indexOf("lbl:'Ativas'") + 20);
  assert.ok(!/tom:/.test(ativas), '"Ativas" é contagem neutra e não pode ganhar cor');
});

test('a Documentação pinta o cartão inteiro, não só o número', () => {
  const s = ler('documentos.html');
  assert.match(s, /\.kpi-card\.alerta\{[^}]*background:var\(--red-bg\)/,
    'o alerta pintava só o número de 18px — some numa faixa de seis cartões brancos');
  assert.match(s, /\.kpi-card\.espera\{[^}]*background:var\(--amber-bg\)/);
});

test('nem todos os indicadores ganham cor', () => {
  // O teste que impede o remédio de virar a doença: se todos pintam, nenhum
  // se destaca. Conta só onde o cartão é DESENHADO — contar no arquivo
  // inteiro pegaria as próprias regras de CSS junto.
  const onde = {
    'tarefas.html': "kpi-strip').innerHTML",
    'documentos.html': "kpi-strip').innerHTML",
    'sdr.html': "sdr-kpi-strip').innerHTML",
  };
  for (const [f, ancora] of Object.entries(onde)) {
    const s = ler(f);
    const i = s.indexOf(ancora);
    assert.ok(i > 0, `${f}: não achei onde a faixa é desenhada`);
    const bloco = s.slice(i, i + 2600);
    const cartoes = (bloco.match(/class="(?:sdr-)?kpi-card/g) || []).length;
    const comCor = (bloco.match(/lw-alerta|lw-espera|lw-ok|kpi-card alerta|kpi-card espera/g) || []).length;
    assert.ok(cartoes > 0, `${f}: não encontrei cartões no bloco`);
    assert.ok(comCor < cartoes,
      `${f}: ${comCor} de ${cartoes} cartões com cor — tem que sobrar cartão neutro`);
  }
});
