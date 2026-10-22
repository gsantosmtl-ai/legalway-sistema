// A lista do dependente precisa estar VISÍVEL em Configurações, para a Tatiane decidir
// o que acrescentar, trocar ou tirar — e com as marcas de interno e de tradução à vista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

test('a lista do dependente aparece em Configurações mesmo sem lista própria', () => {
  // Sem ver o que o dependente recebe hoje, não dá para decidir o que mudar.
  assert.match(cfg, /É esta, exatamente o que o dependente vai receber hoje/,
    'a tela deveria mostrar a lista herdada');
  assert.match(cfg, /modelo\.documentos\|\|\[\]\)\.map\(\(d,n\)=>/,
    'a lista herdada tem que ser desenhada item a item');
});

test('copiar do titular cria uma lista independente', () => {
  assert.match(cfg, /data-copiar-dep=/, 'falta o botão de copiar');
  assert.match(cfg, /m\.documentosDependente = base\.map/, 'copiar deveria materializar a lista');
  assert.match(cfg, /precisaTraducao: d\.precisaTraducao !== false, interno: !!d\.interno/,
    'a cópia precisa levar os marcadores junto, senão ela nasce diferente do que estava valendo');
});
