// Medido na produção em 30/10/2026, nas 134.680 mensagens do chat interno:
//
//   22.794x  "Seu funil hoje ⏳ Sem contato há mais de 3 dias (170)…"
//   18.728x  "Resumo do dia — contas a receber 🔴 Atrasadas (1)…"
//
// Sempre o MESMO texto. São resumos diários, e as automações rodam a cada
// minuto. A trava existia e nunca pegou.
//
// A causa: `legalway-avisos-enviados-v1` é o caderninho do "este aviso já saiu
// hoje" e estava gravado como `[]` — uma LISTA. `avisoDoDia` faz
// `avisos[chave] = hoje`, que num array vira propriedade solta; JSON.stringify
// de um array ignora propriedade e devolve `[]`. A marca morria na gravação.
//
// O bloco chegou à versão 106.099 gravando nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const i = fonte.indexOf(assinatura);
  assert.notEqual(i, -1, `não achei "${assinatura}"`);
  let nivel = 0;
  for (let k = fonte.indexOf('{', i); k < fonte.length; k++) {
    if (fonte[k] === '{') nivel++;
    else if (fonte[k] === '}' && --nivel === 0) return fonte.slice(i, k + 1);
  }
  throw new Error('chaves não fecharam');
}

// Roda o `bloco()` de verdade, com o que eu mandar que esteja gravado.
function rodarBloco(guardado, padrao) {
  const ctx = { ler: async () => (guardado === undefined ? null : { valor: guardado, versao: 7 }),
    console: { error() {} } };
  vm.createContext(ctx);
  vm.runInContext(corpoDe('async function bloco(chave, padrao') + '\nglobalThis.bloco = bloco;', ctx);
  return ctx.bloco('legalway-avisos-enviados-v1', padrao);
}

test('uma marca posta num ARRAY não sobrevive ao JSON — é a raiz do problema', () => {
  const a = [];
  a['comercial-diario'] = '2026-10-30';
  assert.equal(JSON.stringify(a), '[]');
  assert.equal(JSON.parse(JSON.stringify(a))['comercial-diario'], undefined,
    'é por isso que o resumo saía de novo a cada minuto');
});

test('quem espera objeto e recebe lista é corrigido', async () => {
  const r = await rodarBloco([], {});
  assert.ok(!Array.isArray(r.valor), 'a lista tem de virar objeto');
  assert.equal(typeof r.valor, 'object');
  r.valor['comercial-diario'] = '2026-10-30';
  assert.equal(JSON.parse(JSON.stringify(r.valor))['comercial-diario'], '2026-10-30',
    'agora a marca sobrevive à gravação');
});

test('a versão continua vindo, para a gravação não perder a base', async () => {
  const r = await rodarBloco([], {});
  assert.equal(r.versao, 7, 'perder a versão faria a gravação ser recusada ou sobrescrever');
});

test('quem espera lista e recebe objeto continua sendo corrigido', async () => {
  // A guarda que já existia, para o caso do "legalway-sdr-v1" que virou texto.
  const r = await rodarBloco({ a: 1 }, []);
  assert.ok(Array.isArray(r.valor));
});

test('objeto bom e lista boa passam intactos', async () => {
  const o = await rodarBloco({ 'financeiro-diario': '2026-10-29' }, {});
  assert.equal(o.valor['financeiro-diario'], '2026-10-29', 'não pode apagar o que já estava certo');
  const l = await rodarBloco([1, 2, 3], []);
  assert.deepEqual(l.valor, [1, 2, 3]);
});

test('bloco que não existe nasce com o padrão pedido', async () => {
  const r = await rodarBloco(undefined, {});
  assert.deepEqual(r.valor, {});
  assert.equal(r.versao, null);
});

test('a trava do dia continua sendo uma vez por dia', () => {
  const f = corpoDe('async function avisoDoDia(chave)');
  assert.match(f, /if \(avisos\[chave\] === h\) return false;/, 'a trava sumiu');
  assert.match(f, /avisos\[chave\] = h;/);
  assert.match(f, /await salvar\(K_AVISOS, avisos, versao\);/, 'sem gravar, a marca não vale nada');
});
