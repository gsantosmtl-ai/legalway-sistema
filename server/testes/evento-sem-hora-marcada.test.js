// "boas-vindas é quando o cliente assina... então está vinculada à assinatura e
// não em um horário. O do portal logo após boas-vindas, uma segunda mensagem."
//
// Ela estava certa e a tela estava errada: o campo "Horário" fazia parecer que
// a boas-vindas tinha hora marcada, e o motor só conferia os eventos uma vez
// por dia, naquela hora. Agora evento é evento: sai na passagem seguinte ao
// fato (a automação roda a cada minuto), e o horário virou só a janela em que
// o escritório aceita mandar mensagem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const motor = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

// naHora é interna ao módulo. Em vez de exportá-la só para o teste, ela é
// extraída do arquivo e rodada aqui com as duas ajudantes de que depende.
function naHoraReal() {
  const corpo = motor.slice(motor.indexOf('function naHora('));
  const fim = corpo.indexOf('\n}\n');
  const emMin = motor.slice(motor.indexOf('const emMinutos'));
  const emMinLinha = emMin.slice(0, emMin.indexOf('\n') + 1);
  return new Function(`${emMinLinha}\n${corpo.slice(0, fim + 2)}\nreturn naHora;`)();
}

const GAT_EVENTO = { quando: 'evento' };
const emPonto = (h, m = 0) => ({ minutos: h * 60 + m, dia: 'qua' });

test('evento não espera a hora marcada — sai dentro da janela do dia', () => {
  const naHora = naHoraReal();
  const aviso = { janelaDe: '08:00', janelaAte: '20:00' };
  for (const h of [8, 9, 13, 17, 19]) {
    assert.equal(naHora(aviso, GAT_EVENTO, emPonto(h)), true,
      `às ${h}h o contrato acabou de ser assinado: a boas-vindas tem que poder sair`);
  }
});

test('mas nada sai de madrugada', () => {
  const naHora = naHoraReal();
  const aviso = { janelaDe: '08:00', janelaAte: '20:00' };
  for (const h of [0, 3, 6, 21, 23]) {
    assert.equal(naHora(aviso, GAT_EVENTO, emPonto(h)), false,
      `${h}h está fora da janela — fica para o começo da manhã`);
  }
});

test('a janela tem padrão: aviso antigo, sem os campos, continua funcionando', () => {
  const naHora = naHoraReal();
  assert.equal(naHora({}, GAT_EVENTO, emPonto(10)), true, 'sem janela escrita, 10h vale');
  assert.equal(naHora({}, GAT_EVENTO, emPonto(4)), false, 'sem janela escrita, 4h não vale');
});

test('quem tem hora marcada continua tendo', () => {
  const naHora = naHoraReal();
  const semanal = { quando: 'semanal' };
  assert.equal(naHora({ diaSemana: 'qua', hora: '10:00' }, semanal, emPonto(10, 3)), true);
  assert.equal(naHora({ diaSemana: 'qua', hora: '10:00' }, semanal, emPonto(15)), false,
    'o semanal não pode ter virado "a qualquer hora"');
  assert.equal(naHora({ diaSemana: 'sex', hora: '10:00' }, semanal, emPonto(10, 3)), false,
    'quarta não é sexta');
});

test('o acesso ao portal sai depois das boas-vindas, na mesma passagem', () => {
  // A sequência que ela pediu. Sem a ordenação, a ordem era a ordem em que os
  // avisos foram criados na tela, e o portal — que só olha para quem já tem
  // boasVindasEnviada — ficaria para a passagem seguinte.
  assert.match(motor, /const ordemDosGatilhos = Object\.keys\(GATILHOS\)/,
    'falta fixar a ordem de disparo');
  assert.match(motor, /\.sort\(\(a, b\) => ordemDosGatilhos\.indexOf\(a\.gatilho\) - ordemDosGatilhos\.indexOf\(b\.gatilho\)\)/,
    'os avisos ligados precisam disparar na ordem dos motivos');
  assert.ok(motor.indexOf('  boasVindasDocumentos: {') < motor.indexOf('  acessoPortal: {'),
    'a declaração de boas-vindas tem que vir antes da do portal — é ela que define a ordem');
});

test('a tela não mostra "Horário" para quem não tem hora marcada', () => {
  assert.match(cfg, /\$\{\(g\.quando === 'minutosAntes' \|\| g\.quando === 'evento'\) \? '' :/,
    'evento não pode mais exibir o campo Horário');
  assert.match(cfg, /Sai <b>na hora em que acontece<\/b> — sem horário marcado\./,
    'a tela precisa dizer em letras que não tem horário');
  assert.match(cfg, /data-av="\$\{i\}\|janelaDe"/, 'falta o início da janela');
  assert.match(cfg, /data-av="\$\{i\}\|janelaAte"/, 'falta o fim da janela');
  assert.match(cfg, /janelaDe: '08:00', janelaAte: '20:00'/, 'a mensagem nova nasce com a janela');
});

test('a cobrança nasce avisando um dia antes', () => {
  // "Cobrança chegando um dia antes" — é o padrão que ela pediu.
  const i = cfg.indexOf('function avisoEmBranco(g){');
  const corpo = cfg.slice(i, cfg.indexOf('\n}', i));
  assert.match(corpo, /diasAntes: 1/, 'o padrão de "dias antes" é 1');
});

test('criar vem antes de escolher o motivo, e o botão fica em cima', () => {
  // "eu não preciso escolher o motivo, eu posso apertar em criar mensagem e
  // depois colocar o motivo. E o botão de criar mensagem tem que estar na
  // parte de cima."
  const criar = cfg.indexOf('<button class="primary" id="btn-novo-aviso">+ Criar mensagem</button>');
  const lista = cfg.indexOf('<div id="lista-avisos"></div>');
  assert.ok(criar > 0 && lista > 0, 'o botão e a lista precisam existir');
  assert.ok(criar < lista, 'o botão de criar tem que vir ANTES da lista');

  // Clicar cria vazia, no topo, já aberta — nada é perguntado antes.
  assert.match(cfg, /const a = avisoEmBranco\(null\);\s*\n\s*avisos\.unshift\(a\);/,
    'a mensagem nova nasce sem motivo e vai para o topo');
  assert.match(cfg, /if\(!a\.gatilho\) return `<div class="card"/,
    'a mensagem sem motivo precisa de um cartão próprio');
  assert.match(cfg, /data-av-motivo="\$\{escR\(a\.id\)\}"/, 'o motivo é escolhido dentro da mensagem');
  assert.match(cfg, /aplicarMotivo\(a, g\)/, 'escolher o motivo preenche nome e texto');

  assert.match(cfg, /motivos que existem/, 'falta a lista dos motivos à mão');
  assert.ok(!/Escolha o que dispara o aviso/.test(cfg), 'a palavra "gatilho" sai da tela');
});

test('escolher o motivo não apaga o que ela já escreveu', () => {
  const i = cfg.indexOf('function aplicarMotivo(a, g){');
  const corpo = cfg.slice(i, cfg.indexOf('\n}', i));
  assert.match(corpo, /if\(!a\.nome \|\| !a\.nome\.trim\(\)\) a\.nome = g\.nome/,
    'nome escrito por ela tem que sobreviver');
  assert.match(corpo, /if\(!a\.template \|\| !a\.template\.trim\(\)\) a\.template = textoInicialDoAviso\(g\)/,
    'texto escrito por ela tem que sobreviver');
});
