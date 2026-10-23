// "Alteração funil comercial: Lead Assumido · Contato realizado · Reunião
// agendada · Negociação/Fechamento · Ganho · Perda."
//
// Nove etapas viraram cinco mais a perda. As que saíram descreviam o esforço do
// vendedor ("Tentativa de contato", "Qualificação", "Reunião realizada",
// "Proposta"), e não o lugar do lead — um parado em "Proposta" e outro em
// "Negociação" são a mesma conversa para quem olha o quadro.
//
// O risco real da mudança não é o nome: é o lead que fica numa etapa que não
// existe mais e some da vista. Não some do banco, mas ninguém procura o que não
// sabe que falta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const regras = readFileSync(new URL('../src/regras.js', import.meta.url), 'utf8');
const funil = readFileSync(new URL('../../docs/funil-comercial.html', import.meta.url), 'utf8');

const NOVAS = ['Lead Assumido', 'Contato realizado', 'Reunião agendada', 'Negociação/Fechamento', 'Ganho'];

test('as etapas são as que ela pediu, nessa ordem', () => {
  assert.match(regras, /etapas: \['Lead Assumido', 'Contato realizado', 'Reunião agendada', 'Negociação\/Fechamento', 'Ganho'\]/,
    'a lista padrão precisa ser a nova');
  assert.match(regras, /etapaPerdido: 'Perda'/, 'a coluna de perda agora se chama Perda');
  assert.match(funil, /let ETAPAS = \['Lead Assumido','Contato realizado','Reunião agendada','Negociação\/Fechamento','Ganho'\]/,
    'a tela precisa nascer com a lista nova, para o caso de as Regras não carregarem');
  assert.match(funil, /let ETAPA_PERDIDO = 'Perda'/);
});

test('cada etapa que saiu tem para onde ir', () => {
  const i = funil.indexOf('const ETAPAS_QUE_SAIRAM = {');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(funil.slice(i, funil.indexOf('};', i) + 2) + '\nglobalThis.m = ETAPAS_QUE_SAIRAM;', ctx);
  const m = ctx.m;
  const esperado = {
    'Tentativa de contato': 'Lead Assumido',
    'Qualificação': 'Contato realizado',
    'Reunião realizada': 'Negociação/Fechamento',
    'Proposta': 'Negociação/Fechamento',
    'Negociação': 'Negociação/Fechamento',
    'Lead assumido': 'Lead Assumido',
    'Perdido': 'Perda',
  };
  for (const [de, para] of Object.entries(esperado)) {
    assert.equal(m[de], para, `"${de}" precisa ir para "${para}"`);
  }
  // E todo destino tem de existir de verdade.
  for (const para of Object.values(m)) {
    assert.ok(NOVAS.includes(para) || para === 'Perda', `"${para}" não é uma etapa do funil novo`);
  }
});

test('a migração move, registra no histórico e avisa', () => {
  const i = funil.indexOf('function migrarEtapasQueSairam()');
  const corpo = funil.slice(i, funil.indexOf('\n}\n', i));
  assert.match(corpo, /if\(!l \|\| validas\.has\(l\.etapa\)\) continue;/, 'quem já está certo não é tocado');
  assert.match(corpo, /if\(!destino \|\| !validas\.has\(destino\)\) continue;/,
    'destino que não existe não pode ser aplicado');
  assert.match(corpo, /texto: `Etapa "\$\{l\.etapa\}" saiu do funil — movido para "\$\{destino\}"\.`/,
    'cada lead movido tem que dizer de onde veio');
  assert.match(corpo, /if\(mudou\) toast\(/, 'ela precisa saber quantos se mexeram');
  // Roda antes do primeiro desenho e aproveita a gravação que já existia.
  assert.match(funil, /migrarEtapasQueSairam\(\);\s*\n\s*await saveLeads\(\);/,
    'migra e grava junto, sem uma gravação a mais');
});

test('lead em etapa desconhecida ganha coluna em vez de sumir', () => {
  // A migração cobre o que eu sei; o quadro cobre o que eu não sei.
  const i = funil.indexOf('const orfas =');
  assert.ok(i > 0, 'falta a rede de segurança');
  const trecho = funil.slice(i, i + 300);
  assert.match(trecho, /leads\.map\(l=> l && l\.etapa\)\.filter\(e=> e && !colunas\.includes\(e\)\)/,
    'qualquer etapa fora das colunas precisa virar coluna');
  assert.match(trecho, /if\(orfas\.length\) colunas\.push\(\.\.\.orfas\)/, 'e entrar no fim do quadro');
});

test('o servidor entende os dois nomes da perda', () => {
  // Os leads gravados antes de hoje têm "Perdido". Tratar só "Perda" faria o
  // follow-up comercial cobrar gente que já disse não.
  const automacoes = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');
  const avisos = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');
  assert.match(automacoes, /new Set\(\[R\.funil\.etapaGanho, R\.funil\.etapaPerdido, 'Ganho', 'Perdido', 'Perda'\]\)/,
    'o resumo do vendedor precisa pular as duas');
  assert.match(avisos, /'Ganho', 'Fechado', 'Perdido', 'Perda', 'Cancelado', 'Arquivado'/,
    'o follow-up comercial também');
});
