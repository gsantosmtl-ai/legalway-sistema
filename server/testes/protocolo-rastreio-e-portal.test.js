// §2: rastreamento do envio, anexo do protocolo, e o que o cliente vê.
//
// A pergunta mais comum depois de protocolar é "onde está meu processo" — e a
// resposta tem duas partes: o número do USCIS (que já existia) e o número de
// RASTREAMENTO do envio, que não existia em lugar nenhum e vivia no WhatsApp
// de quem despachou.
//
// A regra que atravessa tudo aqui é dela: "o portal deve utilizar a mesma
// fonte de dados do Funil de Documentos, sem manter registros paralelos."

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const portalJs = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const portalHtml = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');
const corpoDe = (fonte, de, ate) => {
  const i = fonte.indexOf(de);
  assert.ok(i >= 0, 'não achei: ' + de);
  return fonte.slice(i, fonte.indexOf(ate, i));
};
const semComent = (t) => t.replace(/^\s*\/\/.*$/gm, '');

test('o rastreamento tem campo, e fica na ficha do serviço', () => {
  // A ficha já é POR SERVIÇO: num contrato com dois serviços, cada um tem a
  // sua, então cada um tem o seu rastreamento sem nenhum trabalho extra.
  assert.match(tela, /id="pr-rastreio"/);
  const h = semComent(corpoDe(tela, 'async function salvarMarcos(', '\n}\n'));
  assert.match(h, /p\.protocolo = \{ \.\.\.\(p\.protocolo \|\| \{\}\), rastreio: rastreio \|\| null/);
  assert.match(h, /rastreioEm: now\(\)\.toISOString\(\), rastreioPor:/,
    'quando e quem — senão não dá para auditar depois');
});

test('mexer no rastreamento não apaga os números do USCIS', () => {
  // São campos vizinhos no mesmo objeto. Um spread descuidado aqui levaria
  // junto o recibo, e com ele o acompanhamento automático do caso.
  const h = semComent(corpoDe(tela, 'async function salvarMarcos(', '\n}\n'));
  const i = h.indexOf('rastreio: rastreio || null');
  const linha = h.slice(h.lastIndexOf('p.protocolo', 0 + i), h.indexOf('\n', i));
  assert.ok(!/recibos:/.test(linha), 'o bloco do rastreamento não pode escrever nos recibos');
  assert.match(h, /\.\.\.\(p\.protocolo \|\| \{\}\)/, 'e preserva o que já existe');
});

test('só entra no histórico quando mudou', () => {
  const h = semComent(corpoDe(tela, 'async function salvarMarcos(', '\n}\n'));
  assert.match(h, /if\(rastreio !== rastreioAntes\)\{/);
});

test('o anexo do protocolo é o MESMO arquivo da ficha', () => {
  // Nada de segunda cópia para o portal. A marcação é uma flag no anexo que
  // já está lá.
  assert.match(tela, /data-anexo-protocolo/);
  const h = semComent(corpoDe(tela, "body.querySelectorAll('[data-anexo-protocolo]')", '\n    });'));
  assert.match(h, /a\.doProtocolo = cx\.checked/);
  // Reencontrado pela URL, não pelo índice: a tela se redesenha sozinha quando
  // alguém grava, e o índice de agora pode ser de outro arquivo num segundo.
  assert.match(h, /x\.url === marca \|\| x\.arquivoId === marca/);
  assert.match(h, /a\.doProtocolo = !cx\.checked; toast\('NÃO gravei/,
    'falha na gravação tem que desfazer na tela');
});

test('nenhum anexo vai para o cliente sem a marcação explícita', () => {
  // Anexo de ficha contém documento interno. Liberar por engano é vazar.
  const h = semComent(corpoDe(portalJs, 'visao.protocolo = {', '};'));
  assert.match(h, /\.filter\(\(a\) => a && a\.doProtocolo\)/);
  assert.ok(!/p\.anexos\.map/.test(h), 'não pode mandar a lista inteira');
});

test('o portal recebe TODOS os números, não só o principal', () => {
  const h = corpoDe(portalJs, 'visao.protocolo = {', '};');
  assert.match(h, /recibos: recibosDoProcesso\(p\)/);
  assert.match(h, /rastreio: p\.protocolo\.rastreio \|\| ''/);
});

test('o portal continua respeitando a permissão de ver o protocolo', () => {
  // A liberação por anexo não pode furar a chave geral do escritório.
  assert.match(portalJs, /if \(P\.mostrarUscis !== false && p\.protocolo\)/);
});

test('a tela do cliente mostra os dois números, o rastreio e os anexos', () => {
  const h = corpoDe(portalHtml, 'window.__detalheProtocolo', '; return ');
  assert.match(h, /pr\.recibos \|\| \[\]/);
  assert.match(h, /pr\.recibo \? \[\{form:'', numero: pr\.recibo\}\] : \[\]/,
    'ficha antiga, com um número só, não pode ficar sem mostrar nada');
  assert.match(h, /Rastreamento do envio/);
  assert.match(h, /Documentos do protocolo/);
  assert.match(h, /esc\(x\.nome\)/, 'nome de arquivo é texto de gente: tem que ser escapado');
});

test('o portal já mandava o checklist, e continua mandando', () => {
  // §2 pede a aba Checklist no portal. Ela existe desde antes; o que faltava
  // era o protocolo completo.
  assert.match(portalJs, /checklist,/);
  assert.match(portalJs, /resumo: \{\s*total: checklist\.length/);
  assert.match(portalHtml, /Seus documentos/);
});

// ---------------------------------------------------------------------------
// O comprovante de envio, junto do rastreamento.
//
// "aqui no tracker number quero adicionar a foto da postagem do comprovante de
// envio". A foto é a prova física de que o processo saiu, e a pergunta é feita
// ali — então ela vive ali.
test('o comprovante entra na lista de anexos da ficha, não num lugar novo', () => {
  // Guardar uma segunda cópia só para esta tela criaria um lugar que ninguém
  // mais sabe que existe, e que o portal e os relatórios não enxergam.
  const h = semComent(corpoDe(tela, 'async function anexarComprovante(', '\n}\n'));
  assert.match(h, /p\.anexos\.push\(/);
  assert.match(h, /doRastreio: true, doProtocolo: true/,
    'doRastreio para reaparecer aqui, doProtocolo para o cliente ver no portal');
});

test('o comprovante respeita os tipos aceitos', () => {
  const h = semComent(corpoDe(tela, 'async function anexarComprovante(', '\n}\n'));
  assert.match(h, /TIPOS_ACEITOS\.test\(tipo\)/);
  assert.match(tela, /id="pr-comprovante"[^>]*accept="image\/\*,application\/pdf"/);
});

test('falha ao gravar desfaz na tela', () => {
  // Comprovante que some em silêncio é pior do que comprovante não anexado:
  // ela acha que registrou e o processo segue sem prova de envio.
  const h = semComent(corpoDe(tela, 'async function anexarComprovante(', '\n}\n'));
  assert.match(h, /p\.anexos\.splice\(p\.anexos\.length - entraram\.length, entraram\.length\)/);
  assert.match(h, /NÃO anexei o comprovante/);
});

test('tirar o comprovante NÃO apaga o arquivo', () => {
  // Apagar arquivo de cliente nunca pode ser efeito colateral de um botão
  // pequeno. Ele só deixa de ser comprovante; segue nos anexos da ficha.
  const h = semComent(corpoDe(tela, 'async function tirarComprovante(', '\n}\n'));
  assert.match(h, /delete a\.doRastreio; delete a\.doProtocolo;/);
  assert.ok(!/anexos\.splice/.test(h), 'não pode remover da lista');
  assert.match(h, /LW\.confirmar/, 'e pergunta antes');
  assert.match(h, /segue nos anexos/, 'o histórico diz que o arquivo ficou');
});

test('o comprovante é reencontrado pela URL, não pelo índice', () => {
  // A tela se redesenha sozinha quando alguém grava; o índice de agora pode
  // ser de outro arquivo num segundo. Mesma lição da transferência de anexo.
  const h = semComent(corpoDe(tela, 'async function tirarComprovante(', '\n}\n'));
  assert.match(h, /a\.url === marca \|\| a\.arquivoId === marca/);
});

test('o comprovante aparece ao lado do rastreamento', () => {
  const bloco = corpoDe(tela, 'id="pr-rastreio"', 'Biometria marcada');
  assert.match(bloco, /id="comprovantes-envio"/);
  assert.match(bloco, /Anexar comprovante de envio/);
});
