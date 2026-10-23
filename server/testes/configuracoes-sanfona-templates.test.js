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

test('o backup só é levantado quando ela abre a aba de Backup', () => {
  // Varre a tabela de arquivos inteira — 3.767 documentos, 3,2 GB — e segurava a aba
  // que a pessoa clicou em "Carregando…". Antes isso era adiado para quando a tela
  // ficasse livre; agora nem isso: o backup virou aba própria e só se levanta lá.
  assert.match(cfg, /if\(mostrar && !backupJaCarregado\)\{ backupJaCarregado = true; listarBackups\(\); pesoDosArquivos\(\); montarModulosRecuperaveis\(\); \}/,
    'as duas varreduras pesadas precisam esperar a aba de Backup');
  assert.ok(!/^listarBackups\(\);$/m.test(cfg), 'não pode rodar no carregamento da página');
  assert.ok(!/^pesoDosArquivos\(\);$/m.test(cfg), 'não pode rodar no carregamento da página');
  assert.ok(!/depoisDaTela\(/.test(cfg), 'o adiamento antigo não faz mais falta — e sobrando, confunde');
});

test('o backup não aparece embaixo de todas as abas', () => {
  // "backup de sistema não tem que aparecer em tudo, tem que ter uma aba só de backup".
  assert.match(cfg, /<div class="tab2" data-tab="backup" id="tab-backup" style="display:none;">💾 Backup<\/div>/,
    'falta a aba de backup');
  assert.match(cfg, /const mostrar = tabAtiva === 'backup' && !!\(sessao && sessao\.acessoTotal\)/,
    'o bloco só aparece na aba dele, e só para quem tem acesso total');
  assert.match(cfg, /blocoBackup\.style\.display = mostrar \? 'block' : 'none'/,
    'nas outras abas ele tem que sumir');
  // E a aba em si só existe para quem pode usá-la.
  assert.match(cfg, /document\.getElementById\('tab-backup'\)\.style\.display = ''/,
    'a aba aparece quando a pessoa tem acesso total');
});
