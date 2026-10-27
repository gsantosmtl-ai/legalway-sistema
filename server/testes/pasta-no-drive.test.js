// A pasta do cliente no Drive, ligada à ficha.
//
// O Drive tem 22,45 GB e os documentos do sistema moram dentro do Postgres
// (volume hoje em 3,1 GB). Copiar um no outro estouraria o banco — e não
// precisa: a equipe já cria uma pasta por cliente conforme ele entra. O que
// faltava era só o caminho de ida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

test('a ficha tem o link da pasta', () => {
  assert.match(tela, /id="d-drive"/);
  assert.match(tela, /Pasta no Drive/);
  assert.match(tela, /target="_blank"/, 'não pode tirar a pessoa do sistema');
  assert.match(tela, /rel="noopener"/, 'aba nova sem noopener dá acesso à janela de origem');
});

test('nasce escondido e só aparece quando há nome', () => {
  // Link vazio apontando para uma busca sem termo levaria a pessoa para o
  // Drive inteiro, e ela acharia que a pasta sumiu.
  assert.match(tela, /id="d-drive"[\s\S]{0,200}display:none/);
  assert.match(tela, /else elDrive\.style\.display = 'none';/);
});

test('o nome vai escapado para a URL', () => {
  // Nome com acento, espaço ou "&" quebraria a busca — e há muitos assim.
  assert.match(tela, /encodeURIComponent\(nome \+ ' type:folder'\)/);
});

test('busca pelo nome, não id guardado', () => {
  // Guardar o id da pasta exigiria mapear cada cliente e remapear a cada
  // cliente novo. A busca serve para quem já existe e para quem entrar
  // amanhã, sem manutenção.
  assert.match(tela, /drive\.google\.com\/drive\/search\?q=/);
  assert.doesNotMatch(tela, /drive\.google\.com\/drive\/folders\/\$\{/,
    'id de pasta fixo no código envelhece no primeiro cliente novo');
});
