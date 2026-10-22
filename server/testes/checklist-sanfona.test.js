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
