// Um `<input type="text">` não guarda quebra de linha. Nunca. O navegador
// descarta, e `inp.value.trim()` devolve o texto achatado.
//
// A mensagem de convite ao portal estava declarada como `tipo:'texto'` e tinha
// seis quebras no padrão. Bastou alguém abrir Configurações → Portal e salvar
// para o cliente passar a receber isto:
//
//   "...onde você acompanha seu processo e envia os documentos.Endereço:
//    {link}E-mail: {email}Senha temporária: {senha}No primeiro acesso..."
//
// Conferido no banco em 31/10/2026: zero quebras guardadas, seis no padrão.
//
// Este teste cruza o esquema da tela com os valores padrão do servidor e cobra
// `texto-longo` de todo campo cujo padrão tem mais de uma linha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { REGRAS_PADRAO } = await import('../src/regras.js');

const tela = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

// O esquema é dado puro: dá para avaliar e perguntar a ele mesmo, em vez de
// ler o HTML com expressão regular e torcer.
function esquema() {
  const i = tela.indexOf('const ESQUEMA_REGRAS = [');
  assert.ok(i > 0, 'não achei ESQUEMA_REGRAS em configuracoes.html');
  const abre = tela.indexOf('[', i);
  let nivel = 0;
  for (let k = abre; k < tela.length; k++) {
    if (tela[k] === '[') nivel++;
    else if (tela[k] === ']') { nivel--; if (!nivel) {
      const ctx = {};
      vm.createContext(ctx);
      return vm.runInContext('(' + tela.slice(abre, k + 1) + ')', ctx);
    } }
  }
  throw new Error('não fechei os colchetes do esquema');
}

const valorPadrao = (secao, caminho) =>
  caminho.split('.').reduce((o, k) => (o == null ? o : o[k]), REGRAS_PADRAO[secao]);

test('todo campo cujo padrão tem várias linhas é texto-longo', () => {
  const errados = [];
  for (const sec of esquema()) {
    for (const c of (sec.campos || [])) {
      if (c.tipo !== 'texto') continue;
      const v = valorPadrao(sec.chave, c.k);
      if (typeof v === 'string' && v.includes('\n')) errados.push(`${sec.chave}.${c.k}`);
    }
  }
  assert.deepEqual(errados, [],
    'campo de uma linha para texto de várias: salvar a tela achata a mensagem');
});

test('a mensagem de convite ao portal é texto-longo', () => {
  const portal = esquema().find((s) => s.chave === 'portal');
  assert.ok(portal, 'a seção do portal saiu do esquema');
  const campo = portal.campos.find((c) => c.k === 'mensagemConvite');
  assert.ok(campo, 'o campo do convite saiu do esquema');
  assert.equal(campo.tipo, 'texto-longo');
});

test('o padrão do convite continua tendo as quebras', () => {
  // Se o padrão perder as quebras, o teste de cima passa a dar certo por
  // acidente, e o cliente volta a receber o parágrafo colado.
  const v = REGRAS_PADRAO.portal.mensagemConvite;
  assert.ok((v.match(/\n/g) || []).length >= 4, 'o convite precisa de linhas separadas: endereço, e-mail e senha');
  assert.doesNotMatch(v, /documentos\.Endereço/, 'é exatamente o que o campo de uma linha produzia');
});

test('texto-longo é salvo sem trim, para não comer as quebras das pontas', () => {
  assert.match(tela, /c\.tipo === 'texto-longo'\)[\s\S]{0,120}inp\.value\);\s*\/\/ mantém as quebras/);
  assert.match(tela, /if\(c\.tipo === 'texto-longo'\) return[\s\S]{0,200}<textarea/);
});
