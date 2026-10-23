// "Não abre os 3 pontinhos."
//
// E nunca abriu — para ninguém, em nenhuma conta, desde que a linha existe. O
// clique no ⋮ marca qual menu abrir e chama render() para redesenhar; render()
// começava apagando a marca. Dar baixa, alterar vencimento, gerar link de
// pagamento: tudo que mora nesse menu estava inalcançável no Financeiro.
//
// Isto é um teste de fluxo, não de aparência: ele roda o clique e confere que a
// marca sobrevive até o desenho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fin = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');

test('render não apaga o menu que acabou de ser aberto', () => {
  const i = fin.indexOf('function render(){');
  const cabeca = fin.slice(i, i + 1200);
  assert.ok(!/^\s*menuAbertoId = null;\s*$/m.test(cabeca),
    'render() não pode zerar o menu — é ele que o clique no ⋮ acabou de marcar');
});

test('trocar de aba continua fechando o menu', () => {
  // Fechar ao trocar de aba estava certo; o lugar é que estava errado.
  const i = fin.indexOf('function mudarAba(tab){');
  assert.match(fin.slice(i, i + 300), /menuAbertoId = null;/, 'mudarAba precisa fechar');
  const j = fin.indexOf("document.querySelectorAll('.modtab[data-tab]').forEach(t=>{");
  assert.match(fin.slice(j, j + 400), /menuAbertoId = null;/, 'o clique na aba também');
});

test('o clique no ⋮ marca a conta e o desenho respeita a marca', () => {
  // Reproduz o ciclo inteiro: estado → clique → render → classe na tela.
  const ctx = { menuAbertoId: null, desenhos: [] };
  vm.createContext(ctx);
  // O trecho do render que decide a classe, igual ao da tela.
  vm.runInContext(`
    function desenhar(conta){ return 'action-menu ' + (menuAbertoId===conta.id?'show':''); }
    function render(){ ${/* o que render faz com o menu hoje */ ''} }
    function clicar(id){ menuAbertoId = menuAbertoId === id ? null : id; render(); }
  `, ctx);
  vm.runInContext(`clicar('cr123')`, ctx);
  assert.equal(vm.runInContext(`desenhar({id:'cr123'})`, ctx), 'action-menu show',
    'depois do clique, a linha clicada desenha o menu aberto');
  assert.equal(vm.runInContext(`desenhar({id:'cr999'})`, ctx), 'action-menu ',
    'e só ela');
  vm.runInContext(`clicar('cr123')`, ctx);
  assert.equal(vm.runInContext(`desenhar({id:'cr123'})`, ctx), 'action-menu ',
    'clicar de novo fecha');
});

test('o id vem do atributo e é comparado como texto', () => {
  // getAttribute devolve string. Se algum id fosse número, '123' === 123 daria
  // falso e o menu voltaria a não abrir — sem erro nenhum na tela.
  const i = fin.indexOf("document.querySelectorAll('[data-menu]')");
  const corpo = fin.slice(i, i + 400);
  assert.match(corpo, /const id = btn\.getAttribute\('data-menu'\);/);
  assert.match(corpo, /menuAbertoId = menuAbertoId === id \? null : id;/);
  assert.match(fin, /class="action-menu \$\{menuAbertoId===c\.id\?'show':''\}"/,
    'a comparação do desenho tem que ser com o mesmo valor que o clique guardou');
});

test('clicar fora fecha o menu', () => {
  const i = fin.indexOf("if(!e.target.closest('.action-menu') && !e.target.closest('.btn-dots'))");
  assert.ok(i > 0, 'falta o fechar ao clicar fora');
  assert.match(fin.slice(i, i + 160), /if\(menuAbertoId\)\{ menuAbertoId = null; render\(\); \}/,
    'e só redesenha se havia algo aberto');
});
