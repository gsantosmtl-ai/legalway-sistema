// "Valor de contrato e valor pago só aparecer nos acessos dos sócios. Bruno,
// Elaine, terceiros só o percentual e não os valores. E nem ter acesso a
// módulo financeiro."
//
// O percentual continua para todo mundo: é dele que a Documentação precisa
// para saber se o processo pode ser protocolado. Quanto o cliente pagou, em
// dinheiro, é outra conversa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

function pode(sessao) {
  const i = docs.indexOf('function podeVerValores()');
  const ctx = { sessao };
  vm.createContext(ctx);
  vm.runInContext(docs.slice(i, docs.indexOf('\n}', i) + 2) + '\nglobalThis.f = podeVerValores;', ctx);
  return ctx.f();
}

test('quem é da documentação não vê os valores', () => {
  // Bruno e Elaine, como estão cadastrados hoje: papel documentação, sem
  // Financeiro.
  assert.equal(pode({ nome: 'Elaine', papel: 'documentacao', acessoTotal: false,
    permissoes: { documentos: 'editar', financeiro: 'nenhum' } }), false);
  assert.equal(pode({ nome: 'Bruno Carvalho Maciel', papel: 'documentacao', acessoTotal: false,
    permissoes: { documentos: 'editar', financeiro: 'nenhum' } }), false);
});

test('sócio e quem trabalha no Financeiro veem', () => {
  assert.equal(pode({ nome: 'Peterson', acessoTotal: true, permissoes: { financeiro: 'editar' } }), true);
  assert.equal(pode({ nome: 'Renato', acessoTotal: false, permissoes: { financeiro: 'visualizar' } }), true,
    'sócio que só consulta o Financeiro continua vendo');
});

test('a regra é o acesso ao Financeiro, não o formato do dashboard', () => {
  // Na tela de Usuários, `papel` se chama "Formato do dashboard". Tem gente
  // marcada como 'socio' que é estagiário — decidir quem vê dinheiro por um
  // campo de layout é esperar que ninguém nunca o use para o que ele diz ser.
  assert.equal(pode({ nome: 'Teste Revisão', cargo: 'Estagiário', papel: 'socio',
    acessoTotal: false, permissoes: { documentos: 'visualizar', financeiro: 'nenhum' } }), false,
    'marcado como sócio no dashboard, mas sem Financeiro: não vê');
  const i = docs.indexOf('function podeVerValores()');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
  assert.ok(!/sessao\.papel/.test(corpo), 'a função não pode olhar o papel');
});

test('sem sessão não vê nada', () => {
  assert.equal(pode(null), false);
  assert.equal(pode({ nome: 'ninguém' }), false, 'usuário sem permissões não vê');
});

test('o percentual continua para todo mundo', () => {
  // Esconder o percentual quebraria o trabalho da Documentação: é ele que diz
  // se dá para pedir autorização de protocolo.
  for (const marca of ['<span>% pago</span><b>${fin.percentual}%</b>',
                       '<span>Percentual pago</span><b>${fin.percentual}%</b>']) {
    const i = docs.indexOf(marca);
    assert.ok(i > 0, `não achei "${marca}"`);
    // A linha do percentual fica FORA do trecho condicionado.
    const antes = docs.slice(i - 300, i);
    assert.ok(!/podeVerValores\(\) \? `$/.test(antes.trim()),
      'o percentual não pode estar dentro da condição');
  }
});

test('os valores em dinheiro ficam dentro da condição, nos três lugares', () => {
  // Cartão do kanban, ficha do processo e coluna da lista.
  assert.match(docs, /\$\{podeVerValores\(\) \? `\s*\n\s*<div class="fin-row"><span>Contrato<\/span>/,
    'falta esconder no cartão do kanban');
  assert.match(docs, /\$\{podeVerValores\(\) \? `\s*\n\s*<div class="fin-row"><span>Valor do contrato<\/span>/,
    'falta esconder na ficha do processo');
  assert.match(docs, /return podeVerValores\(\) \? `\$\{f\.percentual\}% de \$\{fmtMoney\(f\.valorContrato\)\}` : `\$\{f\.percentual\}%`/,
    'falta esconder na coluna Pago da lista');
});

test('a tela esconde, mas o dado ainda viaja — isto está escrito', () => {
  // Honestidade sobre o alcance: esconder na tela resolve o que ela descreveu
  // ("só aparecer nos acessos dos sócios"), e não é a mesma coisa que o
  // servidor não mandar. Quem tem Documentação continua recebendo contratos e
  // contas a receber, porque é desses dois que a própria tela calcula o
  // percentual que todo mundo precisa ver.
  const permissoes = readFileSync(new URL('../src/permissoes.js', import.meta.url), 'utf8');
  assert.match(permissoes, /'legalway-contratos-v1':\s*\{[^}]*leitura: \['documentos'/,
    'se isto mudar, a tela de Documentação para de calcular o percentual');
  assert.match(permissoes, /'legalway-financeiro-v1':\s*\{[^}]*leitura: \['documentos'\]/,
    'idem');
  // O comentário na função precisa existir para quem for mexer nisso depois.
  const i = docs.indexOf('function podeVerValores()');
  assert.match(docs.slice(Math.max(0, i - 1400), i), /mesma que dá acesso ao módulo Financeiro/i,
    'a razão da regra tem que estar escrita junto dela');
});
