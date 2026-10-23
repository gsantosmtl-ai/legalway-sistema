// "Chat — menu lateral fica pela metade, tem que aparecer tudo."
//
// Não era CSS. A tela do Chat declarava o PRÓPRIO `renderSidebar`, com cinco
// links — Dashboard, Tarefas, Documentação, Contratos, Financeiro — por cima
// da função compartilhada de comum.js, que tem o menu inteiro e respeita
// permissão. Quem abria o Chat perdia o caminho para Funil, SDR, Agenda,
// Clientes, Processos e o resto, e precisava voltar pelo Dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../../docs/', import.meta.url);
const comum = readFileSync(new URL('assets/comum.js', dir), 'utf8');
const chat = readFileSync(new URL('chat.html', dir), 'utf8');

function corpoDe(fonte, assinatura) {
  const ini = fonte.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return fonte.slice(ini, fim);
}

test('o Chat não tem mais um menu próprio', () => {
  assert.equal(chat.indexOf('function renderSidebar('), -1,
    'declarar renderSidebar na tela sobrescreve o menu compartilhado');
  assert.match(chat, /LW\.menuLateral\(\)/, 'usa o menu de todas as telas');
});

test('nenhuma tela monta a própria lista de itens do menu', () => {
  // A regra que fecha o buraco de vez: existe UMA lista, em comum.js. Toda
  // cópia envelhece — foi o que aconteceu duas vezes. O Chat ficou com cinco
  // links; a Entrada de Leads, com dezesseis dos dezessete, sem "Caixa de
  // entrada", que entrou no menu depois de a cópia ser feita.
  //
  // O Dashboard está de fora porque as suas listas são os cartões da tela,
  // não o menu lateral.
  const compartilhado = (corpoDe(comum, 'function renderSidebar(').match(/href:'/g) || []).length;
  assert.ok(compartilhado >= 15, `o menu compartilhado tem ${compartilhado} itens`);
  const culpadas = [];
  for (const arq of readdirSync(dir).filter(f => f.endsWith('.html'))) {
    if (arq === 'index.html') continue;
    const html = readFileSync(new URL(arq, dir), 'utf8');
    const i = html.indexOf('function renderSidebar(');
    if (i < 0) continue;
    const corpo = corpoDe(html, 'function renderSidebar(');
    const proprios = (corpo.match(/href:'/g) || []).length;
    if (proprios) culpadas.push(`${arq} (${proprios} itens próprios)`);
  }
  assert.deepEqual(culpadas, [], 'telas com lista de menu própria: ' + culpadas.join(', '));
});

test('o contador de leads sem responsável sobreviveu à remoção da cópia', () => {
  const entrada = readFileSync(new URL('entrada-leads.html', dir), 'utf8');
  const corpo = corpoDe(entrada, 'function renderSidebar(');
  assert.match(corpo, /LW\.menuLateral\(/, 'usa o menu compartilhado');
  assert.match(corpo, /'entrada-leads\.html': leads\.filter\(l=>!l\.responsavel\)\.length/,
    'e passa o contador que era o único motivo da cópia existir');
});

// Roda o menu compartilhado de verdade e confere o que ele desenha.
function desenharMenu(sessao, pagina, contadores) {
  const nav = { innerHTML: '', insertAdjacentHTML(_, h) { this.innerHTML += h; } };
  const ctx = {
    LW: { sessaoAtual: () => sessao },
    location: { pathname: '/' + pagina },
    document: { getElementById: (id) => id === 'side-nav' ? nav : null },
    window: {},
  };
  vm.createContext(ctx);
  // svgIcon e ICONS vivem fora da função; para este teste o ícone não importa.
  new vm.Script('function svgIcon(){return "";}\n'
    + corpoDe(comum, 'function renderSidebar(')
    + `\nrenderSidebar(${JSON.stringify(contadores || null)});`).runInContext(ctx);
  return nav.innerHTML;
}

test('o menu traz o sistema inteiro, não cinco telas', () => {
  const html = desenharMenu({ nome: 'Tatiane', permissoes: {} }, 'chat.html');
  for (const destino of ['funil-comercial.html', 'sdr.html', 'agenda.html', 'clientes.html',
                         'processos.html', 'relatorios.html', 'usuarios.html', 'configuracoes.html']) {
    assert.match(html, new RegExp(destino.replace('.', '\\.')), `faltou ${destino} no menu`);
  }
});

test('o menu continua escondendo o que a pessoa não pode ver', () => {
  // o conserto não pode ter custado a permissão
  const html = desenharMenu({ nome: 'Renato', permissoes: { financeiro: 'nenhum', usuarios: 'nenhum' } }, 'chat.html');
  assert.doesNotMatch(html, /financeiro\.html/, 'o Renato não vê o Financeiro');
  assert.doesNotMatch(html, /usuarios\.html/);
  assert.match(html, /funil-comercial\.html/, 'mas vê o funil dele');
});

test('o menu desenha o contador quando recebe um', () => {
  // o selo era o único motivo de a Entrada de Leads ter a cópia do menu;
  // se ele parar de aparecer, a remoção da cópia custou uma função
  const html = desenharMenu({ nome: 'Tatiane', permissoes: {} }, 'entrada-leads.html',
    { 'entrada-leads.html': 7 });
  assert.match(html, /<span class="badge">7<\/span>/);
  // e não espalha o número nos outros itens
  assert.equal((html.match(/class="badge"/g) || []).length, 1);
});

test('sem contador o menu sai limpo', () => {
  const html = desenharMenu({ nome: 'Tatiane', permissoes: {} }, 'chat.html');
  assert.doesNotMatch(html, /class="badge"/);
});

test('contador zero não desenha selo vazio', () => {
  const html = desenharMenu({ nome: 'Tatiane', permissoes: {} }, 'entrada-leads.html',
    { 'entrada-leads.html': 0 });
  assert.doesNotMatch(html, /class="badge"/, 'nenhum lead sem responsável: nada a mostrar');
});

test('o rodapé com quem está logado continua no Chat', () => {
  // o Chat não tem a barra de cima onde isso aparece nas outras telas
  const corpo = corpoDe(chat, 'function renderMenuDoChat()');
  assert.match(corpo, /Logado como/);
  assert.match(corpo, /insertAdjacentHTML/, 'acrescenta ao menu, não substitui');
});
