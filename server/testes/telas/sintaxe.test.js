// A pergunta mais barata de todas, e a que ninguém estava fazendo: ISSO
// COMPILA?
//
// Um erro de sintaxe no JavaScript de uma tela não degrada nada — mata a tela
// inteira. O navegador para de executar o bloco no ponto do erro, nenhum
// `addEventListener` é registrado, e a pessoa vê uma página parada, sem aviso
// nenhum. Nenhuma das outras baterias pega isso: todas leem o código como
// TEXTO.
//
// Vale para as 28 telas, para os arquivos de assets/ e para os modelos de
// contrato — que são as páginas que o CLIENTE abre para assinar.
//
// `new vm.Script` compila sem executar: é o mesmo parser do navegador, sem
// rodar uma linha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { TELAS, DOCS, RAIZ, lerTela, scriptsDa } from './_base.js';

function compila(codigo, nome) {
  try { new vm.Script(codigo, { filename: nome }); return null; }
  catch (e) { return `${e.name}: ${e.message}`; }
}

for (const tela of TELAS) {
  test(`${tela} · o JavaScript da tela compila`, () => {
    const pedacos = scriptsDa(lerTela(tela)).filter((s) => s.trim());
    assert.ok(pedacos.length > 0 || tela === 'index.html', `${tela} não tem script nenhum`);
    pedacos.forEach((s, i) => {
      const erro = compila(s, `${tela} <script> #${i + 1}`);
      assert.equal(erro, null, `${tela}, bloco ${i + 1}: ${erro}`);
    });
  });
}

const ASSETS = path.join(DOCS, 'assets');
for (const arquivo of readdirSync(ASSETS).filter((f) => f.endsWith('.js')).sort()) {
  test(`assets/${arquivo} · compila`, () => {
    const erro = compila(readFileSync(path.join(ASSETS, arquivo), 'utf8'), arquivo);
    assert.equal(erro, null, `assets/${arquivo}: ${erro}`);
  });
}

const MODELOS = path.join(DOCS, 'contratos-templates');
for (const arquivo of readdirSync(MODELOS).sort()) {
  const cheio = path.join(MODELOS, arquivo);
  test(`contratos-templates/${arquivo} · compila`, () => {
    const texto = readFileSync(cheio, 'utf8');
    if (arquivo.endsWith('.js')) {
      assert.equal(compila(texto, arquivo), null);
      return;
    }
    // É a página que o cliente abre para assinar. Um erro aqui e o botão de
    // assinar não existe.
    scriptsDa(texto).filter((s) => s.trim()).forEach((s, i) => {
      const erro = compila(s, `${arquivo} <script> #${i + 1}`);
      assert.equal(erro, null, `${arquivo}, bloco ${i + 1}: ${erro}`);
    });
  });
}

test('o servidor inteiro compila', () => {
  // Módulos ES: `new vm.SourceTextModule` exigiria flag. Compilar como script
  // falharia no `import`, então aqui a conferência é a do próprio Node, feita
  // pelo `npm test` ao importar tudo. O que dá para fazer barato é garantir
  // que nenhum arquivo ficou com marca de conflito de merge.
  const dir = path.join(RAIZ, 'server', 'src');
  const sujos = [];
  const varrer = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { varrer(p); continue; }
      if (!f.name.endsWith('.js')) continue;
      const t = readFileSync(p, 'utf8');
      if (/^<{7} |^={7}$|^>{7} /m.test(t)) sujos.push(path.relative(RAIZ, p));
    }
  };
  varrer(dir);
  assert.deepEqual(sujos, []);
});
