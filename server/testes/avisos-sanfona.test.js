// "de novo, tudo aberto, uma página gigante."
//
// Assim que a lista passou a vir completa — 10 mensagens, cada uma com texto,
// horário, setor e as chaves — a aba virou uma parede de rolagem. Mesma cura do
// checklist e dos templates: nascem fechadas, o cabeçalho diz o essencial, e
// ela abre a que quer mexer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

test('as mensagens nascem fechadas', () => {
  assert.match(cfg, /const avisosAbertos = new Set\(/, 'falta o controle de quem está aberta');
  assert.match(cfg, /const aberto = avisosAbertos\.has\(a\.id\)/, 'cada mensagem precisa saber se está aberta');
  assert.match(cfg, /style="display:\$\{aberto \? 'block' : 'none'\}; margin-top:10px;"/,
    'o corpo da mensagem fica escondido quando fechada');
  assert.match(cfg, /\$\{aberto \? '▾' : '▸'\}/, 'falta a setinha de estado');
});

test('clicar no cabeçalho abre, clicar de novo fecha', () => {
  const i = cfg.indexOf("[data-av-abrir]");
  const trecho = cfg.slice(i, i + 420);
  assert.match(trecho, /if\(avisosAbertos\.has\(id\)\) avisosAbertos\.delete\(id\); else avisosAbertos\.add\(id\)/,
    'o mesmo clique tem que alternar');
});

test('marcar "ligado" não fecha a mensagem na cara dela', () => {
  // A caixinha vive no cabeçalho, para ligar sem precisar abrir. Sem o guarda,
  // clicar nela fecharia o que ela estava lendo.
  const i = cfg.indexOf("[data-av-abrir]");
  const trecho = cfg.slice(i, i + 420);
  assert.match(trecho, /if\(e\.target\.closest\('input, button, select, label, a, textarea'\)\) return/,
    'clique em campo do cabeçalho não pode alternar a seção');
});

test('o que ela abriu sobrevive a recarregar a página', () => {
  assert.match(cfg, /localStorage\.getItem\('legalway-avisos-abertos'/, 'falta ler o estado guardado');
  assert.match(cfg, /localStorage\.setItem\('legalway-avisos-abertos'/, 'falta guardar o estado');
  const i = cfg.indexOf('function guardarAvisosAbertos');
  assert.match(cfg.slice(i, i + 240), /catch\(e\)\{\}/,
    'navegador sem localStorage não pode quebrar a tela');
});

// A frase do cabeçalho é o que ela lê sem abrir. Tem que estar certa para os
// cinco tipos de "quando", senão fechado vira pior do que aberto.
function resumo() {
  const i = cfg.indexOf('const DIA_NOME =');
  const fim = cfg.indexOf('\n}', cfg.indexOf('function resumoDoAviso')) + 2;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cfg.slice(i, fim) + '\nglobalThis.r = resumoDoAviso;', ctx);
  return ctx.r;
}

test('o cabeçalho diz quando a mensagem sai, sem precisar abrir', () => {
  const r = resumo();
  assert.equal(r({ diaSemana: 'sex', hora: '10:00' }, { quando: 'semanal' }), 'toda sexta às 10:00');
  assert.equal(r({ cadaDias: 7, hora: '09:00' }, { quando: 'cadaDias' }), 'a cada 7 dias, às 09:00');
  assert.equal(r({ diasAntes: 1, hora: '10:00' }, { quando: 'diasAntes' }), '1 dia(s) antes, às 10:00');
  assert.equal(r({ diasAntes: 0, hora: '08:00' }, { quando: 'diasAntes' }), 'no dia, às 08:00',
    '"0 dia(s) antes" não diz nada a ninguém');
  assert.equal(r({ minutosAntes: 30 }, { quando: 'minutosAntes' }), '30 minutos antes do horário marcado');
  assert.equal(r({ janelaDe: '08:00', janelaAte: '20:00' }, { quando: 'evento' }),
    'na hora em que acontece, entre 08:00 e 20:00');
});

test('mensagem antiga, sem os campos preenchidos, ainda diz alguma coisa', () => {
  const r = resumo();
  assert.equal(r({}, { quando: 'semanal' }), 'toda sexta às 10:00');
  assert.equal(r({}, { quando: 'cadaDias' }), 'a cada 15 dias, às 10:00');
  assert.equal(r({}, { quando: 'evento' }), 'na hora em que acontece, entre 08:00 e 20:00');
});
