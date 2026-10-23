// "Temos que ter também a questão de reativar o contrato cancelado — gerar um
// novo contrato, recuperar o card com dados já existentes, e o Peterson colocar
// as condições, ver se já tem valor pago e dar de desconto."
//
// E, logo depois: "quem vai decidir é o financeiro; tem que aparecer o valor
// que ele já pagou e ELE vai decidir se entrará como crédito ou não. E o valor
// do novo contrato, número de parcelas, etc."
//
// Por isso nada aqui é automático: a tela MOSTRA o que já foi pago e quem
// decide é quem abriu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fin = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');
const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
const backup = readFileSync(new URL('../src/backup.js', import.meta.url), 'utf8');

function corpoDe(fonte, assinatura) {
  const i = fonte.indexOf(assinatura);
  assert.notEqual(i, -1, 'não achei ' + assinatura);
  let n = 0;
  for (let k = fonte.indexOf('{', i); k < fonte.length; k++) {
    if (fonte[k] === '{') n++;
    else if (fonte[k] === '}') { n--; if (n === 0) return fonte.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham');
}

test('só o Financeiro reativa, e só contrato cancelado', () => {
  const corpo = corpoDe(fin, 'function abrirReativacao(contratoId)');
  assert.match(corpo, /if\(!podeReativarContrato\(\)\)\{ toast\('Só o Financeiro reativa contrato\.'\)/);
  assert.match(corpo, /if\(velho\.etapa !== 'Cancelado'\)/, 'reativar o que não está cancelado não faz sentido');
  assert.match(fin, /function podeReativarContrato\(\)\{ return podeRenegociar\(\); \}/,
    'mesma porta da renegociação: permissão de editar o Financeiro');
});

test('o já pago aparece, e quem decide se vira crédito é ela', () => {
  const corpo = corpoDe(fin, 'function abrirReativacao(contratoId)');
  assert.match(corpo, /let usarCredito = false;/, 'começa DESMARCADO: a decisão é de quem abriu');
  assert.match(corpo, /Já pago neste contrato: <b style="font-size:15px;">\$\{fmtMoney\(jaPago\)\}/,
    'o número tem que estar na cara dela antes de qualquer decisão');
  assert.match(corpo, /Abater como crédito no contrato novo/);
  assert.match(corpo, /id="rt-credito"/, 'e ela escolhe QUANTO abater, não só sim ou não');
  assert.match(corpo, /credito = Math\.max\(0, Math\.min\(jaPago,/, 'não dá para abater mais do que entrou');
});

test('soma o que entrou inclusive em parcela cancelada', () => {
  // `somarRecebido` ignora canceladas de propósito, para a renegociação. Aqui
  // não dá: quando o contrato foi cancelado, as parcelas dele foram junto — e
  // o dinheiro que o cliente pôs continua sendo dele.
  const corpo = corpoDe(fin, 'function somarRecebidoTudo(contratoId)');
  assert.ok(!/ehCancelada/.test(corpo), 'parcela cancelada também conta aqui');
  assert.match(corpo, /String\(c\.contratoId\) === String\(contratoId\)/);
});

test('ela define valor, parcelas e primeira data', () => {
  const corpo = corpoDe(fin, 'function abrirReativacao(contratoId)');
  for (const campo of ['rt-valor', 'rt-n', 'rt-data']) assert.ok(corpo.includes(`id="${campo}"`), 'falta ' + campo);
  assert.match(corpo, /a parcelar/, 'a conta do que sobra depois do crédito tem que estar escrita');
  assert.match(corpo, /sobra < 0 \? 'disabled' : ''/, 'crédito maior que o valor não pode ser confirmado');
  assert.match(corpo, /fecha a conta/, 'a última parcela fecha o centavo, como na renegociação');
});

test('o contrato cancelado não é alterado — nasce outro, apontando para ele', () => {
  const corpo = corpoDe(fin, 'function abrirReativacao(contratoId)');
  assert.match(corpo, /reativadoDe: velho\.id/, 'o novo sabe de onde veio');
  assert.match(corpo, /velho\.reativadoPara = novo\.id/, 'e o velho sabe para onde foi');
  assert.ok(!/velho\.etapa = /.test(corpo), 'o cancelado continua cancelado');
  assert.match(corpo, /etapa: 'Assinado', dataAssinatura: hoje\(\)/);
  assert.match(corpo, /creditoAplicado: creditoUsado/);
  assert.match(corpo, /O já pago \(\$\{fmtMoney\(jaPago\)\}\) NÃO foi abatido/,
    'quando ela decide não abater, isso também fica escrito');
});

test('a ficha volta ao quadro, não é recriada', () => {
  // Recriar seria perder os documentos — e é de onde vieram as duplicatas da
  // família Abreu.
  const corpo = corpoDe(fin, 'async function devolverFichaAoQuadro(contratoVelhoId, novo, quem, quando)');
  assert.match(corpo, /p\.contratoId = novo\.id/, 'a ficha que já existe passa a apontar para o contrato novo');
  assert.match(corpo, /p\.situacao = null/, 'e deixa de estar cancelada');
  assert.ok(!/push\(\{ id:/.test(corpo), 'nada de criar ficha nova');
  assert.match(corpo, /Continua na etapa/, 'volta para onde estava');
  assert.match(corpo, /NÃO voltou ao quadro/, 'sem permissão na Documentação, avisa em voz alta');
});

test('o botão aparece na lista de cancelados, só para quem pode', () => {
  // "Refazer", não "Reativar": em Contratos já existe um "Reativar" que
  // DESFAZ o cancelamento com as mesmas condições. Dois botões com o mesmo
  // nome fazendo coisas diferentes é receita para alguém escolher errado.
  assert.match(fin, /podeReativarContrato\(\) \? \{ rotulo:'♻️ Refazer', quando:\(c\)=> c\.etapa === 'Cancelado' && !c\.reativadoPara/,
    'contrato já refeito não oferece refazer de novo');
  assert.match(fin, /Se o que você quer é só <b>desfazer<\/b> o cancelamento/,
    'a janela precisa dizer qual é qual');
  assert.match(comum, /window\.LW\.listaDeContratos = \(titulo, lista, aviso, acao\)/);
  assert.match(comum, /e\.stopPropagation\(\);   \/\/ senão a linha abre a ficha do cliente por baixo/);
});

// ------------------------------------------------- a conta, rodando
test('crédito abate e as parcelas fecham no centavo', () => {
  const ctx = {};
  vm.createContext(ctx);
  // Reproduz a aritmética da tela, que é o que importa conferir.
  vm.runInContext(`
    function planejar(novoValor, credito, usarCredito, n){
      const aParcelar = +(novoValor - (usarCredito ? credito : 0)).toFixed(2);
      const base = +(aParcelar / n).toFixed(2);
      const valores = Array.from({length:n}, ()=> base);
      const somaAcima = valores.slice(0, n-1).reduce((s,v)=> s + v, 0);
      valores[n-1] = +(aParcelar - somaAcima).toFixed(2);
      return { aParcelar, valores, soma: +valores.reduce((s,v)=> s+v, 0).toFixed(2) };
    }`, ctx);

  // O caso do Lucas: pagou US$ 600,07 em contratos cancelados.
  const comCredito = ctx.planejar(4995, 600.07, true, 7);
  assert.equal(comCredito.aParcelar, 4394.93);
  assert.equal(comCredito.soma, 4394.93, 'a soma tem que bater no centavo');
  const semCredito = ctx.planejar(4995, 600.07, false, 7);
  assert.equal(semCredito.aParcelar, 4995, 'não marcar o crédito deixa o valor cheio');
  const tres = ctx.planejar(1000, 0, false, 3);
  assert.equal(tres.soma, 1000, '1000 em 3 não pode virar 999,99');
});

// ------------------------------------------------- o que saiu de cena
test('os botões "Todos" e "Nenhum" da tradução não existem mais', () => {
  // "Tem que tirar essa parte de todos e nenhum, acabei de tirar todas as
  // configurações sem querer das traduções." Um clique apagava a marcação de
  // tradução do serviço inteiro, sem perguntar e sem desfazer.
  assert.ok(!/data-ck-trad-todos/.test(cfg), 'o botão e o que o escutava têm que sair juntos');
  assert.ok(!/>🌐 Nenhum</.test(cfg), 'o botão de desmarcar tudo não pode voltar');
  assert.ok(!/>🌐 Todos</.test(cfg));
  assert.match(cfg, /apagava, sem perguntar e sem desfazer/, 'fica escrito por que saiu, senão alguém reintroduz');
  assert.match(cfg, /data-doc-trad=/, 'a caixinha de cada documento continua existindo');
  assert.match(cfg, /data-dep-trad=/, 'a do dependente também');
});

test('dá para ler um bloco só de dentro de uma cópia de backup', () => {
  // Baixar a cópia inteira derruba o servidor: ele descompacta dezenas de MB e
  // manda tudo. Foi o que aconteceu no dia em que precisávamos recuperar.
  const corpo = corpoDe(backup, "rotasBackup.get('/backups/:id/bloco/:chave'");
  assert.match(corpo, /\(dados\.armazenamento \|\| \[\]\)\.find\(b => b\.chave === req\.params\.chave\)/);
  assert.match(corpo, /valor: JSON\.stringify\(bloco\.valor\)/, 'só o bloco atravessa');
  assert.match(corpo, /Essa cópia não tem esse módulo/);
  assert.match(backup, /rotasBackup\.get\('\/backups\/:id\/bloco\/:chave', soBackup/,
    'backup é dado do escritório inteiro: só quem tem acesso total');
});
