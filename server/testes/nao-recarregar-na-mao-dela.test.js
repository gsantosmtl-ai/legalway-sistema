// "Preciso que pare de ficar dando refresh o tempo inteiro."
//
// O recarregamento ao vivo existe para que duas pessoas vejam a mesma coisa.
// Mas ele dispara a cada gravação de qualquer tela, e o checklist de um serviço
// grava a CADA clique numa caixinha — então a tela pisca debaixo da mão de quem
// está trabalhando. Em Configurações, marcando tradução documento a documento,
// isso é uma piscada por caixinha.
//
// A regra passa a ser: enquanto a pessoa está mexendo, o redesenho espera. Não
// é cancelado — assim que ela para, a tela se atualiza.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../docs/assets/storage.js', import.meta.url), 'utf8');

test('campo em foco nunca é redesenhado por baixo', () => {
  const i = src.indexOf('const digitandoAgora = ()=>');
  assert.notEqual(i, -1, 'falta a guarda de quem está digitando');
  const corpo = src.slice(i, src.indexOf('};', i));
  assert.match(corpo, /\['INPUT','TEXTAREA','SELECT'\]\.includes\(el\.tagName\)/);
  assert.match(corpo, /el\.isContentEditable/);
  assert.match(src, /digitandoAgora\(\)/, 'a guarda precisa ser usada, não só existir');
});

test('a espera é por interação, não só por rolagem', () => {
  const i = src.indexOf('async function recarregarSePossivel()');
  const corpo = src.slice(i, src.indexOf('\n  }', i));
  assert.match(corpo, /Date\.now\(\) - ultimaInteracao < QUIETA_POR/);
  assert.match(corpo, /Date\.now\(\) - ultimoRecarregue < ENTRE_RECARGAS/,
    'sem um piso entre recargas, um módulo que grava sem parar redesenha sem parar');
  assert.match(corpo, /timer = setTimeout\(recarregarSePossivel, 2000\); return;/,
    'adiado, não cancelado: quando ela parar, a tela atualiza');
  assert.match(src, /for\(const ev of \['pointerdown','keydown','input','change','focusin'\]\)/,
    'clique e tecla contam como "ela está mexendo"');
});

// ------------------------------------------------------ rodando a decisão
function decidir() {
  const ctx = { Date, document: { activeElement: null, body: {} } };
  vm.createContext(ctx);
  const i = src.indexOf('const QUIETA_POR');
  vm.runInContext(src.slice(i, src.indexOf('\n  };', i) + 5), ctx);
  vm.runInContext(`
    function podeRecarregar(e){
      document.activeElement = e.foco || null;
      const agora = e.agora;
      return !(e.recarregando || e.emVoo > 0 || digitandoAgora()
        || agora - e.ultimoSet < 2500
        || agora - e.ultimaRolagem < 1500
        || agora - e.ultimaInteracao < QUIETA_POR
        || agora - e.ultimoRecarregue < ENTRE_RECARGAS);
    }`, ctx);
  return ctx;
}

const PARADA = { agora: 1000000, recarregando: false, emVoo: 0, ultimoSet: 0,
  ultimaRolagem: 0, ultimaInteracao: 0, ultimoRecarregue: 0, foco: null };

test('parada há tempo: pode redesenhar', () => {
  const ctx = decidir();
  assert.equal(ctx.podeRecarregar(PARADA), true);
});

test('clicou há 2 segundos: espera', () => {
  const ctx = decidir();
  assert.equal(ctx.podeRecarregar({ ...PARADA, ultimaInteracao: PARADA.agora - 2000 }), false,
    'marcando caixinhas uma a uma, a tela não pode piscar entre elas');
  assert.equal(ctx.podeRecarregar({ ...PARADA, ultimaInteracao: PARADA.agora - 7000 }), true,
    'parou: agora pode');
});

test('com o cursor num campo, nunca', () => {
  const ctx = decidir();
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(ctx.podeRecarregar({ ...PARADA, foco: { tagName: tag } }), false, tag + ' em foco');
  }
  assert.equal(ctx.podeRecarregar({ ...PARADA, foco: { tagName: 'DIV', isContentEditable: true } }), false);
  assert.equal(ctx.podeRecarregar({ ...PARADA, foco: { tagName: 'DIV' } }), true,
    'um div qualquer com foco não é alguém digitando');
});

test('acabou de redesenhar: segura o próximo', () => {
  // É isto que impede o "refresh o tempo inteiro" quando um módulo grava em
  // rajada — o checklist chegou a 8.500 versões num dia.
  const ctx = decidir();
  assert.equal(ctx.podeRecarregar({ ...PARADA, ultimoRecarregue: PARADA.agora - 3000 }), false);
  assert.equal(ctx.podeRecarregar({ ...PARADA, ultimoRecarregue: PARADA.agora - 16000 }), true);
});

test('as guardas antigas continuam valendo', () => {
  const ctx = decidir();
  assert.equal(ctx.podeRecarregar({ ...PARADA, emVoo: 1 }), false);
  assert.equal(ctx.podeRecarregar({ ...PARADA, ultimaRolagem: PARADA.agora - 500 }), false);
  assert.equal(ctx.podeRecarregar({ ...PARADA, ultimoSet: PARADA.agora - 1000 }), false);
});
