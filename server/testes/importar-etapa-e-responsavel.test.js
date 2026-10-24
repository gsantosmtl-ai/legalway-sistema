// Reimportar os dados novos do Kommo, do Bling, da Meta e do Trello.
//
// O importador lia nome, telefone, e-mail, serviço, origem e campanha — e
// jogava fora as duas colunas que mais importam numa migração de CRM: em que
// ETAPA o lead está e de quem ele É. Todo lead importado caía em "sem
// responsável", na entrada de leads, e o funil chegava achatado. Para o Kommo
// isso significa perder exatamente o mapeamento de etapas que foi o trabalho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tela = readFileSync(new URL('../../docs/importar.html', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const ini = tela.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = tela.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < tela.length; i++) { if (tela[i] === '{') nivel++; else if (tela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return tela.slice(ini, fim);
}

// Roda o mapeamento de colunas de verdade, com o cabeçalho que cada sistema exporta.
function mapear(cabecalho) {
  const ctx = {};
  vm.createContext(ctx);
  const ini = tela.indexOf('const semAcentoCol =');
  const fim = tela.indexOf('let csvLinhas', ini);
  new vm.Script(tela.slice(ini, fim) + `\nvar r = JSON.stringify(mapearColunas(${JSON.stringify(cabecalho)}));`).runInContext(ctx);
  return JSON.parse(ctx.r);
}

test('o cabeçalho do Kommo é reconhecido, etapa e responsável inclusive', () => {
  const m = mapear(['Nome', 'Telefone', 'E-mail', 'Etapa', 'Responsável', 'Origem']);
  assert.ok(m.nome !== undefined && m.telefone !== undefined && m.email !== undefined);
  assert.ok(m.etapa !== undefined, 'sem a etapa, o funil chega achatado');
  assert.ok(m.responsavel !== undefined, 'sem o responsável, todo lead cai em "sem dono"');
});

test('os nomes que o Trello e o Bling usam também', () => {
  const trello = mapear(['Card Name', 'List', 'Members']);
  assert.ok(trello.etapa !== undefined, 'no Trello a etapa é a lista');
  assert.ok(trello.responsavel !== undefined, 'e o responsável é o membro');
  const bling = mapear(['Nome Fantasia', 'Fone', 'E-mail', 'Vendedor']);
  assert.ok(bling.nome !== undefined && bling.telefone !== undefined);
  assert.ok(bling.responsavel !== undefined);
});

test('"vendedor" é responsável, não campanha', () => {
  // estava na lista de campanha, junto com "anúncio" e "categoria": o nome do
  // vendedor ia parar no campo de campanha do lead
  const m = mapear(['Nome', 'Vendedor']);
  assert.ok(m.responsavel !== undefined);
  assert.equal(m.campanha, undefined);
});

test('existe destino para o funil, não só entrada de leads e clientes', () => {
  assert.match(tela, /<option value="funil">/);
  assert.match(tela, /tipo === 'funil' \? 'legalway-funil-v1'/);
});

// A etapa da planilha contra as etapas de verdade do escritório.
function casarEtapa(texto, etapas) {
  const ctx = { ETAPAS_FUNIL: etapas };
  vm.createContext(ctx);
  // Recorta SÓ as duas funções. Ir até `let novos` arrastava junto um `await`
  // do meio da importação, e um Script simples não aceita await solto.
  const ini = tela.indexOf('const semAcento = x =>');
  const marca = tela.indexOf('|| null;', ini);
  const fim = tela.indexOf('};', marca) + 2;
  assert.ok(ini > 0 && fim > ini, 'não achei acharEtapa');
  new vm.Script(tela.slice(ini, fim) + `\nvar r = JSON.stringify(acharEtapa(${JSON.stringify(texto)}));`).runInContext(ctx);
  return JSON.parse(ctx.r);
}

const ETAPAS = ['Lead Assumido', 'Contato realizado', 'Reunião agendada', 'Negociação/Fechamento', 'Ganho'];

test('a etapa casa mesmo escrita sem acento ou com outra caixa', () => {
  assert.equal(casarEtapa('REUNIÃO AGENDADA', ETAPAS), 'Reunião agendada');
  assert.equal(casarEtapa('reuniao agendada', ETAPAS), 'Reunião agendada');
  assert.equal(casarEtapa('Negociação/Fechamento', ETAPAS), 'Negociação/Fechamento');
});

test('etapa que não existe aqui não inventa coluna no quadro', () => {
  assert.equal(casarEtapa('Aguardando documentos do despachante', ETAPAS), null,
    'inventar etapa encheria o funil de coluna que ninguém usa');
  assert.equal(casarEtapa('', ETAPAS), null);
});

test('o lead importado para o funil guarda o responsável e de onde veio', () => {
  const i = tela.indexOf("} else if(tipo === 'funil'){");
  const corpo = tela.slice(i, tela.indexOf('} else {', i));
  assert.match(corpo, /vendedor: responsavel \|\| ''/, 'o dono vem da planilha');
  assert.match(corpo, /etapa: etapa \|\| ETAPAS_FUNIL\[0\]/, 'e a etapa também, com queda para a primeira');
  assert.match(corpo, /etapa na origem/, 'o que vinha escrito fica no histórico');
});

test('o responsável da planilha chega na entrada de leads', () => {
  const i = tela.indexOf("if(tipo === 'leads'){");
  const corpo = tela.slice(i, tela.indexOf("} else if(tipo === 'funil')", i));
  assert.match(corpo, /responsavel: responsavel \|\| null/);
  assert.doesNotMatch(corpo, /responsavel: null,/, 'era sempre nulo, e o dono ia para o lixo');
});

test('a planilha de exemplo mostra as colunas novas', () => {
  // é por ela que a pessoa descobre o que pode mandar
  const i = tela.indexOf("const csv = 'nome,");
  const trecho = tela.slice(i, i + 400);
  assert.match(trecho, /responsavel/);
  assert.match(trecho, /etapa/);
});
