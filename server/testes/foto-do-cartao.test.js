// Como o escritório trabalha, dito por ela em 30/10/2026: na assinatura do
// contrato o cliente anexa SÓ a foto do cartão — documento não vem por aqui.
// O Peterson cadastra o cartão na Stripe e cobra por lá.
//
// Ela já alinhou com a equipe e eles conhecem os riscos; o fluxo é decisão
// deles. O que dá para fazer sem mudar o processo é o que está aqui: a foto
// só aparece para quem mexe em Financeiro, e dá para apagar na hora depois
// de cadastrar na Stripe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/contratos.html', import.meta.url), 'utf8');
const arquivos = readFileSync(new URL('../src/arquivos.js', import.meta.url), 'utf8');
const modelos = ['visto-t', 'eb2niw'].map(n =>
  readFileSync(new URL(`../../docs/contratos-templates/${n}.html`, import.meta.url), 'utf8'));
const idiomas = ['visto-t', 'eb2niw'].map(n =>
  readFileSync(new URL(`../../docs/contratos-templates/idiomas-${n}.js`, import.meta.url), 'utf8'));

function corpoDe(fonte, assinatura) {
  const i = fonte.indexOf(assinatura);
  assert.notEqual(i, -1, `não achei "${assinatura}"`);
  let nivel = 0;
  for (let k = fonte.indexOf('{', i); k < fonte.length; k++) {
    if (fonte[k] === '{') nivel++;
    else if (fonte[k] === '}' && --nivel === 0) return fonte.slice(i, k + 1);
  }
  throw new Error('chaves não fecharam');
}

test('a página de assinatura pede a foto do cartão, não documentos', () => {
  for (const m of modelos) {
    assert.match(m, /data-t="t200">Card photo/, 'o rótulo ainda fala em documentos');
    assert.match(m, /accept="image\/jpeg,image\/png"/, 'ainda aceita PDF e Office');
    assert.doesNotMatch(m, /id="anexoInput" multiple/, 'é um arquivo só, não vários');
  }
});

test('o pedido está traduzido em português e espanhol', () => {
  for (const i of idiomas) {
    assert.match(i, /t200: 'Foto do cartão'/);
    assert.match(i, /t200: 'Foto de la tarjeta'/);
    assert.doesNotMatch(i, /t201: 'Passaporte/, 'o texto antigo de documentos ficou');
  }
});

test('quem não mexe em Financeiro não vê a foto', () => {
  const f = corpoDe(tela, 'function anexosDoCliente(c)');
  assert.match(f, /if\(!podeVerCartao\(\)\)/, 'o bloco não está restrito');
  assert.match(f, /Visível só para o Financeiro/);
  // e quem não pode ver não recebe o link do arquivo junto
  const antesDoLink = f.slice(0, f.indexOf('/api/arquivos/'));
  assert.match(antesDoLink, /podeVerCartao/, 'o link sai antes da checagem');
});

test('a checagem aceita acesso total, financeiro ou contratos', () => {
  const f = corpoDe(tela, 'function podeVerCartao()');
  assert.match(f, /sessao\.acessoTotal/);
  assert.match(f, /p\.financeiro \|\| p\.contratos/);
});

test('dá para apagar a foto, e o servidor exige permissão', () => {
  assert.match(tela, /data-apagar-anexo=/, 'falta o botão de apagar');
  assert.match(tela, /\/apagar'/, 'o botão não chama a rota');
  const r = corpoDe(arquivos, "rotasArquivos.post('/arquivos/:id/apagar'");
  assert.match(r, /exigirLogin/, 'a rota não exige login');
  assert.match(r, /podeGravar\(req\.usuario, 'legalway-contratos-v1'\)/, 'qualquer um apagaria');
  assert.match(r, /INSERT INTO auditoria/, 'apagar arquivo tem de ficar registrado');
});

test('apagar pede confirmação, porque não tem volta', () => {
  assert.match(tela, /Isto não tem volta/);
});
