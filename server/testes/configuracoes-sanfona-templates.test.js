// Duas coisas da mesma tela: os sete painéis de Templates fechados por padrão, e o
// levantamento pesado dos backups saindo da frente da aba que a pessoa clicou.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

test('os templates viram sanfona, fechada por padrão', () => {
  assert.match(cfg, /function sanfonarPaineis\(el, chaveEstado\)/, 'falta a sanfona');
  assert.match(cfg, /sanfonarPaineis\(el, 'legalway-templates-abertos'\)/,
    'a aba de Templates precisa chamar a sanfona');
});

test('clicar no título abre e fecha', () => {
  const i = cfg.indexOf('function sanfonarPaineis');
  const corpo = cfg.slice(i, i + 1800);
  assert.match(corpo, /if\(abertos\.has\(nome\)\) abertos\.delete\(nome\); else abertos\.add\(nome\)/,
    'o mesmo clique tem que alternar');
  assert.match(corpo, /aberto \? '▾' : '▸'/, 'falta a setinha de estado');
});

test('o que foi aberto sobrevive a recarregar', () => {
  const i = cfg.indexOf('function sanfonarPaineis');
  const corpo = cfg.slice(i, i + 1800);
  assert.match(corpo, /localStorage\.getItem\(chaveEstado/, 'falta ler o estado');
  assert.match(corpo, /localStorage\.setItem\(chaveEstado/, 'falta guardar o estado');
  assert.match(corpo, /catch\(e\)\{\}/, 'navegador sem localStorage não pode quebrar a tela');
});

test('a sanfona não se aplica duas vezes no mesmo painel', () => {
  // Rodar de novo embrulharia o corpo dentro de outro invólucro e esconderia tudo.
  const i = cfg.indexOf('function sanfonarPaineis');
  const corpo = cfg.slice(i, i + 1800);
  assert.match(corpo, /if\(!titulo \|\| painel\.dataset\.sanfona\) return/, 'falta a trava de reentrada');
});

test('o peso dos backups sai da frente da tela', () => {
  // Varre a tabela de arquivos inteira — 3.767 documentos, 3,2 GB — e segurava a aba
  // que a pessoa clicou em "Carregando…".
  assert.match(cfg, /function depoisDaTela\(f\)/, 'falta o adiamento');
  assert.match(cfg, /depoisDaTela\(listarBackups\)/, 'a lista de backups deveria esperar');
  assert.match(cfg, /depoisDaTela\(pesoDosArquivos\)/, 'o peso dos arquivos deveria esperar');
  assert.ok(!/^listarBackups\(\);$/m.test(cfg), 'ainda roda no carregamento');
  assert.ok(!/^pesoDosArquivos\(\);$/m.test(cfg), 'ainda roda no carregamento');
});

test('navegador sem requestIdleCallback continua funcionando', () => {
  const i = cfg.indexOf('function depoisDaTela');
  assert.match(cfg.slice(i, i + 320), /else setTimeout\(f, 1500\)/, 'falta o plano B');
});
