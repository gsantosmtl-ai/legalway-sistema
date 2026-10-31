// Uma conta de portal é de UM caso. O e-mail é a chave, e 31 e-mails cobrem
// 73 processos vivos — o do Nunes Faria cobre sete. Então a equipe VAI bater
// nisso na segunda, criando acesso para o segundo caso de um cliente.
//
// A mensagem dizia: "Esse e-mail já usado por outro cliente no portal."
// Mandava procurar uma pessoa que não existe: é o mesmo cliente, outro caso.
//
// E no log das automações o aviso do portal saía como "ficou de fora (não deu
// para preparar o envio)", sem dizer por quê — para 16 processos sem e-mail e
// para todos os de e-mail repetido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const avisos = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');

test('a recusa diz que é outro CASO quando o nome é o mesmo', () => {
  assert.match(portal, /const mesmaPessoa = String\(dele\.nome \|\| ''\)/);
  assert.match(portal, /já tem acesso ao portal em outro caso de/);
  assert.match(portal, /use o acesso que já existe, ou cadastre outro e-mail para este caso/);
});

test('quando o nome é outro, a recusa manda conferir se é a mesma pessoa', () => {
  assert.match(portal, /Confira se é a mesma pessoa/);
  assert.doesNotMatch(portal, /e-mail já usado por outro cliente no portal/,
    'a frase antiga mandava procurar uma pessoa que não existe');
});

test('a recusa devolve qual processo já tem a conta', () => {
  // Sem isso a equipe não sabe onde está o acesso que já existe.
  assert.match(portal, /outroProcesso: dele\.processo_id/);
  assert.match(portal, /outroProcesso: r\.outroProcesso \|\| null/);
});

test('o 409 não depende mais de procurar texto dentro da mensagem', () => {
  // Era `r.motivo.includes('já usado')`: mudar a frase mudava o código HTTP.
  assert.match(portal, /r\.jaTemConta \? 409 : 400/);
  assert.doesNotMatch(portal, /motivo\.includes\('já usado'\)/);
});

test('o log da automação diz POR QUE o acesso não foi criado', () => {
  assert.match(avisos, /erroPreparo: 'não criei o acesso ao portal: ' \+ r\.motivo/);
  assert.match(avisos, /ficou de fora — \$\{\(extra && extra\.erroPreparo\)/);
  assert.doesNotMatch(avisos, /ficou de fora \(não deu para preparar o envio\)`\)/,
    'a frase sem motivo não ajuda ninguém de manhã');
});

test('o aviso do portal continua exigindo e-mail no processo', () => {
  // 16 processos vivos estão sem e-mail. Eles têm que ficar de fora — com
  // motivo no log — e não receber uma mensagem com login vazio.
  assert.match(avisos, /\.filter\(p => p\.boasVindasEnviada && p\.email && !d\.comPortal\.has\(String\(p\.id\)\)\)/);
});
