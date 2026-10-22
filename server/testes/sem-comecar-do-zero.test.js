// "Tirar a opção de começar do zero."
//
// Era o botão que esvaziava leads, funil, SDR, agenda, contratos, clientes,
// contas a receber e a pagar, processos, tarefas e os acessos de portal — de
// uma vez, para toda a equipe. O sistema saiu da fase de demonstração: hoje são
// 264 processos e 29 contratos de gente real, e a única coisa que esse botão
// pode fazer é estragar.
//
// Este teste é um guarda: tirar da tela e deixar a rota viva seria pior do que
// não ter tirado nada — some o aviso e fica o estrago a um POST de distância.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;
const DOCS = new URL('../../docs/', import.meta.url).pathname;

test('a rota não existe mais no servidor', () => {
  assert.ok(!existsSync(join(SRC, 'comecar-do-zero.js')), 'o módulo precisa sumir');
  const index = readFileSync(join(SRC, 'index.js'), 'utf8');
  assert.ok(!/comecar-do-zero|rotasComecarDoZero/.test(index),
    'nem import nem montagem podem sobrar em index.js');
});

test('nenhuma tela chama o que não existe mais', () => {
  for (const tela of readdirSync(DOCS).filter(f => f.endsWith('.html'))) {
    const src = readFileSync(join(DOCS, tela), 'utf8');
    assert.ok(!/comecar-do-zero/.test(src), `${tela} ainda chama a rota que foi removida`);
    assert.ok(!/btn-comecar-do-zero|previa-zero|zero-com-lead/.test(src),
      `${tela} ainda tem pedaços do botão`);
  }
});

test('"Juntar duplicados" continua inteiro', () => {
  // Ele dividia o modal de senha com o começar do zero. Tirar um não pode ter
  // levado o outro junto.
  const cfg = readFileSync(join(DOCS, 'configuracoes.html'), 'utf8');
  assert.match(cfg, /function pedirSenhaDeAcaoGrave\(titulo, texto\)/, 'o modal de senha precisa continuar');
  assert.match(cfg, /pedirSenhaDeAcaoGrave\('🧩 Juntar registros duplicados'/, 'e continuar sendo usado');
  assert.match(cfg, /LW\.api\('\/duplicados\/limpar'/, 'a ação de juntar duplicados fica');
  // E o texto padrão do modal não pode mais falar de esvaziar o sistema.
  const i = cfg.indexOf('function pedirSenhaDeAcaoGrave');
  const corpo = cfg.slice(i, i + 1400);
  assert.ok(!/Começar do zero/.test(corpo), 'o texto padrão precisa ter sido trocado');
});
