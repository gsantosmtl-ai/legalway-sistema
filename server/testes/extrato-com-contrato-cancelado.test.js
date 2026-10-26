// O contrato cancelado entra no "Contratado" do extrato.
//
// O que ela viu: a Monica Kramer com CONTRATADO US$ 0 e JÁ PAGO US$ 4.473,82.
// Um papel que vai para a mão do cliente dizendo que ele pagou quase cinco mil
// dólares por nada.
//
// A causa: `totalContratado` filtrava `etapa !== 'Cancelado'`, com a intenção
// de não fazer o cliente achar que devia por um serviço que não existe mais.
// Só que "falta pagar" NUNCA saiu de contratado menos pago — ele vem das
// parcelas em aberto, e parcela cancelada já era excluída de lá. Então o
// filtro não protegia de dívida nenhuma: só quebrava a conta de cima.
//
// Agora o cancelado é somado E identificado. Esconder um contrato pelo qual o
// cliente PAGOU deixa o extrato sem explicação para o dinheiro que ele mostra.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/clientes.html', import.meta.url), 'utf8');
const corpoDe = (de, ate) => {
  const i = tela.indexOf(de);
  assert.ok(i >= 0, 'não achei: ' + de);
  return tela.slice(i, tela.indexOf(ate, i));
};
const semComent = (t) => t.replace(/^\s*\/\/.*$/gm, '');

test('o contratado soma TODOS os contratos, inclusive o cancelado', () => {
  const h = semComent(corpoDe("else if(activeDtab === 'financeiro')", 'body.innerHTML'));
  assert.match(h, /const totalContratado = ctrs\.reduce\(/);
  assert.ok(!/ctrs\.filter\(c=>c\.etapa!=='Cancelado'\)\.reduce/.test(h),
    'voltar a filtrar aqui faz o extrato dizer que o cliente pagou por nada');
});

test('"falta pagar" continua vindo das parcelas, não de contratado menos pago', () => {
  // É isto que torna seguro somar o cancelado em cima: as duas contas são
  // independentes. Se um dia alguém ligar uma na outra, o cancelado vira
  // dívida de novo — e aí o cliente é cobrado por um serviço que não existe.
  const h = semComent(corpoDe("else if(activeDtab === 'financeiro')", 'body.innerHTML'));
  assert.match(h, /const falta = cobrancas\.filter\(emAberto\)/);
  assert.match(h, /cr\.status !== 'Pago' && cr\.status !== 'Cancelado'/);
  assert.ok(!/falta = .*totalContratado/.test(h),
    'falta pagar não pode sair de contratado menos pago');
});

test('quando há cancelado no total, a tela diz quanto é', () => {
  // Número que muda sem explicação faz quem confere achar que o sistema errou.
  const h = corpoDe("else if(activeDtab === 'financeiro')", 'document.getElementById(\'btn-extrato-pdf\')');
  assert.match(h, /const canceladoNoTotal = ctrs\.filter\(c=>c\.etapa==='Cancelado'\)/);
  assert.match(h, /cancelado\)<\/span>/);
});

test('o extrato impresso lista o contrato cancelado, marcado', () => {
  const h = corpoDe('async function gerarExtratoPDF(', 'const proxima');
  assert.ok(!/const ativos = ctrs\.filter\(c=>c\.etapa !== 'Cancelado'\)/.test(h),
    'o contrato pelo qual o cliente pagou não pode sumir do papel');
  assert.match(tela, /\(cancelado\)<\/span>/);
  // Cancelado por último: o que vale hoje vem primeiro.
  assert.match(h, /\(a\.etapa === 'Cancelado' \? 1 : 0\) - \(b\.etapa === 'Cancelado' \? 1 : 0\)/);
});

test('o cartão CONTRATADO do papel diz quanto do total é cancelado', () => {
  const h = corpoDe('>CONTRATADO</div>', 'JÁ PAGO');
  assert.match(h, /tot\.canceladoNoTotal/);
  assert.match(h, /inclui \$\{fmtMoney\(tot\.canceladoNoTotal\)\} cancelado/);
});

test('o valor cancelado chega ao gerador do PDF', () => {
  // Sem isso o cartão do papel nunca mostraria a explicação, e o extrato
  // impresso teria um total sem origem.
  assert.match(tela, /gerarExtratoPDF\(cl, ctrs, cobrancas, \{totalContratado, canceladoNoTotal,/);
});

test('parcela cancelada continua fora da lista impressa', () => {
  // Treze linhas canceladas de uma renegociação só confundem quem recebe. O
  // que mudou foi o CONTRATO no topo, não as parcelas.
  const h = corpoDe('async function gerarExtratoPDF(', 'const proxima');
  assert.match(h, /cobrancas = cobrancas\.filter\(c=> c\.status !== 'Cancelado'\)/);
});
