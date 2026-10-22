// "Regras de escritório está muito extensa, talvez colocar também por parte
// esticando — por exemplo dados da empresa, depois outro segmento."
//
// São 9 seções e dezenas de campos, todos abertos de uma vez. Mesma cura do
// checklist, dos templates e das mensagens: nascem fechados, e ela abre o que
// quer mexer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

test('as seções das regras nascem fechadas', () => {
  assert.match(cfg, /function sanfonarSecoes\(el, chaveEstado\)/, 'falta a sanfona das seções');
  assert.match(cfg, /sanfonarSecoes\(el, 'legalway-regras-abertas'\)/, 'a aba de Regras precisa chamá-la');
  const i = cfg.indexOf('function sanfonarSecoes');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /corpo\.style\.display = aberto \? '' : 'none'/, 'fechada esconde o corpo');
  assert.match(corpo, /seta\.textContent = aberto \? '▾' : '▸'/, 'falta a setinha de estado');
});

test('a sanfona roda depois de os campos estarem ligados', () => {
  // Ela move os campos para dentro de um invólucro. Rodando antes, quem
  // procurasse os campos para ligar os eventos não acharia nada.
  const iSanfona = cfg.indexOf("sanfonarSecoes(el, 'legalway-regras-abertas')");
  const iCampos = cfg.indexOf("el.querySelectorAll('[data-restaurar]')");
  assert.ok(iCampos > 0 && iSanfona > iCampos,
    'a sanfona tem que ser a última coisa da montagem das regras');
});

test('clicar no botão de restaurar não fecha a seção', () => {
  const i = cfg.indexOf('function sanfonarSecoes');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /if\(e\.target\.closest\('button, input, select, a, textarea'\)\) return/,
    'clique em campo ou botão da faixa não pode alternar a seção');
  // E o botão some junto com a seção: visível numa seção fechada, parece agir
  // sobre a tela toda.
  assert.match(corpo, /botao\.style\.display = aberto \? '' : 'none'/,
    'o botão de restaurar precisa acompanhar o estado');
});

test('os atalhos do topo abrem a seção antes de descer até ela', () => {
  // Com tudo fechado, "Setores e WhatsApp" desceria e mostraria só um título.
  assert.match(cfg, /function abrirSecaoDeRegras\(nome\)/, 'falta a função que abre');
  const i = cfg.indexOf('function abrirSecaoDeRegras');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /if\(!sec \|\| !sec\.dataset\.sanfona\) return;/,
    'sem sanfona montada não há o que abrir');
  assert.match(corpo, /if\(corpo && corpo\.style\.display === 'none'\)/,
    'seção já aberta não pode ser fechada pelo atalho');
  // Os dois atalhos usam.
  assert.equal((cfg.match(/abrirSecaoDeRegras\(/g) || []).length, 3,
    'a função e os dois atalhos (setores e financeiro)');
});

test('o que ela abriu sobrevive a recarregar', () => {
  const i = cfg.indexOf('function sanfonarSecoes');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /localStorage\.getItem\(chaveEstado/, 'falta ler o estado');
  assert.match(corpo, /localStorage\.setItem\(chaveEstado/, 'falta guardar o estado');
  assert.match(corpo, /catch\(e\)\{\}/, 'navegador sem localStorage não pode quebrar a tela');
});

test('a sanfona não se aplica duas vezes na mesma seção', () => {
  // renderRegras roda de novo ao restaurar o padrão de uma seção. Reaplicando,
  // o corpo entraria dentro de outro invólucro e sumiria.
  const i = cfg.indexOf('function sanfonarSecoes');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /if\(!faixa \|\| secao\.dataset\.sanfona\) return;/, 'falta a trava de reentrada');
  assert.match(corpo, /secao\.dataset\.sanfona = '1';/, 'falta marcar que já foi aplicada');
});
