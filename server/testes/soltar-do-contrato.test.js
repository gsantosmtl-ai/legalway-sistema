// "Não tem nada protocolado dele."
//
// A ficha do Lucas Moisés mostrava 3 processos, um deles PROTOCOLADO com 17
// anexos. Ele não tinha nada protocolado: aquela ficha era de outra pessoa e
// só aparecia ali porque ficou presa a um contrato DELE.
//
// Unificar não resolve — unificar junta os documentos de duas pessoas, que é
// exatamente o que não pode acontecer. Faltava desfazer o vínculo, e não havia
// nada na tela que mostrasse esse vínculo, muito menos que o soltasse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const i = docs.indexOf(assinatura);
  assert.notEqual(i, -1, 'não achei ' + assinatura);
  let n = 0;
  for (let k = docs.indexOf('{', i); k < docs.length; k++) {
    if (docs[k] === '{') n++;
    else if (docs[k] === '}') { n--; if (n === 0) return docs.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham');
}

test('a ficha diz a que contrato está presa', () => {
  const corpo = corpoDe('function contratoDaFicha(p)');
  assert.match(corpo, /Ligada ao contrato de/);
  assert.match(corpo, /Esta ficha não está ligada a nenhum contrato/,
    'sem contrato também é informação — é o caso das fichas do Trello');
  assert.match(corpo, /contrato que não existe mais/, 'contrato apagado não pode virar tela em branco');
  assert.match(corpo, /podeVerValores\(\)/, 'o valor do contrato só para quem pode ver valores');
});

test('contrato no nome de outra pessoa é avisado', () => {
  const corpo = corpoDe('function contratoDaFicha(p)');
  assert.match(corpo, /const difere = c && nome && chaveDoNomeCliente\(nome\) !== chaveDoNomeCliente\(p\.clienteNome\|\|''\)/);
  assert.match(corpo, /O contrato está no nome de outra pessoa/);
  assert.match(corpo, /É por isso que esta ficha aparece na ficha de cliente dela/,
    'tem que explicar a consequência, senão o aviso não diz nada');
});

test('o botão existe e está na ficha', () => {
  assert.match(docs, /id="btn-desvincular"[^>]*>⛓️‍💥 Soltar deste contrato<\/button>/);
  assert.match(docs, /document\.getElementById\('btn-desvincular'\)\?\.addEventListener\('click', \(\)=> desvincularContrato\(p\.id\)\)/);
  assert.match(docs, /\$\{contratoDaFicha\(p\)\}/, 'o bloco precisa estar desenhado na gaveta');
});

// --------------------------------------------------- soltar de verdade
function palco() {
  const ctx = {
    now: () => new Date('2026-10-23T18:00:00Z'),
    sessao: { nome: 'Tatiane' }, console,
    render: () => {}, renderDrawer: () => {}, loadAll: async () => {},
    gravado: null, avisos: [],
    toast: (m) => ctx.avisos.push(m),
    saveProcessos: async () => { ctx.gravado = JSON.parse(JSON.stringify(ctx.processos)); return null; },
  };
  vm.createContext(ctx);
  vm.runInContext(corpoDe('async function desvincularContrato(id)'), ctx);
  return ctx;
}

const PROTOCOLADO = () => ({ id: 'p1', clienteNome: 'Esdras Gonçalves de Abreu', status: 'Protocolado',
  contratoId: 'cblmv42mzsvb6', checklist: [{ nome: 'Passaporte' }],
  anexos: Array.from({ length: 17 }, (_, i) => ({ id: 'a' + i })), historico: [{ texto: 'veio da automação' }] });

test('solta o vínculo e não encosta em mais nada', () => {
  return (async () => {
    const ctx = palco();
    ctx.processos = [PROTOCOLADO()];
    ctx.contratos = [{ id: 'cblmv42mzsvb6', cliente: 'Lucas Moisés Gonçalves de Abreu', valor: 4995 }];
    ctx.LW = { confirmar: async () => true };
    await ctx.desvincularContrato('p1');

    const g = ctx.gravado[0];
    assert.equal(g.contratoId, null, 'o vínculo sai');
    assert.equal(g.anexos.length, 17, 'os 17 anexos ficam onde estão');
    assert.equal(g.checklist.length, 1, 'o checklist também');
    assert.equal(g.status, 'Protocolado', 'a etapa não muda: soltar do contrato não desprotocola nada');
    assert.equal(g.clienteNome, 'Esdras Gonçalves de Abreu', 'e o nome continua o mesmo');
    assert.match(g.historico.at(-1).texto, /Solta do contrato cblmv42mzsvb6 \(de Lucas Moisés Gonçalves de Abreu\)/,
      'de qual contrato ela saiu tem que ficar registrado — senão não há como desfazer');
    assert.equal(g.historico.at(-1).quem, 'Tatiane');
  })();
});

test('não grava nada se ela disser que não', async () => {
  const ctx = palco();
  ctx.processos = [PROTOCOLADO()];
  ctx.contratos = [];
  ctx.LW = { confirmar: async () => false };
  await ctx.desvincularContrato('p1');
  assert.equal(ctx.gravado, null);
  assert.equal(ctx.processos[0].contratoId, 'cblmv42mzsvb6');
});

test('a lista trocada durante a pergunta não solta a ficha errada', async () => {
  // A mesma armadilha que apagou uma ficha na unificação: a pergunta é uma
  // espera, e nesse meio tempo o recarregamento troca os objetos.
  const ctx = palco();
  ctx.processos = [PROTOCOLADO()];
  ctx.contratos = [];
  ctx.LW = { confirmar: async () => { ctx.processos = [{ ...PROTOCOLADO(), contratoId: null }]; return true; } };
  await ctx.desvincularContrato('p1');
  assert.equal(ctx.gravado, null, 'já estava solta: não há o que gravar');
  assert.match(ctx.avisos.join(' '), /A lista mudou enquanto você confirmava/);
});

test('a confirmação diz o que NÃO vai acontecer', async () => {
  const corpo = corpoDe('async function desvincularContrato(id)');
  assert.match(corpo, /Nenhum documento, anexo ou histórico é alterado — só o vínculo/,
    'quem já perdeu uma ficha precisa ler isso antes de clicar');
  assert.match(corpo, /toast\('NÃO consegui soltar — ' \+ erro\)/);
  assert.match(corpo, /await loadAll\(\); render\(\)/, 'gravação que falha não pode deixar a tela mentindo');
});
