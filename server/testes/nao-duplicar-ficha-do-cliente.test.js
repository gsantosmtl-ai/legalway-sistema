// A automação que criou a bagunça da família Abreu.
//
// Ao assinar um contrato, ela cria a ficha na Documentação. Só perguntava
// "este contrato já tem processo?" — nunca "esta pessoa já tem ficha?". Então:
// o Lucas tinha a ficha dele vinda do Trello, assinou dois contratos, e ficou
// com TRÊS fichas. Duas em branco, e os 17 documentos do irmão foram parar
// numa delas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { fichaDoMesmoCliente, outraFichaDaPessoa } = await import('../src/automacoes.js');

const ficha = (x) => ({ id: 'p' + Math.random(), clienteNome: '', telefone: '', email: '', contratoId: null, ...x });

test('acha pelo telefone, ignorando o formato', () => {
  // "(646) 804-1407" e "+16468041407" são a mesma pessoa.
  const ps = [ficha({ clienteNome: 'Jose', telefone: '(646) 804-1407' })];
  const r = fichaDoMesmoCliente(ps, { cliente: 'Anselmo Ribeiro', telefone: '+1 646 804 1407' });
  assert.equal(r.por, 'telefone');
  assert.equal(r.ficha, ps[0]);
});

test('telefone curto demais não serve de identidade', () => {
  const ps = [ficha({ clienteNome: 'A', telefone: '1407' })];
  assert.equal(fichaDoMesmoCliente(ps, { cliente: 'B', telefone: '1407' }), null);
});

test('acha pelo e-mail quando não há telefone', () => {
  const ps = [ficha({ clienteNome: 'Maria', email: 'Maria@Gmail.com' })];
  const r = fichaDoMesmoCliente(ps, { cliente: 'Maria Silva', email: 'maria@gmail.com' });
  assert.equal(r.por, 'e-mail');
});

test('acha pelo nome exato, sem tropeçar em acento', () => {
  const ps = [ficha({ clienteNome: 'Lucas Guimarães de Abreu' })];
  const r = fichaDoMesmoCliente(ps, { cliente: 'LUCAS GUIMARAES DE ABREU' });
  assert.equal(r.por, 'nome');
});

test('IRMÃOS não podem casar — é o caso Abreu', () => {
  // Mesmo sobrenome, mesmo e-mail da família, pessoas diferentes.
  const ps = [ficha({ clienteNome: 'Elias Guimarães de Abreu' })];
  assert.equal(fichaDoMesmoCliente(ps, { cliente: 'Lucas Guimarães de Abreu' }), null,
    'nome parecido não é a mesma pessoa');
});

test('e-mail de família casa — e por isso o telefone vem antes', () => {
  // Lucas e Elias dividem familia.abreu@exemplo.com. Se os dois tiverem
  // telefone, é o telefone que decide.
  const doElias = ficha({ clienteNome: 'Elias', email: 'casa@gmail.com', telefone: '+14071110000' });
  const doLucas = ficha({ clienteNome: 'Lucas', email: 'casa@gmail.com', telefone: '+14072220000' });
  const r = fichaDoMesmoCliente([doElias, doLucas], { cliente: 'Lucas', email: 'casa@gmail.com', telefone: '+1 407 222 0000' });
  assert.equal(r.ficha, doLucas, 'o telefone desempata antes de o e-mail confundir');
});

test('ficha que JÁ tem contrato não é adotada', () => {
  // Senão o segundo contrato da pessoa roubaria a ficha do primeiro.
  const ps = [ficha({ clienteNome: 'Maria', telefone: '+14071110000', contratoId: 'c1' })];
  assert.equal(fichaDoMesmoCliente(ps, { cliente: 'Maria', telefone: '+14071110000' }), null);
});

test('ficha pausada ou cancelada não é adotada', () => {
  const ps = [ficha({ clienteNome: 'Maria', telefone: '+14071110000', situacao: 'cancelado' })];
  assert.equal(fichaDoMesmoCliente(ps, { cliente: 'Maria', telefone: '+14071110000' }), null,
    'ficha encerrada não volta à vida por causa de um contrato novo');
});

test('dois órfãos com o mesmo nome: não escolhe no chute', () => {
  const ps = [ficha({ clienteNome: 'Maria Silva' }), ficha({ clienteNome: 'Maria Silva' })];
  assert.equal(fichaDoMesmoCliente(ps, { cliente: 'Maria Silva' }), null,
    'melhor criar uma ficha a mais do que colar o contrato na pessoa errada');
});

test('avisa quando a pessoa já tem outra ficha com contrato', () => {
  // O caso dos dois contratos do Lucas. Pode ser legítimo (dois vistos) ou o
  // mesmo caso em duplicata — quem decide é gente, mas não pode passar calado.
  const antiga = ficha({ clienteNome: 'Lucas', telefone: '+14072220000', contratoId: 'c1', servico: 'Visto T', status: 'Protocolado' });
  const nova = ficha({ clienteNome: 'Lucas', telefone: '+14072220000', contratoId: 'c2' });
  const r = outraFichaDaPessoa([antiga, nova], { cliente: 'Lucas', telefone: '+14072220000' }, nova);
  assert.equal(r, antiga);
  assert.equal(outraFichaDaPessoa([nova], { cliente: 'Lucas', telefone: '+14072220000' }, nova), null,
    'não pode achar a si mesma');
});
