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

test('protocolar pede só a data — nem número, nem recibo', () => {
  // "Protocolado não tem nenhum protocolo, somente depois de alguns dias que
  // chega a I-797 com o número de protocolo." Protocolar é ENVIAR o pedido; o
  // único dado que existe nesse instante é quando foi enviado.
  //
  // E o campo "número" era obrigatório: no banco não havia UMA ficha com
  // protocolo.numero preenchido, contra 59 com protocolo.recibo. O sistema
  // exigia um dado que ninguém conseguia responder.
  const modal = semComentarios(trecho('<div class="modal" id="modal-protocolo">', '</div>\n</div>'));
  assert.ok(!/id="pr-recibo"/.test(modal), 'o recibo não se pergunta ao protocolar');
  assert.ok(!/id="pr-numero"/.test(modal), 'o número também não: ele vem na carta');
  assert.match(modal, /id="pr-data"/, 'a data do envio é o que se registra aqui');
});

test('não sobrou código mexendo nos campos que deixaram de existir', () => {
  // Esta é a armadilha desta mudança, e ela já apareceu duas vezes: um
  // getElementById('pr-numero').value numa referência morta joga TypeError e o
  // modal nem abre — o clique em "Protocolar" para a tela inteira, sem erro
  // visível para quem está usando.
  for (const morto of ['pr-recibo', 'pr-numero']) {
    assert.equal(tela.includes(morto), false, 'sobrou referência a ' + morto);
  }
});

test('arrastar para Protocolado não fala mais em número', () => {
  const h = trecho("novaEtapa === 'Protocolado' && !p.protocolo", '\n  }');
  assert.ok(!/pr-numero/.test(h));
  assert.ok(!/número do protocolo/i.test(h), 'o recado não pode pedir o que não existe ainda');
  assert.match(h, /pr-data/, 'a ficha não pode ficar protocolada sem dizer quando');
});

test('número antigo não some da tela de quem tem', () => {
  // Nenhuma ficha tinha `numero` no banco local, mas a produção pode ter.
  // Parar de PERGUNTAR não é o mesmo que apagar: o que já existe continua à
  // vista, marcado como registro antigo.
  assert.match(tela, /p\.protocolo\.numero \? `<div class="field-row"><label>Número \(registro antigo\)/);
});

test('editar o protocolo não apaga o número antigo', () => {
  const h = semComentarios(trecho("document.getElementById('confirm-pr')", '\n});'));
  assert.ok(!/numero/.test(h), 'o handler não pode escrever em numero: o spread preserva o que já existe');
});

test('os números são pedidos no bloco do I-797, com a dica de onde vêm', () => {
  // E são VÁRIOS: um por formulário (I-914 da petição, I-765 da autorização de
  // trabalho). Cobertura da lista em recibos-do-processo.test.js.
  const bloco = trecho('id="i797-data"', 'btn-salvar-marcos');
  assert.match(bloco, /id="lista-recibos"/);
  assert.match(bloco, /id="btn-mais-recibo"/, 'precisa dar para adicionar outro número');
  assert.match(bloco, /I-797C/, 'tem que dizer que o número vem na carta');
  assert.match(bloco, /I-914/, 'e dar o exemplo do caso real');
});

test('editar o protocolo NÃO apaga o recibo de quem já tem', () => {
  // Este é o estrago silencioso. O spread antigo tinha `recibo: recibo || null`:
  // com o campo fora do modal, `recibo` seria sempre vazio e toda edição de
  // data ou observação zeraria o número — e com ele a consulta ao USCIS do
  // cliente, sem ninguém perceber.
  const h = semComentarios(trecho("document.getElementById('confirm-pr')", '\n});'));
  assert.match(h, /p\.protocolo = \{ \.\.\.\(p\.protocolo\|\|\{\}\), data:/,
    'o spread preserva tudo que já existe e escreve só data e observação');
  assert.ok(!/recibo:/.test(h), 'o handler do protocolo não pode escrever no recibo');
  assert.ok(!/pr-recibo/.test(h));
});

test('salvarMarcos grava a lista e espelha o primeiro onde todo mundo lê', () => {
  const h = trecho('async function salvarMarcos(', '\n}\n');
  assert.match(h, /lerRecibos\(\)/);
  assert.match(h, /recibos: digitados,/);
  assert.match(h, /recibo: \(digitados\[0\] \|\| \{\}\)\.numero \|\| null/,
    'quinze pontos leem protocolo.recibo e esperam UM número');
  assert.match(h, /LW\.reciboValido\(r\.numero\)/, 'número malformado é recusado antes de gravar');
});

test('ter número também move a ficha para I-797', () => {
  // Quem digitou o número tem a carta na mão, mesmo sem preencher a data.
  const h = trecho('async function salvarMarcos(', '\n}\n');
  assert.match(h, /else if\(i797 \|\| digitados\.length\) andarPara\('I-797'\)/);
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

test('o servidor continua enxergando os números', () => {
  // Os avisos e o portal leem `protocolo.recibo`, que é o espelho do primeiro,
  // e continuam funcionando sem saber que agora são vários. O uscis.js é o que
  // precisa ver TODOS — é ele que consulta.
  for (const arq of ['../src/avisos-automaticos.js', '../src/portal-cliente.js']) {
    const fonte = readFileSync(new URL(arq, import.meta.url), 'utf8');
    assert.match(fonte, /protocolo\.recibo/, arq + ' deixou de ler o espelho');
  }
  const u = readFileSync(new URL('../src/uscis.js', import.meta.url), 'utf8');
  assert.match(u, /recibosConsultaveis/, 'a consulta tem que varrer a lista inteira');
});

test('número antigo fora do padrão não impede salvar a biometria', () => {
  // Existem recibos vindos da importação que não batem com o formato — achei
  // um "LIN21799", de 8 caracteres, no banco. Como o campo agora mora no mesmo
  // bloco da biometria, validar o valor INTOCADO deixaria a pessoa presa: ela
  // só queria anotar a data da biometria e não conseguiria salvar até
  // consertar um número em que nem estava mexendo.
  const h = trecho('async function salvarMarcos(', '\n}\n');
  assert.match(h, /!jaExistia\.has\(r\.numero\) && !LW\.reciboValido\(r\.numero\)/,
    'a validação só vale para número que NÃO estava lá antes');
});

test('ficha sem histórico não faz o Confirmar protocolo falhar calado', () => {
  // Achado rodando a tela de verdade: uma ficha sem `historico` (vieram assim
  // da importação) jogava "Cannot read properties of undefined (reading
  // 'push')" DENTRO do listener do clique. A exceção não sai de um listener,
  // então não havia erro na tela: o status já tinha mudado na memória, o
  // saveProcessos nunca rodava e o modal ficava aberto. Quem estava usando via
  // "cliquei em Confirmar e não aconteceu nada".
  const h = trecho("document.getElementById('confirm-pr')", '\n});');
  const iGuarda = h.indexOf('p.historico = Array.isArray(p.historico)');
  const iPush = h.indexOf('p.historico.push');
  assert.ok(iGuarda > 0, 'falta a guarda do histórico');
  assert.ok(iPush > iGuarda, 'a guarda tem que vir antes de qualquer push');
});
