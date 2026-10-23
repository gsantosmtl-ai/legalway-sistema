// Faltava desfazer um recebimento lançado errado.
//
// Digitou 5.000 em vez de 500, ou deu baixa na parcela do cliente errado: não
// havia caminho de volta pela tela. O modal de editar conta não tem campo de
// valor recebido, então a única saída era mexer no banco — e o número errado
// ficava no saldo da conta, no fluxo e no DRE enquanto isso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fin = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const i = fin.indexOf(assinatura);
  assert.notEqual(i, -1, 'não achei ' + assinatura);
  let n = 0;
  for (let k = fin.indexOf('{', i); k < fin.length; k++) {
    if (fin[k] === '{') n++;
    else if (fin[k] === '}') { n--; if (n === 0) return fin.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham');
}

function palco({ parcela, hoje = '2026-10-23', pode = true, motivo = 'Valor digitado errado' }) {
  const ctx = {
    console, hoje: () => hoje, now: () => new Date('2026-10-23T12:00:00Z'),
    fmtMoney: (v) => 'US$ ' + Number(v || 0), fmtDia: (d) => d,
    sessao: { nome: 'Peterson' },
    podeRenegociar: () => pode,
    contasReceber: [parcela], avisos: [], gravou: null,
    toast: (m) => ctx.avisos.push(m), render: () => {},
    saveContasReceber: async () => { ctx.gravou = JSON.parse(JSON.stringify(ctx.contasReceber)); return null; },
    LW: { escolherComTexto: async () => motivo },
  };
  vm.createContext(ctx);
  vm.runInContext(corpoDe('async function estornarRecebimento(id)'), ctx);
  return ctx;
}
const PARCELA = (x) => ({ id: 'f1', clienteNome: 'Maria', valor: 500, valorRecebido: 5000,
  vencimento: '2026-11-20', status: 'Pago', conta: 'Chase', dataRecebimento: '2026-10-20', ...x });

test('estorna, zera o recebido e devolve a parcela ao estado certo', async () => {
  const ctx = palco({ parcela: PARCELA() });
  await ctx.estornarRecebimento('f1');
  const g = ctx.gravou[0];
  assert.equal(g.valorRecebido, 0);
  assert.equal(g.dataRecebimento, null);
  assert.equal(g.status, 'A vencer', 'vence em novembro: volta para A vencer');
  assert.equal(g.liquido, null, 'a taxa do cartão sai junto: não houve pagamento');
  assert.equal(g.taxa, null);
});

test('parcela JÁ VENCIDA estornada volta como Atrasado, não como A vencer', () => {
  // Devolver para "A vencer" esconderia a dívida da inadimplência.
  return (async () => {
    const ctx = palco({ parcela: PARCELA({ vencimento: '2026-09-01' }) });
    await ctx.estornarRecebimento('f1');
    assert.equal(ctx.gravou[0].status, 'Atrasado');
  })();
});

test('fica o rastro: quanto, por quê, quem e quando', async () => {
  const ctx = palco({ parcela: PARCELA() });
  await ctx.estornarRecebimento('f1');
  const g = ctx.gravou[0];
  assert.equal(g.estornos.length, 1);
  assert.equal(g.estornos[0].valor, 5000, 'o valor estornado não pode se perder');
  assert.equal(g.estornos[0].motivo, 'Valor digitado errado');
  assert.equal(g.estornos[0].por, 'Peterson');
  assert.match(g.observacao, /Estorno de US\$ 5000 em 2026-10-23 por Peterson — Valor digitado errado/);
});

test('a observação que já existia não é apagada', async () => {
  const ctx = palco({ parcela: PARCELA({ observacao: 'Cliente pediu boleto' }) });
  await ctx.estornarRecebimento('f1');
  assert.match(ctx.gravou[0].observacao, /^Cliente pediu boleto \| Estorno/);
});

test('só o Financeiro estorna', async () => {
  const ctx = palco({ parcela: PARCELA(), pode: false });
  await ctx.estornarRecebimento('f1');
  assert.equal(ctx.gravou, null);
  assert.match(ctx.avisos.join(' '), /Só o Financeiro estorna/);
});

test('parcela sem recebimento não tem o que estornar', async () => {
  const ctx = palco({ parcela: PARCELA({ valorRecebido: 0, status: 'A vencer' }) });
  await ctx.estornarRecebimento('f1');
  assert.equal(ctx.gravou, null);
  assert.match(ctx.avisos.join(' '), /não tem recebimento para estornar/);
});

test('desistir da pergunta não estorna', async () => {
  const ctx = palco({ parcela: PARCELA(), motivo: null });
  await ctx.estornarRecebimento('f1');
  assert.equal(ctx.gravou, null);
  assert.equal(ctx.contasReceber[0].valorRecebido, 5000);
});

test('se o valor mudou durante a pergunta, não estorna', async () => {
  // Alguém deu outra baixa enquanto ela escolhia o motivo.
  const ctx = palco({ parcela: PARCELA() });
  ctx.LW.escolherComTexto = async () => { ctx.contasReceber[0].valorRecebido = 5500; return 'Outro'; };
  await ctx.estornarRecebimento('f1');
  assert.equal(ctx.gravou, null);
  assert.match(ctx.avisos.join(' '), /A parcela mudou enquanto você confirmava/);
});

test('o botão só aparece quando há o que estornar, e só para quem pode', () => {
  assert.match(fin, /\$\{Number\(c\.valorRecebido\|\|0\) > 0 && podeRenegociar\(\)/);
  assert.match(fin, /data-estornar="\$\{c\.id\}" style="color:var\(--red\);">↩ Estornar recebimento/);
  assert.match(fin, /querySelectorAll\('\[data-estornar\]'\)\.forEach\(el=> el\.addEventListener\('click', \(ev\)=>\{ ev\.stopPropagation\(\)/,
    'o clique não pode abrir a linha por baixo do menu');
});
