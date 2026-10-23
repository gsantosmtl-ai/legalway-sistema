// "Preciso fazer no financeiro a função de renegociação: será renegociar o
// valor do contrato, porém o número de parcelas será editável e o valor de cada
// parcela também, sendo que a última vai ser o valor restante do contrato. Por
// exemplo, as duas primeiras 500,00 e as demais 300,00. E tem que colocar a
// primeira parcela e, a partir dessa data, as novas parcelas substituírem as do
// contrato anterior."
//
// E o caso que originou tudo, o do senhor Antônio: 3 parcelas de 1.500, chegou
// o dia, o cliente só tinha 500. Pagou 500 e ficaram 1.000 em aberto. O que
// não pode acontecer de jeito nenhum é os 500 sumirem no acordo novo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fin = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');

function recortar(assinatura) {
  const i = fin.indexOf(assinatura);
  assert.ok(i >= 0, `não achei ${assinatura}`);
  let nivel = 0;
  for (let k = fin.indexOf('{', i); k < fin.length; k++) {
    if (fin[k] === '{') nivel++;
    else if (fin[k] === '}') { nivel--; if (nivel === 0) return fin.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham');
}

// Roda abrirRenegociacao de verdade contra dados na memória, com a tela trocada
// por um boneco. É o único jeito de provar o que acontece com o dinheiro.
function mundo({ parcelas, contrato }) {
  const salvos = { receber: null, contratos: null };
  const toasts = [];
  const campos = {};        // handler de cada campo do topo, por seletor
  let linhas = [];          // os campos de valor das parcelas, recriados a cada repintura
  let modalHtml = '';

  const fakeEl = () => ({
    className: '', id: '', _html: '',
    set innerHTML(v) { this._html = v; modalHtml = v; },
    get innerHTML() { return this._html; },
    querySelector: (sel) => ({ addEventListener: (_e, fn) => { campos[sel] = fn; }, value: '' }),
    // A tela se repinta a cada mudança; aqui guardamos sempre a última leva.
    querySelectorAll: (sel) => {
      if (!/data-rn-parcela/.test(sel)) return [];
      const quantas = (modalHtml.match(/data-rn-parcela="/g) || []).length;
      linhas = Array.from({ length: quantas }, (_, i) => ({
        value: '',
        getAttribute: () => String(i),
        addEventListener: (_e, fn) => { linhas[i].disparar = fn; },
      }));
      return linhas;
    },
    remove: () => {},
  });

  const ctx = {
    contasReceber: parcelas, contratos: [contrato],
    sessao: { nome: 'Peterson', acessoTotal: false, permissoes: { financeiro: 'editar' } },
    toast: (m) => toasts.push(m), toasts, salvos,
    render: () => {},
    uid: (p) => p + '-' + Math.random().toString(36).slice(2, 7),
    now: () => new Date('2026-10-22T12:00:00Z'),
    hoje: () => '2026-10-22',
    fmtMoney: (v) => 'US$ ' + Number(v || 0).toFixed(2),
    fmtData: (d) => String(d).split('-').reverse().join('/'),
    saveContasReceber: async () => { salvos.receber = true; return null; },
    saveContratos: async () => { salvos.contratos = true; return null; },
    LW: { escaparHtml: (x) => String(x == null ? '' : x) },
    document: { createElement: fakeEl, body: { appendChild: () => {} } },
    console, JSON, Math, Number, String, Array, Date, Object,
  };
  vm.createContext(ctx);
  for (const f of ['function podeRenegociar()', 'const ehQuitada =', 'const ehCancelada =',
                   'const parcelasAbertasDoContrato =', 'function somarRecebido(', 'function somarMeses(',
                   'function abrirRenegociacao(']) {
    const trecho = f.startsWith('const')
      ? fin.slice(fin.indexOf(f), fin.indexOf(';\n', fin.indexOf(f)) + 1)
      : recortar(f);
    vm.runInContext(trecho, ctx);
  }
  vm.runInContext(`abrirRenegociacao(${JSON.stringify(contrato.id)})`, ctx);

  // Digitar um valor numa parcela, como a pessoa faria.
  const escrever = (i, valor) => {
    linhas[i].value = String(valor);
    linhas[i].disparar();
  };
  return { ctx, campos, escrever, toasts, html: () => modalHtml };
}

// Os valores como estão desenhados na tela agora.
function valoresNaTela(m) {
  return [...m.html().matchAll(/data-rn-parcela="\d+" value="([\d.-]+)"/g)].map(x => Number(x[1]));
}

const antonio = () => ({
  contrato: { id: 'ct1', cliente: 'Antônio Silva', servico: 'Visto T', valor: 4500, vendedor: 'Renato' },
  parcelas: [
    { id: 'p1', contratoId: 'ct1', clienteNome: 'Antônio Silva', descricao: 'Parcela 1/3',
      valor: 1500, valorRecebido: 500, status: 'Pago parcialmente', vencimento: '2026-10-10' },
    { id: 'p2', contratoId: 'ct1', clienteNome: 'Antônio Silva', descricao: 'Parcela 2/3',
      valor: 1500, valorRecebido: 0, status: 'A vencer', vencimento: '2026-11-10' },
    { id: 'p3', contratoId: 'ct1', clienteNome: 'Antônio Silva', descricao: 'Parcela 3/3',
      valor: 1500, valorRecebido: 0, status: 'A vencer', vencimento: '2026-12-10' },
  ],
});

test('o dinheiro que já entrou nunca some', async () => {
  const { ctx, campos } = mundo(antonio());
  await campos['#rn-confirmar']();          // confirma sem mudar nada

  const p1 = ctx.contasReceber.find(c => c.id === 'p1');
  assert.equal(p1.status, 'Pago', 'a parcela paga pela metade fica quitada');
  assert.equal(p1.valor, 500, 'e encolhe para o que foi recebido de verdade');
  assert.equal(p1.valorRecebido, 500, 'o recebido não se mexe');
  assert.match(p1.observacao, /Renegociado em 22\/10\/2026 por Peterson/);

  // Nada se perdeu: o que já entrou + o que vai entrar fecha o contrato.
  const recebido = ctx.contasReceber.filter(c => c.status === 'Pago').reduce((s, c) => s + c.valorRecebido, 0);
  const aReceber = ctx.contasReceber.filter(c => c.status === 'A vencer').reduce((s, c) => s + c.valor, 0);
  assert.equal(+(recebido + aReceber).toFixed(2), 4500);
});

test('as parcelas em aberto são substituídas, não duplicadas', async () => {
  const { ctx, campos } = mundo(antonio());
  await campos['#rn-confirmar']();
  const canceladas = ctx.contasReceber.filter(c => c.status === 'Cancelado');
  assert.deepEqual(canceladas.map(c => c.id), ['p2', 'p3'], 'as duas a vencer saem de cena');
  assert.match(canceladas[0].observacao, /substituída pelo acordo novo/);
  const novas = ctx.contasReceber.filter(c => c.status === 'A vencer');
  assert.equal(novas.length, 3, 'nascem 3 novas — o mesmo número de aberto que havia');
  assert.ok(novas.every(c => c.contratoId === 'ct1' && c.clienteNome === 'Antônio Silva'),
    'as novas pertencem ao mesmo contrato e cliente');
});

test('a última parcela fecha a conta — o exemplo dela', async () => {
  // "As duas primeiras 500,00 e as demais 300,00, sendo que a última vai ser o
  // valor restante do contrato." Com saldo de 4.000 em 5 parcelas:
  // 500 + 500 + 300 + 300 = 1.600, e sobram 2.400 para a última.
  const m = mundo(antonio());
  m.campos['#rn-n']({ target: { value: '5' } });
  m.escrever(0, 500);
  m.escrever(1, 500);
  m.escrever(2, 300);
  m.escrever(3, 300);
  await m.campos['#rn-confirmar']();

  const novas = m.ctx.contasReceber.filter(c => c.status === 'A vencer');
  assert.deepEqual(novas.map(c => c.valor), [500, 500, 300, 300, 2400],
    'as quatro primeiras como ela digitou, e a última com o que resta');
  assert.equal(+novas.reduce((s, c) => s + c.valor, 0).toFixed(2), 4000,
    'o total fecha o saldo, sem sobrar centavo');
  assert.deepEqual(novas.map(c => c.vencimento),
    ['2026-10-10', '2026-11-10', '2026-12-10', '2027-01-10', '2027-02-10'],
    'mês a mês a partir da data da primeira');
  assert.deepEqual(novas.map(c => c.descricao),
    ['Parcela 1/5 (renegociado)', 'Parcela 2/5 (renegociado)', 'Parcela 3/5 (renegociado)',
     'Parcela 4/5 (renegociado)', 'Parcela 5/5 (renegociado)']);
});

test('digitou uma parcela, as de baixo se dividem por igual', async () => {
  // "Aqui eu quero colocar na primeira parcela o valor, e ele vai calculando
  // por igual as demais; se eu colocar a segunda ele calcula as demais, e
  // assim por diante."
  //
  // Antes a diferença toda caía na última: digitar 500 numa de 4.000 em 5
  // deixava quatro parcelas de 800 e uma de 700 — ninguém combina assim.
  const m = mundo(antonio());                  // saldo de 4.000
  m.campos['#rn-n']({ target: { value: '5' } });
  m.escrever(0, 500);
  assert.deepEqual(valoresNaTela(m), [500, 875, 875, 875, 875],
    'os 3.500 que sobram divididos por 4');

  m.escrever(1, 500);
  assert.deepEqual(valoresNaTela(m), [500, 500, 1000, 1000, 1000],
    'a primeira continua 500 e os 3.000 que sobram se dividem por 3');

  m.escrever(2, 2000);
  assert.deepEqual(valoresNaTela(m), [500, 500, 2000, 500, 500],
    'e de novo, só para baixo');
});

test('o que ela já digitou não se desfaz', async () => {
  // Digitar a parcela 2 depois da 4 não pode apagar a 4.
  const m = mundo(antonio());
  m.campos['#rn-n']({ target: { value: '4' } });
  m.escrever(2, 100);                           // mexe na terceira
  m.escrever(0, 1000);                          // volta para a primeira
  const v = valoresNaTela(m);
  assert.equal(v[0], 1000, 'a primeira é a que ela acabou de digitar');
  assert.equal(v[2], 100, 'a terceira continua como ela deixou');
  assert.equal(+v.reduce((s, x) => s + x, 0).toFixed(2), 4000, 'e a soma fecha');
});

test('mudar quantas parcelas recomeça a divisão', async () => {
  // Senão sobraria um valor digitado para uma linha que não existe mais.
  const m = mundo(antonio());
  m.escrever(0, 2500);
  m.campos['#rn-n']({ target: { value: '4' } });
  assert.deepEqual(valoresNaTela(m), [1000, 1000, 1000, 1000],
    'tudo por igual de novo');
});

test('a última parcela não se digita — ela é o resto', async () => {
  // Deixar a última editável permitiria um acordo que não fecha com o contrato.
  const m = mundo(antonio());
  assert.match(m.html(), /data-rn-parcela="2" value="[\d.]+" readonly/,
    'a última tem que ser somente leitura');
  m.escrever(2, 9999);                 // tentar mexer nela não pode valer
  await m.campos['#rn-confirmar']();
  const novas = m.ctx.contasReceber.filter(c => c.status === 'A vencer');
  assert.equal(+novas.reduce((s, c) => s + c.valor, 0).toFixed(2), 4000,
    'o total continua sendo o saldo');
});

test('parcela maior que o saldo avisa em vez de gravar errado', async () => {
  const m = mundo(antonio());
  m.escrever(0, 5000);                 // mais do que os 4.000 em aberto
  assert.match(m.html(), /somam mais do que o saldo/, 'a tela precisa dizer o que está errado');
  assert.match(m.html(), /id="rn-confirmar" disabled/, 'e não deixar confirmar');
  await m.campos['#rn-confirmar']();
  assert.equal(m.ctx.contasReceber.filter(c => c.status === 'Cancelado').length, 0,
    'nada pode ter sido cancelado');
  assert.match(m.toasts.join(' '), /negativa/);
});

test('mudar o valor do contrato muda o saldo a parcelar', async () => {
  const { ctx, campos } = mundo(antonio());
  campos['#rn-valor']({ target: { value: '3000' } });   // desconto
  await campos['#rn-confirmar']();
  const novas = ctx.contasReceber.filter(c => c.status === 'A vencer');
  assert.equal(+novas.reduce((s, c) => s + c.valor, 0).toFixed(2), 2500,
    '3.000 de contrato menos os 500 que já entraram');
  assert.equal(ctx.contratos[0].valor, 3000, 'o contrato passa a valer o combinado novo');
});

test('fica escrito quem renegociou, quando, e de quanto para quanto', async () => {
  // Some dinheiro do faturamento: ninguém pode descobrir isso por acaso.
  const { ctx, campos } = mundo(antonio());
  campos['#rn-valor']({ target: { value: '3000' } });
  await campos['#rn-confirmar']();
  const r = ctx.contratos[0].renegociacoes[0];
  assert.equal(r.por, 'Peterson');
  assert.equal(r.valorAntes, 4500);
  assert.equal(r.valorDepois, 3000);
  assert.equal(r.jaPagoNaEpoca, 500);
  assert.match(ctx.contratos[0].historico[0].texto, /de US\$ 4500\.00 para US\$ 3000\.00/);
});

test('as datas saem da primeira parcela, mês a mês', () => {
  const { ctx } = mundo(antonio());
  const somar = vm.runInContext('somarMeses', ctx);
  assert.equal(somar('2026-11-10', 0), '2026-11-10');
  assert.equal(somar('2026-11-10', 3), '2027-02-10', 'vira o ano sem tropeçar');
  assert.equal(somar('2026-01-31', 1), '2026-02-28', 'dia 31 em fevereiro cai no último dia');
});

test('só o Financeiro renegocia', () => {
  const pode = (sessao) => {
    const ctx = { sessao };
    vm.createContext(ctx);
    vm.runInContext(recortar('function podeRenegociar()') + '\nglobalThis.f = podeRenegociar;', ctx);
    return ctx.f();
  };
  // A sessão guarda `permissoes`, não `modulos`. Escrevi `modulos` primeiro e o
  // Peterson, que é exatamente quem ela disse que renegocia, não veria o botão.
  assert.equal(pode({ nome: 'Peterson', permissoes: { financeiro: 'editar' } }), true);
  assert.equal(pode({ nome: 'Tatiane', acessoTotal: true, permissoes: {} }), true);
  assert.equal(pode({ nome: 'Quem só olha', permissoes: { financeiro: 'ver' } }), false,
    'quem só consulta o Financeiro não refaz contrato');
  assert.equal(pode({ nome: 'Vitória', permissoes: { documentos: 'editar' } }), false, 'documentação não mexe em dinheiro');
  assert.equal(pode({ nome: 'Renato', permissoes: { funil: 'editar' } }), false, 'nem o comercial');
  assert.equal(pode({ nome: 'Sem nada' }), false);
  assert.equal(pode(null), false);
  // E o botão nem aparece para quem não pode.
  assert.match(fin, /podeRenegociar\(\) \? `<button data-renegociar="\$\{c\.contratoId\}"/,
    'o botão precisa ser escondido, não só bloqueado');
});

test('contrato sem parcela em aberto não abre o acordo', async () => {
  const dados = antonio();
  dados.parcelas.forEach(p => { p.status = 'Pago'; p.valorRecebido = p.valor; });
  const { toasts } = mundo(dados);
  assert.match(toasts.join(' '), /não tem parcela em aberto/);
});
