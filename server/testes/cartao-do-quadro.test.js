// Ela escolheu a versão compacta do cartão, depois de ver as três lado a lado.
//
// A medição que levou a isso: 40% de todo o texto do sistema está abaixo de
// 12px, e nos cartões o rótulo e o valor saíam os dois no mesmo cinza — então
// "Responsável: Ana" tinha as duas palavras com o mesmo peso e o olho não
// sabia onde pousar.
//
// O que NÃO mudou, de propósito: as etapas dos quadros, os campos mostrados e
// as ações. Foi a condição que ela deu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DIR = new URL('../../docs/', import.meta.url);
const QUADROS = ['sdr.html', 'funil-comercial.html', 'documentos.html', 'contratos.html'];
const ler = (a) => readFileSync(new URL(a, DIR), 'utf8');

function regra(html, classe) {
  const m = new RegExp('\\.' + classe + '\\{([^}]*)\\}').exec(html);
  return m ? m[1] : null;
}

test('nenhum texto de cartão fica abaixo de 12px', () => {
  // É o mínimo que ela aprovou. Abaixo disso a equipe não lê sem esforço, e
  // são oito horas por dia nisso.
  const ruins = [];
  for (const arq of QUADROS) {
    const html = ler(arq);
    for (const classe of ['card-name', 'card-meta', 'card-tent', 'card-motivo', 'card-data', 'card-owner', 'card-next', 'card-alert', 'card-perda']) {
      const r = regra(html, classe);
      if (!r) continue;
      const m = /font-size:\s*([\d.]+)px/.exec(r);
      if (m && Number(m[1]) < 12) ruins.push(`${arq} .${classe} = ${m[1]}px`);
    }
  }
  assert.deepEqual(ruins, []);
});

test('o valor pesa mais que o rótulo', () => {
  // O achado que mudou o cartão. Sem isto, a pessoa lê cinco linhas inteiras
  // para achar um número; com isto, ela varre só a coluna dos valores.
  for (const arq of QUADROS) {
    const html = ler(arq);
    assert.match(html, /\.card-meta b[^{]*\{[^}]*color:var\(--ink\)/,
      arq + ': falta destacar o valor dentro do metadado');
  }
});

test('o nome no cartão não usa a serifada', () => {
  // A Fraunces identifica a PÁGINA. Repetida em cada cartão, compete com o
  // dado e cansa a leitura de uma coluna com centenas de registros.
  for (const arq of QUADROS) {
    const r = regra(ler(arq), 'card-name');
    assert.ok(r, arq + ': não achei .card-name');
    assert.doesNotMatch(r, /Fraunces/, arq + ': a serifada fica no título da página');
    assert.match(r, /font-size:14px/, arq + ': o nome do cartão é 14px');
  }
});

test('nenhum botão de destaque DENTRO do cartão', () => {
  // Com dois botões magenta por cartão e quatorze cartões na coluna, o
  // destaque deixa de destacar. A ação principal é da tela, não do cartão.
  for (const arq of QUADROS) {
    const html = ler(arq);
    for (const m of html.matchAll(/class="card[" ][\s\S]{0,2600}?<\/div>`/g)) {
      const achou = /class="[^"]*\b(?:primary|gold)\b/.exec(m[0]);
      assert.ok(!achou, `${arq}: botão em destaque dentro do cartão`);
    }
  }
});

test('as etapas dos quadros continuam intactas', () => {
  // A condição que ela deu: "sem mudar as etapas dos funis que o pessoal já
  // desenhou". Este teste é o que garante que uma mudança de layout não
  // encostou nelas.
  const doc = ler('documentos.html');
  const m = /let ETAPAS = \[([\s\S]*?)\];/.exec(doc);
  assert.ok(m, 'não achei as etapas da documentação');
  const etapas = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.equal(etapas.length, 11);
  assert.ok(etapas.includes('Recebendo documentos'));
  assert.ok(etapas.includes('Biometria'));

  const funil = /let ETAPAS = \[([\s\S]*?)\];/.exec(ler('funil-comercial.html'));
  const comercial = [...funil[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(comercial,
    ['Lead Assumido', 'Contato realizado', 'Reunião agendada', 'Negociação/Fechamento', 'Ganho']);
});
