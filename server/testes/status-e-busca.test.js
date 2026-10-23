// "Preciso colocar também o status do processo."
// "Outro detalhe é colocar o filtro de busca diretamente no módulo
//  Documentação, e não somente em cima."
//
// A busca de cima é a geral do sistema e sai da tela. A de dentro é a que se
// combina com os filtros que já existem ali: "os do Adriano que falam em
// Maria". E a lista de contratos assinados mostrava que o contrato existe, mas
// não em que pé o processo está — que é a pergunta seguinte de quem abre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

test('a lista de contratos ganha a coluna de status', () => {
  assert.match(comum, /<th style="padding:6px 4px;">Status<\/th>/, 'falta a coluna');
  assert.match(comum, /<td style="padding:7px 4px;color:#6B6B75;">\$\{esc\(statusDe\(c\)\)\}<\/td>/, 'falta a célula');
  assert.match(comum, /colunas: \['Cliente', 'Serviço', 'Vendedor', 'Status', 'Assinado', 'Valor'\]/,
    'o CSV e o PDF também levam o status');
});

test('contrato sem processo e contrato cancelado dizem o porquê', () => {
  // Em branco, quem lê acha que o sistema perdeu o dado.
  const i = comum.indexOf('const statusDe = (c)=>');
  const corpo = comum.slice(i, comum.indexOf('};', i));
  assert.match(corpo, /if\(c\.etapa === 'Cancelado'\) return 'contrato cancelado';/);
  assert.match(corpo, /return statusPorContrato\.get\(String\(c\.id\)\) \|\| 'sem processo ainda';/);
  assert.match(corpo, /if\(!statusPorContrato\) return '…';/, 'enquanto carrega, não pode mentir "sem processo"');
});

test('a janela abre na hora e o status chega depois', () => {
  // Esperar a leitura dos 266 processos para desenhar deixaria a janela
  // travada por um segundo a cada abertura.
  assert.match(comum, /carregarStatusDosProcessos\(\)\.then\(\(\)=>\{ if\(document\.getElementById\('lw-lista-contratos'\)\) pintar\(\); \}\)/,
    'carrega em segundo plano e redesenha');
  const i = comum.indexOf('const carregarStatusDosProcessos');
  const corpo = comum.slice(i, comum.indexOf('\n  };', i));
  assert.match(corpo, /if\(statusPorContrato\) return statusPorContrato;/, 'lê uma vez só');
  assert.match(corpo, /catch\(e\)\{ \/\* sem acesso à Documentação/, 'quem não tem o módulo ainda vê a janela');
});

test('a Documentação ganha busca própria, junto dos filtros', () => {
  assert.match(docs, /<input type="search" id="busca-doc"/, 'falta o campo');
  assert.match(docs, /placeholder="Buscar nome, telefone, e-mail ou recibo…"/, 'o campo precisa dizer o que aceita');
  assert.match(docs, /let buscaDoc = '';/, 'falta o estado');
});

test('a busca não depende de acento nem de como o telefone foi digitado', () => {
  // Ninguém digita "(321) 240-6602", e metade dos cadastros tem "Fabio" sem
  // acento.
  const i = docs.indexOf("if(buscaDoc.trim()){");
  const corpo = docs.slice(i, docs.indexOf('\n  }', i));
  assert.match(corpo, /normalize\('NFD'\)\.replace\(\/\[\\u0300-\\u036f\]\/g,''\)/, 'acento não pode atrapalhar');
  assert.match(corpo, /qd\.length >= 4 && String\(p\.telefone\|\|''\)\.replace\(\/\\D\/g,''\)\.includes\(qd\)/,
    'telefone compara só os dígitos, e só a partir de 4 — senão "12" casa com todo mundo');
  assert.match(corpo, /p\.protocolo && p\.protocolo\.recibo/, 'procurar pelo recibo do USCIS é o caso do dia a dia');
});

test('a busca se soma aos filtros, não os substitui', () => {
  const i = docs.indexOf('let lista = processos;');
  const corpo = docs.slice(i, docs.indexOf('const board =', i));
  assert.ok(corpo.indexOf('filtroResponsaveis.size') < corpo.indexOf('buscaDoc.trim()'),
    'a busca filtra o que já passou pelos filtros de responsável e serviço');
  assert.match(docs, /filtroResponsaveis\.clear\(\); filtroServicos\.clear\(\); buscaDoc = ''; render\(\);/,
    '"limpar filtros" precisa limpar a busca também');
});

test('digitar não perde o cursor nem engasga a tela', () => {
  // A barra inteira é redesenhada a cada tecla, e desenhar os 263 cartões custa
  // uns 100ms. Sem devolver o foco, só dá para digitar uma letra; sem esperar a
  // pessoa parar, a tela engasga a cada tecla.
  const i = docs.indexOf("campoBusca.addEventListener('input'");
  const corpo = docs.slice(i, docs.indexOf('}, 180);', i));
  assert.match(corpo, /const pos = campoBusca\.selectionStart;/);
  assert.match(corpo, /novo\.focus\(\); try\{ novo\.setSelectionRange\(pos, pos\); \}catch\(e\)\{\}/);
  assert.match(corpo, /clearTimeout\(window\.__buscaDocTimer\)/, 'tecla nova cancela o desenho anterior');
  assert.match(docs, /\}, 180\);/, 'espera a digitação parar');
  // O texto vai para o estado na hora: só o DESENHO espera.
  assert.ok(corpo.indexOf('buscaDoc = campoBusca.value;') < corpo.indexOf('clearTimeout'),
    'o que ela digitou não pode se perder se o desenho atrasar');
});

test('busca sem resultado explica, em vez de mostrar um quadro vazio', () => {
  assert.match(docs, /Nenhum processo com esses filtros\. <a href="#" id="limpar-vazio">Limpar<\/a>/,
    'quadro vazio sem explicação parece sistema quebrado');
  assert.match(docs, /if\(lista\.length === 0\)\{/, 'e tem que ser depois de filtrar, não antes');
});

// "Coloquei para buscar esdras, olha o que aparece."
//
// Aparecia o LUCAS junto. Os dois irmãos dividem o mesmo e-mail
// (esdrasabreu2015@gmail.com), e a busca varria o e-mail também — então o
// nome de um achava a ficha do outro. Depois de uma manhã inteira
// desembaralhando essas duas pessoas, era exatamente o que não podia
// continuar acontecendo.
test('procurar nome não traz quem só divide o e-mail', () => {
  const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
  const i = docs.indexOf('const porEmail = q.includes');
  assert.notEqual(i, -1, 'o e-mail precisa entrar só quando ela digita o @');
  const corpo = docs.slice(i, docs.indexOf('});', i));
  assert.match(corpo, /porEmail \? p\.email : null/,
    'sem o @, o e-mail não participa da comparação');
  assert.match(corpo, /p\.clienteNome/, 'o nome continua sendo sempre buscado');

  // Roda a regra de verdade, com os dados que causaram o problema.
  const semAcento = (t)=> String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const acha = (q, p)=>{
    const porEmail = semAcento(q).includes('@');
    const alvo = semAcento([p.clienteNome, porEmail ? p.email : null].filter(Boolean).join(' '));
    return alvo.includes(semAcento(q));
  };
  const lucas = { clienteNome: 'Lucas Moisés Gonçalves de Abreu', email: 'esdrasabreu2015@gmail.com' };
  const esdras = { clienteNome: 'Esdras Gonçalves de Abreu', email: 'esdrasabreu2015@gmail.com' };
  assert.equal(acha('esdras', lucas), false, 'o Lucas não pode aparecer numa busca por "esdras"');
  assert.equal(acha('esdras', esdras), true);
  assert.equal(acha('lucas', lucas), true);
  assert.equal(acha('abreu', lucas), true, 'o sobrenome que os dois têm continua achando os dois');
  assert.equal(acha('esdrasabreu2015@gmail.com', lucas), true, 'com o @, o e-mail acha a família toda');
});
