// São 21 serviços. Abertos todos de uma vez, a tela de Checklist por serviço vira uma
// parede de rolagem e ninguém acha o que procura. Nascem fechados; a pessoa abre o que
// quer ver, e o que ela abriu fica guardado para a próxima visita.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

test('os serviços nascem fechados', () => {
  assert.match(cfg, /const checklistsAbertos = new Set\(/,
    'falta o controle de quais estão abertos');
  assert.match(cfg, /const aberto = checklistsAbertos\.has\(s\.nome\)/,
    'cada serviço precisa saber se está aberto');
  assert.match(cfg, /style="display:\$\{aberto \? 'block' : 'none'\};"/,
    'o corpo do serviço deveria ficar escondido quando fechado');
});

test('clicar no nome abre e clicar de novo fecha', () => {
  assert.match(cfg, /if\(checklistsAbertos\.has\(nome\)\) checklistsAbertos\.delete\(nome\); else checklistsAbertos\.add\(nome\)/,
    'o mesmo clique tem que alternar');
  assert.match(cfg, /\$\{aberto \? '▾' : '▸'\}/, 'falta a setinha que mostra o estado');
});

test('clicar num botão do cabeçalho não fecha a seção', () => {
  // "Completar da biblioteca" e os de tradução ficam no cabeçalho. Sem esta guarda,
  // usar qualquer um deles fecharia a seção na cara da pessoa.
  const i = cfg.indexOf("[data-ck-abrir]");
  const trecho = cfg.slice(i, i + 500);
  assert.match(trecho, /if\(e\.target\.closest\('button'\)\) return/,
    'clique em botão do cabeçalho não pode alternar a seção');
});

test('o que a pessoa abriu sobrevive a recarregar a página', () => {
  assert.match(cfg, /localStorage\.getItem\('legalway-ck-abertos'/, 'falta ler o estado guardado');
  assert.match(cfg, /localStorage\.setItem\('legalway-ck-abertos'/, 'falta guardar o estado');
  assert.match(cfg, /catch\(e\)\{ return \[\]; \}/,
    'navegador sem localStorage não pode quebrar a tela');
});

test('os botões do cabeçalho somem com a seção fechada', () => {
  // Botão visível de uma seção fechada confunde: parece que age sobre a tela toda.
  assert.match(cfg, /display:\$\{aberto \? 'flex' : 'none'\}/,
    'os botões do cabeçalho deveriam acompanhar o estado');
});

// ---- Abas Titular / Dependente dentro do serviço ----
test('o serviço aberto mostra as duas abas', () => {
  assert.match(cfg, /data-ck-aba="\$\{LW\.escaparHtml\(s\.nome\)\}\|titular"/, 'falta a aba do titular');
  assert.match(cfg, /data-ck-aba="\$\{LW\.escaparHtml\(s\.nome\)\}\|dependente"/, 'falta a aba do dependente');
  assert.match(cfg, /const abaDep = checklistsAba\.get\(s\.nome\) === 'dependente'/, 'falta o estado da aba');
});

test('só uma lista aparece por vez', () => {
  assert.match(cfg, /style="display:\$\{abaDep \? 'none' : 'block'\};"/, 'a lista do titular deveria sumir na aba do dependente');
  assert.match(cfg, /<div style="display:\$\{abaDep \? 'block' : 'none'\};">/, 'a lista do dependente deveria sumir na aba do titular');
});

test('a aba abre sempre no titular', () => {
  // É a lista principal; abrir no dependente confundiria quem só quer conferir o serviço.
  assert.match(cfg, /const checklistsAba = new Map\(\);/,
    'o estado da aba não deveria ser guardado entre visitas');
});

test('clicar na aba não fecha o serviço', () => {
  const i = cfg.indexOf("[data-ck-aba]");
  const trecho = cfg.slice(i, i + 400);
  assert.match(trecho, /e\.stopPropagation\(\)/,
    'sem isto o clique sobe para o cabeçalho e fecha a seção inteira');
});

test('o que foi digitado não se perde ao redesenhar', () => {
  // A observação de cada documento só é gravada quando o campo perde o foco. Clicar
  // numa aba redesenha a tela — sem fechar o campo antes, o texto ia embora.
  const i = cfg.indexOf('function renderChecklists(el){');
  const trecho = cfg.slice(i, i + 500);
  assert.match(trecho, /document\.activeElement\.blur\(\)/,
    'antes de redesenhar é preciso confirmar o campo em edição');
});
