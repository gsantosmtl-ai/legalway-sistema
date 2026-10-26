// O recibo do USCIS se pergunta no I-797, não no Protocolado.
//
// A correção dela: "registrar protocolo é do Protocolado para I-797, que é
// quando a carta chega, e não no protocolado". O número do recibo vem impresso
// na carta I-797C, que o USCIS manda DEPOIS de receber o pedido. No instante
// de protocolar esse número ainda não existe — o campo pedia um dado que
// ninguém tinha, e o processo ficava registrado sem ele.
//
// O que NÃO mudou, de propósito: onde o recibo fica guardado. Continua em
// `protocolo.recibo`, porque é de lá que leem a consulta diária do USCIS, os
// avisos automáticos e o portal do cliente — 15 pontos no cliente e no
// servidor. Mover o campo de lugar no JSON seria migração de dado para
// resolver um problema de quando perguntar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
// Tira os comentários antes de cobrar o código. Sem isto, uma explicação que
// cite o campo faz o teste acusar o comentário que existe justamente para
// dizer que o campo NÃO é escrito ali.
const semComentarios = (t) => t.replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
const trecho = (de, ate) => {
  const i = tela.indexOf(de);
  assert.ok(i >= 0, 'não achei: ' + de);
  const f = tela.indexOf(ate, i);
  return tela.slice(i, f > i ? f : i + 4000);
};

test('o modal de protocolo não pede mais o recibo', () => {
  const modal = semComentarios(trecho('<div class="modal" id="modal-protocolo">', '</div>\n</div>'));
  assert.ok(!/id="pr-recibo"/.test(modal), 'o campo do recibo não pode estar no modal de protocolo');
  assert.match(modal, /id="pr-numero"/, 'o número do protocolo continua sendo pedido aqui');
});

test('não sobrou código mexendo no campo que deixou de existir', () => {
  // Um getElementById('pr-recibo').value numa referência morta joga TypeError
  // e o modal nem abre — a tela toda para no clique.
  assert.equal(tela.includes('pr-recibo'), false);
});

test('o recibo é pedido no bloco do I-797, com a dica de onde ele vem', () => {
  const bloco = trecho('id="i797-data"', 'btn-salvar-marcos');
  assert.match(bloco, /id="i797-recibo"/);
  assert.match(bloco, /I-797C/, 'tem que dizer que o número vem na carta');
});

test('editar o protocolo NÃO apaga o recibo de quem já tem', () => {
  // Este é o estrago silencioso. O spread antigo tinha `recibo: recibo || null`:
  // com o campo fora do modal, `recibo` seria sempre vazio e toda edição de
  // data ou observação zeraria o número — e com ele a consulta ao USCIS do
  // cliente, sem ninguém perceber.
  const h = semComentarios(trecho("document.getElementById('confirm-pr')", '\n});'));
  assert.match(h, /p\.protocolo = \{ \.\.\.\(p\.protocolo\|\|\{\}\), numero, data:/);
  assert.ok(!/recibo:/.test(h), 'o handler do protocolo não pode escrever no recibo');
  assert.ok(!/pr-recibo/.test(h));
});

test('salvarMarcos grava o recibo em protocolo.recibo, onde todo mundo lê', () => {
  const h = trecho('async function salvarMarcos(', '\n}\n');
  assert.match(h, /i797-recibo/);
  assert.match(h, /p\.protocolo = \{ \.\.\.\(p\.protocolo \|\| \{\}\), recibo: recibo \|\| null \}/);
  assert.match(h, /RE_RECIBO\.test\(recibo\)/, 'recibo malformado tem que ser recusado antes de gravar');
});

test('o recibo também move a ficha para I-797', () => {
  // Quem digitou o número tem a carta na mão, mesmo sem preencher a data.
  const h = trecho('async function salvarMarcos(', '\n}\n');
  assert.match(h, /else if\(i797 \|\| recibo\) andarPara\('I-797'\)/);
});

test('se a gravação falhar, o recibo volta ao que era', () => {
  // O desfazer restaurava só i797 e biometria. Sem o protocolo na lista, uma
  // falha de rede deixava a tela mostrando um recibo que não foi salvo.
  const h = trecho('async function salvarMarcos(', '\n}\n');
  assert.match(h, /const antes = \{ i797: p\.i797, biometria: p\.biometria, protocolo: p\.protocolo/);
  assert.match(h, /p\.protocolo = antes\.protocolo/);
});

test('a consulta ao USCIS só dispara depois de gravar', () => {
  const h = trecho('async function salvarMarcos(', '\n}\n');
  const iGravou = h.indexOf('await saveProcessos()');
  const iConsulta = h.indexOf('consultarUscis(');
  assert.ok(iGravou > 0 && iConsulta > iGravou,
    'perguntar ao USCIS por um recibo que não ficou salvo deixa um status órfão na ficha');
});

test('recibo novo zera o status velho do USCIS', () => {
  // O status guardado era de outro caso; mantê-lo mostraria ao cliente o
  // andamento do processo errado.
  const h = trecho('async function salvarMarcos(', '\n}\n');
  assert.match(h, /p\.uscis = null/);
});

test('o servidor continua lendo o recibo do mesmo lugar', () => {
  // Se algum dia alguém mover o campo no JSON, estes quebram junto — que é o
  // aviso que se quer.
  for (const arq of ['../src/uscis.js', '../src/avisos-automaticos.js', '../src/portal-cliente.js']) {
    const fonte = readFileSync(new URL(arq, import.meta.url), 'utf8');
    assert.match(fonte, /protocolo\.recibo/, arq + ' deixou de ler protocolo.recibo');
  }
});

test('recibo antigo fora do padrão não impede salvar a biometria', () => {
  // Existem recibos vindos da importação que não batem com o formato — achei
  // um "LIN21799", de 8 caracteres, no banco. Como o campo agora mora no mesmo
  // bloco da biometria, validar o valor INTOCADO deixaria a pessoa presa: ela
  // só queria anotar a data da biometria e não conseguiria salvar até
  // consertar um número em que nem estava mexendo.
  const h = trecho('async function salvarMarcos(', '\n}\n');
  assert.match(h, /if\(recibo !== reciboAntes && recibo && !RE_RECIBO\.test\(recibo\)\)/,
    'a validação só vale para recibo que mudou');
});
