// Pedido dela em 30/10/2026: "tudo tem que gerar notificação — novo contrato
// enviado, contrato assinado, novo lead, etc."
//
// Contrato ASSINADO já avisava. Contrato ENVIADO não avisava ninguém: quem
// mandava o link para o cliente era o único a saber, e o contrato ficava em
// "Aguardando assinatura" sem ninguém acompanhando.
//
// O ponto certo é a rota do token: a tela gera o link no navegador, mas o
// token vem do servidor, e todo envio passa por lá uma vez só.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const arq = readFileSync(new URL('../src/armazenamento.js', import.meta.url), 'utf8');

// Conta chaves em vez de procurar um terminador. Cortar no primeiro "});"
// pegava o `.catch(() => {})` do meio da função e devolvia metade dela —
// o teste passava a olhar um pedaço que não continha o que ele afirmava.
function trecho(assinatura) {
  const ini = arq.indexOf(assinatura);
  assert.notEqual(ini, -1, `não achei "${assinatura}" — foi renomeado?`);
  let nivel = 0;
  for (let j = arq.indexOf('{', ini); j < arq.length; j++) {
    if (arq[j] === '{') nivel++;
    else if (arq[j] === '}' && --nivel === 0) return arq.slice(ini, j + 1);
  }
  throw new Error('as chaves não fecharam');
}

test('gerar o token de assinatura avisa o canal de vendas', () => {
  const rota = trecho("rotasPublico.post('/publico/token'");
  assert.match(rota, /tipo === 'assinatura'/, 'o aviso não pode sair para token de portal');
  assert.match(rota, /avisarEnvioDeContrato\(/);
});

test('o aviso não pode impedir o link de ser gerado', () => {
  const rota = trecho("rotasPublico.post('/publico/token'");
  assert.match(rota, /avisarEnvioDeContrato\([\s\S]*?\)\.catch\(/,
    'sem .catch, uma falha no aviso deixa o cliente sem o link');
});

test('a mensagem diz quem enviou, para quem e quanto', () => {
  const fn = trecho('async function avisarEnvioDeContrato');
  assert.match(fn, /\$\{quem\}/, 'não diz quem enviou');
  assert.match(fn, /c\.cliente/, 'não diz para quem');
  assert.match(fn, /c\.servico/, 'não diz qual serviço');
  assert.match(fn, /'vendas'/, 'tem de ir para o canal de vendas');
});

test('gerar o link duas vezes não vira duas buzinas no celular', () => {
  const fn = trecho('async function avisarEnvioDeContrato');
  assert.match(fn, /grupo: 'contrato-enviado-' \+ contratoId/,
    'a etiqueta precisa variar por contrato e repetir no mesmo contrato');
  assert.match(fn, /url: 'contratos\.html\?abrir='/, 'tocar no aviso tem de abrir o contrato');
});

test('contrato que não existe não derruba a rota', () => {
  const fn = trecho('async function avisarEnvioDeContrato');
  assert.match(fn, /if \(!c\) return;/);
});
