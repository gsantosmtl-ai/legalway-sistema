// "Tem cliente antigo que ainda está em fases muito iniciais."
//
// Era a linha mais apagada do cartão — 12px, cinza, embaixo do nome do
// escritório — e é o dado que ela olha primeiro. No quadro real: 69 fichas em
// "Aguardando boas-vindas", com gente de 6 e 7 meses de casa.
//
// A cor não sai de um prazo inventado. Ela perguntada respondeu "não sei", e
// tinha razão — eu tinha perguntado sem mostrar número nenhum. Então a coluna
// se compara com ela mesma. E depois de "Protocolado" nada ganha cor: ali quem
// demora é o USCIS, e um quadro que acusa o escritório à toa deixa de ser lido.

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

const ETAPAS = JSON.parse(
  '[' + html.slice(html.indexOf('let ETAPAS = ['), html.indexOf('];', html.indexOf('let ETAPAS = [')))
    .replace('let ETAPAS = [', '').replace(/'/g, '"').replace(/,\s*$/, '') + ']',
);

const ctx = createContext({ Math, Number, Date, Array, String, Infinity, ETAPAS, dataDoCard: (p) => p.assinadoEm });
runInContext(
  html.match(/const ETAPA_DO_GOVERNO = [^\n]+/)[0] + '\n'
  + html.match(/const MINIMO_PRA_COMPARAR = [^\n]+/)[0] + '\n'
  + corpo('diasDeCasa') + '\n' + corpo('percentil') + '\n' + corpo('cortesDaColuna')
  + '\nglobalThis.API = { diasDeCasa, cortesDaColuna };', ctx);
const { diasDeCasa, cortesDaColuna } = ctx.API;

const haDias = (n) => ({ assinadoEm: new Date(Date.now() - n * 86400000).toISOString() });
const coluna = (...dias) => dias.map(haDias);

test('as etapas do governo não pintam o tempo de ninguém', () => {
  const muitos = coluna(10, 50, 100, 200, 300, 400, 500, 600);
  for (const etapa of ['Protocolado', 'I-797', 'Biometria', 'Em acompanhamento', 'Documento finalizado']) {
    assert.equal(cortesDaColuna(etapa, muitos), null,
      `${etapa} vem depois do protocolo: a espera é do USCIS, não do escritório`);
  }
});

test('as etapas que o escritório controla pintam', () => {
  const muitos = coluna(5, 10, 20, 40, 80, 160, 320);
  for (const etapa of ['Aguardando boas-vindas', 'Documentos solicitados',
    'Recebendo documentos', 'Documentação completa', 'Aguardando autorização financeira']) {
    assert.ok(cortesDaColuna(etapa, muitos), `${etapa} é fila do escritório`);
  }
});

test('coluna pequena não ganha cor — "o mais antigo de três" não é notícia', () => {
  assert.equal(cortesDaColuna('Aguardando boas-vindas', coluna(10, 200, 400)), null);
  assert.equal(cortesDaColuna('Aguardando boas-vindas', coluna(10, 20, 30, 40, 50)), null, 'cinco ainda é pouco');
  assert.ok(cortesDaColuna('Aguardando boas-vindas', coluna(10, 20, 30, 40, 50, 60)), 'seis já dá');
});

test('o corte marca os mais antigos, e não a coluna inteira', () => {
  // dez fichas: 10..100 dias
  const dias = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const c = cortesDaColuna('Recebendo documentos', coluna(...dias));
  const emAmbar = dias.filter((d) => d >= c.amarelo && d < c.vermelho).length;
  const emVermelho = dias.filter((d) => d >= c.vermelho).length;
  assert.ok(emVermelho >= 1 && emVermelho <= 2, `vermelho pegou ${emVermelho} de 10`);
  assert.ok(emAmbar + emVermelho <= 4, `cor demais: ${emAmbar + emVermelho} de 10 — etiqueta em tudo é etiqueta em nada`);
  assert.ok(dias.filter((d) => d < c.amarelo).length >= 6, 'a maioria tem que ficar neutra');
});

test('ficha sem data não entra na conta nem quebra', () => {
  assert.equal(diasDeCasa({}), null);
  const c = cortesDaColuna('Recebendo documentos', [...coluna(10, 20, 30, 40, 50, 60), {}, {}]);
  assert.ok(c && Number.isFinite(c.amarelo), 'as sem data saem da conta, as outras continuam valendo');
});

test('data no futuro não vira tempo negativo', () => {
  assert.equal(diasDeCasa(haDias(-5)), null);
});

test('o cartão mostra o tempo com peso, não como rodapé cinza', () => {
  assert.match(html, /\.card-tempo\{[^}]*font-weight:600/, 'o tempo precisa ter peso');
  assert.match(html, /\.card-tempo\.muito\{\s*color:var\(--red\)/);
  assert.match(html, /\.card-tempo\.atencao\{\s*color:var\(--amber\)/);
  assert.match(html, /cortesDaColunaAtual/, 'o card lê o corte calculado para a coluna dele');
});

test('as cores do tempo são as mesmas do resto do sistema', () => {
  const i = html.indexOf('.card-tempo{');
  const bloco = html.slice(i, i + 600);
  assert.ok(!/#[0-9A-Fa-f]{6}/.test(bloco), 'cor crua aqui é como o verde ganhou dois tons');
});
