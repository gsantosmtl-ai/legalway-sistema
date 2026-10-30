// "Agora sinto que o sistema está travando muito, muitos refresh, falhas."
//
// A tela de Documentação tinha isto no fim do arquivo:
//
//     setInterval(async ()=>{ await loadAll(); }, 10000);
//
// A cada DEZ SEGUNDOS, cada aba aberta baixava tudo de novo — inclusive o
// bloco de fichas, que na Legal Way carrega milhares de anexos — e ainda
// regravava dois blocos (checklists e prestadores) sem nada ter mudado.
//
// Duas consequências:
//   · a tela travava, e parecia estar "dando refresh sozinha"
//   · uma gravação a cada 10s queima o histórico de versões (ficam as 30
//     últimas) em cinco minutos. Foi assim que a versão base de uma aba saiu
//     do histórico e abriu caminho para a perda dos 3.509 anexos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

// ATUALIZADO em 30/10/2026. O mecanismo de "perguntar só as versões" morava
// aqui e foi para o storage.js — onde, de quebra, ganhou as defesas que ele
// não tinha: esperar a gravação em voo, não redesenhar no meio de uma rolagem
// ou de um modal aberto, e devolver a posição depois.
//
// Faltava a principal: ele recarregava por causa da gravação DA PRÓPRIA ABA.
// Era isso que fazia o card voltar — a volta do relógio caía no meio do save,
// lia o estado antigo e redesenhava.
//
// A garantia agora é mais forte: esta tela NÃO recarrega sozinha, de jeito
// nenhum.
test('a tela não recarrega sozinha — quem faz isso é o storage.js', () => {
  assert.doesNotMatch(tela, /setInterval\(\s*async\s*\(\s*\)\s*=>\s*\{\s*await loadAll\(\)/,
    'recarregar o bloco inteiro a cada 10 segundos é o que travava a tela');
  assert.doesNotMatch(tela, /setInterval\([^)]*recarregarSeMudou/,
    'o laço próprio saiu: ele recarregava por causa da gravação da própria aba');
  assert.doesNotMatch(tela, /addEventListener\(\s*'focus'[\s\S]{0,80}?loadAll/,
    'voltar para a aba disparava um loadAll cru, que joga a rolagem para o topo');
});

test('o recarregador compartilhado espera a gravação desta aba terminar', () => {
  const storage = readFileSync(new URL('../../docs/assets/storage.js', import.meta.url), 'utf8');
  const fn = storage.slice(storage.indexOf('async function recarregarSePossivel'), storage.indexOf('async function recarregar()'));
  assert.match(fn, /emVoo > 0/, 'é esta linha que impede o card de voltar');
  assert.match(fn, /ultimoSet/, 'e esta que evita redesenhar logo depois de gravar');
});

test('nenhuma gravação solta dentro do carregamento', () => {
  const ini = tela.indexOf('async function loadAll(');
  let i = tela.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < tela.length; i++) { if (tela[i] === '{') nivel++; else if (tela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  const corpo = tela.slice(ini, fim);
  const soltas = corpo.split('\n').filter(l => /^\s*await save[A-Za-z]*\(\s*\)\s*;?\s*$/.test(l));
  assert.deepEqual(soltas, [],
    'gravação incondicional dentro do loadAll roda a cada volta do relógio e queima o histórico:\n' + soltas.join('\n'));
});

test('o índice financeiro é montado uma vez por desenho, não por card', () => {
  // dadosFinanceiros() varria contratos e contasReceber INTEIROS a cada
  // chamada; com a ordenação por data o comparador passou a chamá-la também,
  // e n·log(n) varreduras completas travavam o quadro
  assert.match(tela, /function montarIndiceFinanceiro\(\)/);
  assert.match(tela, /function render\(\)\{\s*\n\s*montarIndiceFinanceiro\(\)/);
  const f = tela.slice(tela.indexOf('function dadosFinanceiros'), tela.indexOf('function renderCard'));
  assert.doesNotMatch(f, /contasReceber\.filter/,
    'voltar a filtrar as parcelas dentro de dadosFinanceiros traz a lentidão de volta');
});
