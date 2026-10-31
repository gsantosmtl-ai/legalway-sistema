// Como o escritório trabalha, dito por ela em 30/10/2026: na assinatura do
// contrato o cliente anexa SÓ a foto do cartão — documento não vem por aqui.
// O Peterson cadastra o cartão na Stripe e cobra por lá.
//
// Duas regras dela, nesta ordem:
//   · "não vamos deixar apagar a foto do cartão"
//   · "somente o Peterson vai ter acesso"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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

// Roda as duas funções de verdade, com a sessão e as regras que eu mandar.
function podeVer(nomeLogado, regras) {
  const ctx = { sessao: { nome: nomeLogado }, LW: { regrasAgora: () => regras || {} } };
  vm.createContext(ctx);
  vm.runInContext([
    tela.slice(tela.indexOf('const QUEM_VE_CARTAO_PADRAO'), tela.indexOf('function anexosDoCliente')),
    'globalThis.podeVerCartao = podeVerCartao;',
  ].join('\n'), ctx);
  return ctx.podeVerCartao();
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

test('só o Peterson vê a foto', () => {
  assert.equal(podeVer('Peterson'), true);
  for (const outro of ['Tatiane', 'Vitória', 'Adriano', 'Renato', 'Bruno Carvalho Maciel', 'neilson flores']) {
    assert.equal(podeVer(outro), false, `${outro} não devia ver a foto do cartão`);
  }
});

test('ACESSO TOTAL não fura a regra — e isso é de propósito', () => {
  // Seis dos sete da equipe têm acesso total. Deixar o acesso total passar
  // por cima faria a restrição não restringir ninguém, que foi o erro da
  // primeira versão disto.
  const f = corpoDe(tela, 'function podeVerCartao()');
  assert.doesNotMatch(f, /acessoTotal/, 'acesso total voltou a furar a regra');
  assert.equal(podeVer('Tatiane'), false);
});

test('a lista sai das Regras, não de nome escrito no código', () => {
  // Se o Peterson sair ou outra pessoa assumir o financeiro, muda ali.
  const regras = { contratos: { quemVeCartao: ['Vitória'] } };
  assert.equal(podeVer('Vitória', regras), true);
  assert.equal(podeVer('Peterson', regras), false, 'a lista das Regras tem de mandar');
});

test('nome curto e acento não atrapalham', () => {
  assert.equal(podeVer('Peterson Souza'), true, 'o cadastro pode ter sobrenome');
  assert.equal(podeVer('Vitoria', { contratos: { quemVeCartao: ['Vitória'] } }), true);
});

test('sessão sem nome não vê nada', () => {
  assert.equal(podeVer(''), false);
});

test('NÃO existe jeito de apagar a foto', () => {
  // Regra dela: "não vamos deixar apagar a foto do cartão".
  assert.doesNotMatch(tela, /data-apagar-anexo/, 'o botão de excluir voltou');
  assert.doesNotMatch(arquivos, /\/apagar'/, 'a rota de apagar arquivo voltou');
  assert.doesNotMatch(arquivos, /DELETE FROM arquivos WHERE id/,
    'voltou um caminho para apagar arquivo por id');
});

test('quem não pode ver não recebe nem o link do arquivo', () => {
  const f = corpoDe(tela, 'function anexosDoCliente(c)');
  const antesDoLink = f.slice(0, f.indexOf('/api/arquivos/'));
  assert.match(antesDoLink, /if\(!podeVerCartao\(\)\)/, 'o link sai antes da checagem');
  assert.match(f, /Visível só para o Financeiro/);
});

// ---------------------------------------------------------------------------
// E o outro caminho por onde a foto podia sair da ficha: assinar de novo.
//
// Acontece quando o primeiro link se perde ou o contrato é reenviado. A
// gravação da assinatura trocava o bloco `legalway-contrato-assinado-<id>`
// inteiro, e a lista de anexos da primeira assinatura ia com ele — o arquivo
// ficava no banco sem ninguém apontando, que é exatamente o que a limpeza de
// órfãos apaga.
// ---------------------------------------------------------------------------
const assinaturasJs = readFileSync(new URL('../src/assinaturas.js', import.meta.url), 'utf8');

// Roda o transformador de verdade, recortado por contagem de chaves.
function juntarAnexos(atual, anexosSalvos) {
  const i = assinaturasJs.indexOf("await gravar('legalway-contrato-assinado-' + contratoId");
  assert.notEqual(i, -1, 'a gravação da assinatura mudou de forma');
  const inicio = assinaturasJs.indexOf('(_novo, atual) =>', i);
  assert.notEqual(inicio, -1, 'a gravação voltou a não ter transformador — o bloco é substituído inteiro');
  const abre = assinaturasJs.indexOf('{', inicio);
  let nivel = 0, fim = -1;
  for (let k = abre; k < assinaturasJs.length; k++) {
    if (assinaturasJs[k] === '{') nivel++;
    else if (assinaturasJs[k] === '}' && --nivel === 0) { fim = k + 1; break; }
  }
  const ctx = {
    dados: { assinado_em: new Date('2026-11-02T15:00:00Z'), hash_contrato: 'h1', ip: '1.2.3.4', id: 'as2' },
    nomeDigitado: 'Maria Silva', linkFinal: '/api/arquivos/' + 'f'.repeat(32), hashFinal: 'hf',
    anexosSalvos, anexosRecusados: [], Array, Set, Object,
  };
  vm.createContext(ctx);
  vm.runInContext(`globalThis.f = (_novo, atual) => ${assinaturasJs.slice(abre, fim)};`, ctx);
  return ctx.f(null, atual);
}

const anexo = (n) => ({ nome: n + '.jpg', arquivo: n.padEnd(32, '0'), link: '/api/arquivos/' + n.padEnd(32, '0') });

test('assinar de novo NÃO apaga a foto da primeira assinatura', () => {
  const r = juntarAnexos({ anexos: [anexo('cartao1')] }, [anexo('cartao2')]);
  assert.equal(r.anexos.length, 2);
  assert.equal(r.anexos[0].nome, 'cartao1.jpg');
  assert.equal(r.anexos[1].nome, 'cartao2.jpg');
});

test('o mesmo arquivo não entra duas vezes', () => {
  const r = juntarAnexos({ anexos: [anexo('cartao1')] }, [anexo('cartao1')]);
  assert.equal(r.anexos.length, 1);
});

test('primeira assinatura: a lista nasce com o que veio', () => {
  assert.equal(juntarAnexos(null, [anexo('cartao1')]).anexos.length, 1);
  assert.equal(juntarAnexos({}, []).anexos.length, 0);
});

test('bloco gravado na forma errada não derruba a assinatura', () => {
  // Já houve chave gravada como lista onde o código esperava objeto — foi o
  // que fez o resumo diário sair a cada minuto.
  assert.equal(juntarAnexos([], [anexo('cartao1')]).anexos.length, 1);
  assert.equal(juntarAnexos({ anexos: 'nada' }, [anexo('cartao1')]).anexos.length, 1);
});

test('o PDF e o certificado são os da assinatura NOVA', () => {
  // Só a lista de anexos acumula. O que vale juridicamente é a última.
  const r = juntarAnexos({ anexos: [anexo('cartao1')], pdf: '/api/arquivos/' + 'a'.repeat(32), certificado: { id: 'as1' } }, []);
  assert.equal(r.pdf, '/api/arquivos/' + 'f'.repeat(32));
  assert.equal(r.certificado.id, 'as2');
  assert.equal(r.assinadoEm, '2026-11-02T15:00:00.000Z');
});
