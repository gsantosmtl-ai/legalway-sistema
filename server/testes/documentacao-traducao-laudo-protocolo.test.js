// Conferência detalhada dos quatro fluxos da Documentação: tradução, laudo
// psicológico, checklist e protocolo.
//
// Os dois defeitos achados custam dinheiro:
//   - nada impedia gerar a MESMA conta a pagar duas vezes para a tradutora;
//   - o laudo gerava conta zerada quando a psicóloga não tinha valor cadastrado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const i = docs.indexOf(assinatura);
  assert.notEqual(i, -1, 'não achei ' + assinatura);
  let n = 0;
  for (let k = docs.indexOf('{', i); k < docs.length; k++) {
    if (docs[k] === '{') n++;
    else if (docs[k] === '}') { n--; if (n === 0) return docs.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham');
}

// ------------------------------------------------- conta a pagar duplicada
function palcoConta(contasPagar) {
  const ctx = {
    console, contasPagar, avisos: [], gravou: 0,
    toast: (m) => ctx.avisos.push(m),
    hoje: () => '2026-10-23', now: () => new Date('2026-10-23T12:00:00Z'),
    uid: (p) => p + Math.random().toString(36).slice(2, 7),
    saveContasPagar: () => { ctx.gravou++; },
    LW: { regrasAgora: () => ({ financeiro: { categoriaPrestadores: 'Serviço de terceiros' } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(corpoDe('function gerarContaPagarPrestador(p, tipoServico, fornecedor, valor)'), ctx);
  return ctx;
}
const PROC = { id: 'p1', clienteNome: 'Maria', servico: 'Visto T' };

test('não gera a mesma conta a pagar duas vezes', () => {
  // Dois cliques em "Marcar como recebido", ou reabrir a ficha e clicar de
  // novo, pagava a tradutora duas vezes.
  const ctx = palcoConta([]);
  assert.equal(ctx.gerarContaPagarPrestador(PROC, 'Tradução', 'Ana', 120), true);
  assert.equal(ctx.contasPagar.length, 1);
  assert.equal(ctx.gerarContaPagarPrestador(PROC, 'Tradução', 'Ana', 120), false, 'a segunda não entra');
  assert.equal(ctx.contasPagar.length, 1);
  assert.match(ctx.avisos.join(' '), /Já existe uma conta a pagar de Tradução para Maria/,
    'e quem clicou precisa saber por que nada aconteceu');
});

test('tradução e laudo do mesmo processo são contas diferentes', () => {
  const ctx = palcoConta([]);
  assert.equal(ctx.gerarContaPagarPrestador(PROC, 'Tradução', 'Ana', 120), true);
  assert.equal(ctx.gerarContaPagarPrestador(PROC, 'Psicologia', 'Cláudia', 250), true,
    'são serviços diferentes, não duplicata');
  assert.equal(ctx.contasPagar.length, 2);
});

test('conta cancelada não bloqueia gerar de novo', () => {
  // Cancelou por engano: tem que dar para refazer.
  const ctx = palcoConta([{ processoId: 'p1', tipoServico: 'Tradução', status: 'Cancelado' }]);
  assert.equal(ctx.gerarContaPagarPrestador(PROC, 'Tradução', 'Ana', 120), true);
});

test('outro processo da mesma tradutora não é bloqueado', () => {
  const ctx = palcoConta([{ processoId: 'p9', tipoServico: 'Tradução', status: 'A vencer' }]);
  assert.equal(ctx.gerarContaPagarPrestador(PROC, 'Tradução', 'Ana', 120), true);
});

test('a conta nasce com o que o Financeiro precisa', () => {
  const ctx = palcoConta([]);
  ctx.gerarContaPagarPrestador(PROC, 'Tradução', 'Ana', 120);
  const c = ctx.contasPagar[0];
  assert.equal(c.fornecedor, 'Ana');
  assert.equal(c.valor, 120);
  assert.equal(c.centroCusto, 'Documentação');
  assert.equal(c.processoId, 'p1', 'sem isto não há como achar a duplicata depois');
  assert.equal(c.tipoServico, 'Tradução');
  assert.match(c.descricao, /Tradução — Maria \(Visto T\)/);
  assert.equal(ctx.gravou, 1, 'e é gravada');
});

// ------------------------------------------------------------ tradução
test('a tradução já vem com o valor do cadastro do prestador', () => {
  assert.match(docs, /value="\$\{\(prestadores\.find\(pr=>pr\.id===t\.prestadorId\)\|\|\{\}\)\.valorPadrao \|\| ''\}"/);
  assert.match(docs, /Veio do cadastro do prestador\. Dá para mudar se este caso for diferente/);
  assert.match(docs, /Esse prestador não tem valor padrão cadastrado/,
    'sem valor cadastrado, a tela diz o que falta em vez de ficar em branco');
});

test('marcar tradução recebida duas vezes não repete nada', () => {
  const i = docs.indexOf("document.getElementById('btn-marcar-recebido-traducao')");
  const corpo = docs.slice(i, i + 1200);
  assert.match(corpo, /if\(t\.pagamentoGerado\)\{ toast\('Esta tradução já foi marcada como recebida\.'\); return; \}/,
    '`pagamentoGerado` era gravado e nunca lido');
  assert.match(corpo, /const gerou = gerarContaPagarPrestador\(/);
  assert.match(corpo, /a conta a pagar já existia no Financeiro, não foi gerada outra/,
    'o histórico tem que contar a verdade dos dois casos');
});

// -------------------------------------------------------------- laudo
test('laudo sem valor cadastrado não gera conta zerada', () => {
  const i = docs.indexOf("document.getElementById('btn-marcar-laudo')");
  const corpo = docs.slice(i, i + 1300);
  assert.match(corpo, /if\(!\(Number\(valorFixo\) > 0\)\)\{/);
  assert.match(corpo, /não tem valor padrão cadastrado\. Cadastre em "Prestadores Externos"/,
    'conta a pagar zerada passa batida no Financeiro');
  assert.match(corpo, /if\(av\.pagamentoGerado\)\{ toast\('Este laudo já foi marcado como recebido\.'\); return; \}/);
});

// ---------------------------------------------------------- checklist
test('o status do processo acompanha o checklist, e só para a frente', () => {
  const corpo = corpoDe('function atualizarStatusAutomatico(p)');
  assert.match(corpo, /if\(p\.status !== 'Documentos solicitados' && p\.status !== 'Recebendo documentos'\) return;/,
    'processo protocolado não volta para "Recebendo documentos"');
  assert.match(corpo, /d\.status !== 'Não solicitado' && d\.status !== 'Solicitado'/);
  // Rodando:
  const ctx = {}; vm.createContext(ctx); vm.runInContext(corpo, ctx);
  const p1 = { status: 'Documentos solicitados', checklist: [{ status: 'Recebido' }] };
  ctx.atualizarStatusAutomatico(p1); assert.equal(p1.status, 'Recebendo documentos');
  const p2 = { status: 'Documentos solicitados', checklist: [{ status: 'Solicitado' }] };
  ctx.atualizarStatusAutomatico(p2); assert.equal(p2.status, 'Documentos solicitados', 'nada recebido, nada muda');
  const p3 = { status: 'Protocolado', checklist: [{ status: 'Recebido' }] };
  ctx.atualizarStatusAutomatico(p3); assert.equal(p3.status, 'Protocolado');
});

test('o portal também move o processo — era só a equipe que movia', () => {
  // `atualizarStatusAutomatico` é chamado em quatro lugares da TELA, todos do
  // lado da equipe. Quando o cliente enviava pelo portal, o cartão só se mexia
  // quando alguém do escritório tocasse na ficha.
  // 4 chamadas + a definição da função.
  const chamadas = (docs.match(/^\s*atualizarStatusAutomatico\(p\);/gm) || []).length;
  assert.equal(chamadas, 4, 'as quatro são da equipe: mudar status, anexar, apontar anexo solto, cliente de teste');
  assert.match(portal, /p\.status = 'Recebendo documentos';/);
});

// ---------------------------------------------------------- protocolo
test('o recibo do USCIS é validado antes de entrar', () => {
  const i = docs.indexOf("document.getElementById('confirm-pr')");
  const corpo = docs.slice(i, i + 1400);
  assert.match(corpo, /if\(!numero\)\{ toast\('Informe o número do protocolo\.'\); return; \}/);
  assert.match(corpo, /if\(recibo && !RE_RECIBO\.test\(recibo\)\)/, '3 letras + 10 números');
  assert.match(corpo, /recibo: recibo \|\| null/, 'pode protocolar sem o recibo e preencher depois');
});

test('trocar o recibo zera o status antigo do USCIS', () => {
  // Senão o processo novo herdaria a situação do recibo anterior.
  const i = docs.indexOf("document.getElementById('confirm-pr')");
  const corpo = docs.slice(i, i + 1400);
  assert.match(corpo, /if\(recibo && \(!p\.uscis \|\| p\.uscis\.recibo !== recibo\)\) p\.uscis = null;/);
  assert.match(corpo, /if\(recibo\) consultarUscis\(p\.id, true\)/, 'e consulta na hora');
});

test('editar o protocolo não re-protocola', () => {
  const i = docs.indexOf("document.getElementById('confirm-pr')");
  const corpo = docs.slice(i, i + 1400);
  assert.match(corpo, /const editando = !!p\.protocolo;/);
  assert.match(corpo, /if\(!editando\)\{ p\.status = 'Protocolado';/,
    'editar os dados não pode jogar o processo de volta para Protocolado');
});
