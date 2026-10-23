// Dois defeitos silenciosos, dos dois lados do funil.
//
// 1. E-MAIL DE FAMÍLIA — o lead novo era FUNDIDO no irmão. Lucas e Esdras
//    dividem esdrasabreu2015@gmail.com; quem chegasse depois sumia da fila.
//    Juntar duas pessoas é pior do que criar um lead a mais.
//
// 2. COMISSÃO DO SDR — o telefone era comparado como texto exato. "+1 407 555
//    0110" não casava com "+14075550110" e a comissão não saía. Dinheiro que o
//    SDR ganhou e não recebeu, sem ninguém ficar sabendo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { acharRepetido } = await import('../src/leads-entrada.js');

const auto = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');
const hoje = new Date().toISOString();
const lead = (x) => ({ id: 'l' + Math.random(), entrada: hoje, nome: '', telefone: '', email: '', ...x });

test('mesmo telefone é a mesma pessoa, em qualquer formato', () => {
  const ps = [lead({ nome: 'Maria', telefone: '(407) 555-0110' })];
  assert.equal(acharRepetido(ps, '+1 407 555 0110', ''), ps[0]);
});

test('e-mail de família NÃO funde dois irmãos', () => {
  // O caso real: os dois têm telefone, e os telefones são diferentes.
  const esdras = lead({ nome: 'Esdras', email: 'esdrasabreu2015@gmail.com', telefone: '+14071110000' });
  assert.equal(acharRepetido([esdras], '+14072220000', 'esdrasabreu2015@gmail.com'), null,
    'telefones diferentes com o mesmo e-mail são pessoas diferentes');
});

test('mas o e-mail continua valendo quando não há telefone para desmentir', () => {
  // É o caso comum: lead de formulário, sem telefone, voltando pelo mesmo e-mail.
  const antigo = lead({ nome: 'Maria', email: 'maria@gmail.com' });
  assert.equal(acharRepetido([antigo], '', 'maria@gmail.com'), antigo);
  const comTel = lead({ nome: 'Maria', email: 'maria@gmail.com', telefone: '+14071110000' });
  assert.equal(acharRepetido([comTel], '', 'maria@gmail.com'), comTel,
    'o novo não tem telefone: não há como dizer que é outra pessoa');
});

test('o telefone decide antes do e-mail', () => {
  const irmao = lead({ nome: 'Esdras', email: 'casa@gmail.com', telefone: '+14071110000' });
  const eu = lead({ nome: 'Lucas', email: 'casa@gmail.com', telefone: '+14072220000' });
  assert.equal(acharRepetido([irmao, eu], '+1 407 222 0000', 'casa@gmail.com'), eu);
});

test('lead antigo demais é oportunidade nova, não repetição', () => {
  const velho = lead({ nome: 'Maria', telefone: '+14071110000', entrada: '2020-01-01T00:00:00.000Z' });
  assert.equal(acharRepetido([velho], '+14071110000', ''), null);
});

test('a comissão do SDR casa o telefone pelos dígitos, não pelo texto', () => {
  const i = auto.indexOf('async function comissaoSdr');
  const corpo = auto.slice(i, auto.indexOf('\n}', auto.indexOf('if (n) { await salvar(K.pagar', i)));
  assert.match(corpo, /const fim = \(t\) => \{ const d = String\(t \|\| ''\)\.replace\(\/\\D\/g, ''\); return d\.length >= 8 \? d\.slice\(-8\) : ''; \}/);
  assert.match(corpo, /telsRecuperados\.has\(fim\(c\.telefone\)\)/);
  assert.ok(!/l\.telefone === c\.telefone/.test(corpo), 'comparação de texto exato não pode voltar');
});

test('lead recuperado sem telefone é avisado, não some calado', () => {
  const i = auto.indexOf('async function comissaoSdr');
  const corpo = auto.slice(i, i + 1800);
  assert.match(corpo, /const semTelefone = recuperados\.filter\(l => !fim\(l\.telefone\)\)/);
  assert.match(corpo, /lead\(s\) recuperado\(s\) sem telefone não podem ser casados com contrato/,
    'o SDR precisa saber que trabalhou e não vai receber por aquele');
  assert.match(corpo, /semTelefone\.slice\(0, 5\)\.map\(l => l\.nome \|\| l\.id\)/, 'com os nomes, para dar para arrumar');
});
