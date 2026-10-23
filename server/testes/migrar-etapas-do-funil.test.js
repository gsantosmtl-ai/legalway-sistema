// "Tem que atualizar do jeito que eu quero."
//
// Ela tem razão, e o erro foi de desenho meu. As regras do escritório ficam
// gravadas no banco: trocar o padrão no código não muda o que já está salvo.
// Eu troquei as nove etapas por cinco, a tela continuou com as nove — porque
// eram as dela que valiam — e eu respondi pedindo que ela reescrevesse a lista
// à mão. Era empurrar para a pessoa um trabalho que é do sistema.
//
// Agora o servidor migra sozinho, com uma regra estreita: só mexe no que está
// EXATAMENTE igual ao padrão antigo. Lista customizada não é tocada — quem
// escreveu as próprias etapas decidiu, e decisão de gente não se sobrescreve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { migrarRegrasSalvas, REGRAS_PADRAO } = await import('../src/regras.js');

const ANTIGO = ['Lead assumido', 'Tentativa de contato', 'Contato realizado', 'Qualificação',
  'Reunião agendada', 'Reunião realizada', 'Proposta', 'Negociação', 'Ganho'];
const NOVO = ['Lead Assumido', 'Contato realizado', 'Reunião agendada', 'Negociação/Fechamento', 'Ganho'];

test('a lista antiga vira a nova', () => {
  const { regras, mudou } = migrarRegrasSalvas({ funil: { etapas: ANTIGO, etapaPerdido: 'Perdido' } });
  assert.equal(mudou, true);
  assert.deepEqual(regras.funil.etapas, NOVO);
  assert.equal(regras.funil.etapaPerdido, 'Perda');
});

test('o que ela personalizou não é tocado', () => {
  // Os motivos de perda dela — Nacionalidade com africano/haitiano, Achou caro,
  // Foi com outro escritório — são trabalho dela. Restaurar o padrão da seção
  // apagaria tudo isso; por isso a migração mexe só nas etapas.
  const motivos = [{ motivo: 'Nacionalidade', opcoes: 'africano, haitiano, outras', meta: true },
                   { motivo: 'Achou caro', opcoes: '', meta: false }];
  const { regras } = migrarRegrasSalvas({
    funil: { etapas: ANTIGO, etapaPerdido: 'Perdido', motivosPerda: motivos, diasLeadParado: 5 },
    empresa: { nome: 'Legal Way Group' },
  });
  assert.deepEqual(regras.funil.motivosPerda, motivos);
  assert.equal(regras.funil.diasLeadParado, 5);
  assert.deepEqual(regras.empresa, { nome: 'Legal Way Group' });
});

test('lista própria do escritório fica como está', () => {
  // Um dia alguém escreve as etapas que quer. Nesse dia a migração não pode
  // passar por cima.
  const propria = ['Entrou', 'Falei', 'Fechou'];
  const { regras, mudou } = migrarRegrasSalvas({ funil: { etapas: propria, etapaPerdido: 'Perdido' } });
  assert.equal(mudou, false);
  assert.deepEqual(regras.funil.etapas, propria);
  assert.equal(regras.funil.etapaPerdido, 'Perdido', 'sem mexer nas etapas, a perda também não muda');
});

test('quase igual não é igual', () => {
  // Uma etapa a mais, uma a menos, ou na outra ordem: é escolha de alguém.
  for (const quase of [
    ANTIGO.slice(0, 8),
    ANTIGO.concat(['Pós-venda']),
    [ANTIGO[1], ...ANTIGO.slice(2), ANTIGO[0]],
    ANTIGO.map(e => e.toUpperCase()),
  ]) {
    assert.equal(migrarRegrasSalvas({ funil: { etapas: quase } }).mudou, false,
      `"${quase.join(' | ')}" não é a lista padrão antiga`);
  }
});

test('migrar duas vezes não faz nada na segunda', () => {
  const um = migrarRegrasSalvas({ funil: { etapas: ANTIGO, etapaPerdido: 'Perdido' } });
  const dois = migrarRegrasSalvas(um.regras);
  assert.equal(dois.mudou, false, 'já migrado não migra de novo');
  assert.deepEqual(dois.regras.funil.etapas, NOVO);
});

test('regras vazias ou estranhas não quebram', () => {
  for (const v of [null, undefined, {}, { funil: null }, { funil: {} }, 'texto', 42, []]) {
    const r = migrarRegrasSalvas(v);
    assert.equal(r.mudou, false);
    assert.equal(r.regras, v, 'devolve o que recebeu, sem inventar');
  }
});

test('o destino é o padrão de hoje, não uma lista escrita duas vezes', () => {
  // Se a lista padrão mudar de novo, a migração acompanha sozinha.
  const { regras } = migrarRegrasSalvas({ funil: { etapas: ANTIGO } });
  assert.deepEqual(regras.funil.etapas, REGRAS_PADRAO.funil.etapas);
  assert.notEqual(regras.funil.etapas, REGRAS_PADRAO.funil.etapas,
    'tem que ser uma cópia — senão mexer nas regras do escritório mexeria no padrão');
});

test('a migração é gravada, e falhar ao gravar não deixa a tela errada', () => {
  const src = readFileSync(new URL('../src/regras.js', import.meta.url), 'utf8');
  const i = src.indexOf('export async function obterRegras()');
  const corpo = src.slice(i, src.indexOf('\n}', i));
  assert.match(corpo, /await gravar\(CHAVE_REGRAS, salvas, r \? r\.versao : null, 'migração: etapas do funil'\)/,
    'precisa gravar para ficar no histórico de alterações');
  assert.match(corpo, /catch \(e\) \{ console\.error/, 'falha de gravação não pode derrubar a leitura');
  const iCache = corpo.indexOf('cache = {');
  const iGravar = corpo.indexOf('await gravar(');
  assert.ok(iGravar < iCache, 'a regra migrada vale nesta passagem mesmo se a gravação falhar');
});
