// "Mande a carta de testemunha" sem mostrar como é uma carta de testemunha trava
// qualquer pessoa. Cada documento do checklist pode ter um EXEMPLO pronto, que o
// cliente baixa no portal e usa de base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const tela = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');
const automacoes = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const arquivos = readFileSync(new URL('../src/arquivos.js', import.meta.url), 'utf8');

test('o modelo se anexa no checklist do serviço', () => {
  assert.match(cfg, /data-doc-modelo=/, 'falta o campo de anexar modelo');
  assert.match(cfg, /documentos\[Number\(idx\)\]\.modelo = \{ nome: arq\.name, url: String\(leitor\.result\) \}/,
    'o arquivo deveria ser guardado no documento do serviço');
});

test('o modelo pode ser trocado ou removido', () => {
  // Modelo errado no ar é pior que modelo nenhum: o cliente segue o exemplo errado.
  assert.match(cfg, /data-doc-modelo-rm=/, 'falta o botão de tirar');
  assert.match(cfg, /delete ck\(id\)\.documentos\[Number\(idx\)\]\.modelo/, 'tirar precisa apagar mesmo');
});

test('arquivo grande demais é recusado antes de subir', () => {
  assert.match(cfg, /arq\.size > 8 \* 1024 \* 1024/, 'falta o limite de tamanho');
});

test('falha ao guardar o modelo aparece na tela', () => {
  // Sem isso a pessoa acha que anexou e o cliente nunca vê o exemplo.
  assert.match(cfg, /if\(erro\)\{ toast\('Não deu para guardar o modelo: ' \+ erro\)/,
    'o erro de gravação precisa aparecer');
});

test('o modelo viaja do serviço para o processo', () => {
  assert.match(automacoes, /modelo: d\.modelo \|\| null/, 'o processo precisa herdar o modelo');
  assert.match(docs, /modelo: d\.modelo \|\| null/, 'a tela de Documentação idem');
});

test('o cliente vê e baixa o exemplo', () => {
  assert.match(portal, /modelo: d\.modelo && d\.modelo\.url \?/, 'o portal precisa entregar o modelo');
  assert.match(tela, /Ver um exemplo pronto/, 'falta o link na tela do cliente');
});

test('o cliente consegue mesmo baixar — sem mexer na segurança', () => {
  // A autorização compara o id do arquivo dentro do processo inteiro. Como o modelo
  // fica no item do checklist do processo, o cliente passa por essa porta sem que
  // ninguém precise afrouxar a regra.
  assert.match(arquivos, /JSON\.stringify\(p\)\.includes\(id\)/,
    'a regra que permite o download do cliente mudou — reveja o modelo');
});
