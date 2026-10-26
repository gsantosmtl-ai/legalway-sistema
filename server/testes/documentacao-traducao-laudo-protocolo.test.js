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
  // 4 chamadas + a definição da função. O argumento não é sempre `p`: a
  // transferência de anexo passa o processo VIVO, reencontrado por id na hora,
  // justamente porque o `p` capturado vira órfão quando a tela recarrega.
  const chamadas = (docs.match(/^\s*atualizarStatusAutomatico\((?!p\)\s*\{)[A-Za-z]+\);/gm) || []).length;
  assert.equal(chamadas, 4, 'as quatro são da equipe: mudar status, anexar, apontar anexo solto, cliente de teste');
  assert.match(portal, /p\.status = 'Recebendo documentos';/);
});

// ---------------------------------------------------------- protocolo
// O corpo do handler inteiro, em vez de uma janela de N caracteres: o bloco
// cresceu (I-797, biometria, registro fora do fluxo) e a janela fixa passou a
// cortar justamente as linhas que estes testes conferem.
function corpoDoConfirmPr() {
  const i = docs.indexOf("document.getElementById('confirm-pr')");
  assert.ok(i > 0, 'não achei o confirm-pr');
  const fim = docs.indexOf('\n});', i);
  // Sem os comentários: o aviso que existe justamente para dizer que um campo
  // NÃO é escrito ali cita o nome do campo, e faria o teste acusar a própria
  // explicação. Já aconteceu duas vezes nesta mudança.
  return docs.slice(i, fim).replace(/^\s*\/\/.*$/gm, '');
}

// O recibo MUDOU DE CASA, não de regra: ele é pedido na etapa I-797, porque o
// número vem impresso na carta I-797C que chega depois do protocolo. As duas
// garantias abaixo continuam valendo, agora dentro de salvarMarcos.
// Cobertura completa em recibo-vem-com-a-carta.test.js.
function corpoDoSalvarMarcos() {
  const i = docs.indexOf('async function salvarMarcos(');
  assert.ok(i > 0, 'não achei o salvarMarcos');
  return docs.slice(i, docs.indexOf('\n}\n', i));
}

test('protocolar não EXIGE número: ele pode chegar depois', () => {
  // No caminho normal a carta I-797C ainda não chegou e não há número nenhum.
  // Em "Registrar protocolo já feito" — caso antigo — a pessoa tem os números
  // na mão, e aí vale digitar. Opcional dos dois lados.
  const corpo = corpoDoConfirmPr();
  assert.match(corpo, /pr-data/, 'o que se registra ao protocolar é QUANDO foi enviado');
  assert.ok(!/if\(!numero\)/.test(corpo), 'número não pode voltar a travar o botão');
  assert.match(corpo, /lerRecibos\('lista-recibos-pr'\)/, 'mas os números são aceitos');
  assert.match(corpo, /!LW\.reciboValido\(r\.numero\)/, 'e validados quando digitados');
});

test('o recibo do USCIS é validado antes de entrar', () => {
  const corpo = corpoDoSalvarMarcos();
  // Só o que MUDOU é validado: há recibos antigos fora do padrão vindos da
  // importação, e eles não podem travar quem só quer salvar a biometria.
  assert.match(corpo, /!LW\.reciboValido\(r\.numero\)/, '3 letras + 10 números');
  assert.match(corpo, /recibos: digitados,/, 'e linha em branco apaga o número, sem botão de lixeira');
});

test('trocar o recibo zera o status antigo do USCIS', () => {
  // Senão o processo novo herdaria a situação do recibo anterior.
  const corpo = corpoDoSalvarMarcos();
  // Agora por número: tirar o I-765 da lista apaga o status DELE e deixa o do
  // I-914 em paz.
  assert.match(corpo, /const restam = p\.uscis\.casos\.filter\(c => c && vivos\.has\(c\.recibo\)\)/);
  assert.match(corpo, /chave\(digitados\) !== chave\(antesLista\)\) consultarUscis\(p\.id, true\)/,
    'e consulta — depois de gravar, nunca antes');
});

test('editar o protocolo não re-protocola', () => {
  const corpo = corpoDoConfirmPr();
  assert.match(corpo, /const editando = !!p\.protocolo;/);
  // Sem casar com a formatação: o que importa é que virar "Protocolado" e
  // escrever no histórico só acontece DENTRO do `if(!editando)`.
  const i = corpo.indexOf('if(!editando)');
  const j = corpo.indexOf('else p.historico.push');
  assert.ok(i > 0 && j > i, 'o ramo de editar continua separado');
  const ramoNovo = corpo.slice(i, j);
  assert.match(ramoNovo, /p\.status = 'Protocolado';/,
    'editar os dados não pode jogar o processo de volta para Protocolado');
  assert.doesNotMatch(corpo.slice(j), /p\.status = 'Protocolado'/,
    'o ramo de edição não mexe no status');
});
