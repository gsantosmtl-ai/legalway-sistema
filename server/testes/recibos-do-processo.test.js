// Um processo tem MAIS DE UM número no USCIS.
//
// O Visto T do Esdras tem dois: o I-914, que é a petição do visto, e o I-765,
// que é a autorização de trabalho. Cada um é um caso separado no USCIS, com
// andamento próprio. O sistema guardava um campo só, e o escritório empilhava
// o resto dentro de "Observações" como texto solto:
//
//     I914 - LIN2701050105
//     I-765 - SRC2790008506
//
// Dentro de observação nada é consultado, nada avisa quando muda, e a busca
// não acha. O pedido dela foi: um campo por formulário, e os dois consultados.
//
// A lista mora em `protocolo.recibos`. O campo antigo `protocolo.recibo`
// continua existindo e espelha o PRIMEIRO número — é de lá que leem quinze
// pontos entre telas, avisos e portal do cliente, e nenhum deles precisa saber
// que agora são vários. Nenhuma ficha é migrada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { recibosDoProcesso, recibosConsultaveis, reciboPrincipal,
         normalizarRecibo, reciboValido, rotuloDoRecibo } from '../src/recibos.js';

// --- a cópia do navegador, rodando de verdade -------------------------------
function carregarComum() {
  const fonte = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
  const ctx = createContext({ window: { LW: {} }, Math, Number, String, JSON, Array, Set });
  ctx.LW = ctx.window.LW;
  for (const nome of ['RE_RECIBO', 'normalizarRecibo', 'reciboValido',
                      'recibosDoProcesso', 'rotuloDoRecibo', 'FORMULARIOS_USCIS']) {
    runInContext(recortar(fonte, 'window.LW.' + nome + ' ='), ctx);
  }
  return ctx.LW;
}
function recortar(fonte, inicio) {
  const i = fonte.indexOf(inicio);
  assert.ok(i >= 0, 'não achei ' + inicio + ' no comum.js');
  let j = i + inicio.length, ch = 0, pa = 0, col = 0;
  for (; j < fonte.length; j++) {
    const c = fonte[j];
    if (c === '{') ch++; else if (c === '}') ch--;
    else if (c === '(') pa++; else if (c === ')') pa--;
    else if (c === '[') col++; else if (c === ']') col--;
    else if (c === ';' && !ch && !pa && !col) break;
  }
  return fonte.slice(i, j + 1);
}

// --- a tabela ---------------------------------------------------------------
const CASOS = [
  { nome: 'o caso do Esdras: I-914 e I-765, os dois',
    p: { protocolo: { recibos: [{ form: 'I-914', numero: 'LIN2701050105' },
                                { form: 'I-765', numero: 'SRC2790008506' }],
                      recibo: 'LIN2701050105' } },
    esperado: [{ form: 'I-914', numero: 'LIN2701050105' }, { form: 'I-765', numero: 'SRC2790008506' }] },

  { nome: 'ficha antiga, só o campo único: continua valendo sem migrar nada',
    p: { protocolo: { recibo: 'IOE0912345678' } },
    esperado: [{ form: '', numero: 'IOE0912345678' }] },

  { nome: 'o espelho não vira item repetido',
    p: { protocolo: { recibos: [{ form: 'I-914', numero: 'LIN2701050105' }], recibo: 'LIN2701050105' } },
    esperado: [{ form: 'I-914', numero: 'LIN2701050105' }] },

  { nome: 'o campo único vira o último quando é outro número',
    p: { protocolo: { recibos: [{ form: 'I-765', numero: 'SRC2790008506' }], recibo: 'LIN2701050105' } },
    esperado: [{ form: 'I-765', numero: 'SRC2790008506' }, { form: '', numero: 'LIN2701050105' }] },

  { nome: 'minúsculas, espaços e traços entram limpos — é copiar e colar da carta',
    p: { protocolo: { recibos: [{ form: ' i-914 ', numero: ' lin-270 105 0105 ' }] } },
    esperado: [{ form: 'I-914', numero: 'LIN2701050105' }] },

  { nome: 'linha sem número não entra',
    p: { protocolo: { recibos: [{ form: 'I-765', numero: '' }, { form: '', numero: null },
                                { form: 'I-914', numero: 'LIN2701050105' }] } },
    esperado: [{ form: 'I-914', numero: 'LIN2701050105' }] },

  { nome: 'o mesmo número duas vezes conta uma',
    p: { protocolo: { recibos: [{ form: 'I-914', numero: 'LIN2701050105' },
                                { form: 'I-765', numero: 'lin2701050105' }] } },
    esperado: [{ form: 'I-914', numero: 'LIN2701050105' }] },

  { nome: 'sem protocolo nenhum', p: {}, esperado: [] },
  { nome: 'ficha nula', p: null, esperado: [] },
  { nome: 'recibos com formato errado no bloco', p: { protocolo: { recibos: 'texto solto' } }, esperado: [] },
];

test('a lista de recibos sai certa em todos os formatos que existem no banco', () => {
  for (const k of CASOS) {
    assert.deepEqual(recibosDoProcesso(k.p), k.esperado, k.nome);
  }
});

test('o navegador e o servidor respondem igual na mesma tabela', () => {
  // A regra está em dois arquivos; só se mantém honesta se algo quebrar quando
  // uma das cópias mudar sozinha.
  //
  // A comparação é por JSON de propósito: os objetos nascem DENTRO do vm, em
  // outro realm, e deepEqual reprova dois objetos idênticos só porque vieram
  // de Object.prototype diferentes.
  const LW = carregarComum();
  for (const k of CASOS) {
    assert.equal(JSON.stringify(LW.recibosDoProcesso(k.p)), JSON.stringify(k.esperado),
      k.nome + ' (navegador)');
  }
});

test('o principal é o primeiro, e é ele que fica espelhado no campo antigo', () => {
  const p = CASOS[0].p;
  assert.equal(reciboPrincipal(p), 'LIN2701050105');
  assert.equal(reciboPrincipal({}), '');
});

test('só número no formato do USCIS é consultável', () => {
  // "LIN21799" existe no banco, veio da importação. Ele continua aparecendo na
  // ficha — mas não vai para a API, que o recusaria.
  const p = { protocolo: { recibos: [{ form: 'I-914', numero: 'LIN2701050105' },
                                     { form: '', numero: 'LIN21799' }] } };
  assert.equal(recibosDoProcesso(p).length, 2, 'o antigo não some da ficha');
  assert.deepEqual(recibosConsultaveis(p), [{ form: 'I-914', numero: 'LIN2701050105' }]);
});

test('validação do formato: 3 letras e 10 números', () => {
  assert.equal(reciboValido('IOE0912345678'), true);
  assert.equal(reciboValido('ioe 091 234 5678'), true, 'minúscula com espaço é o que se cola da carta');
  for (const ruim of ['LIN21799', 'IOE091234567', 'IOE09123456789', '1234567890123', '', null, {}, 'IOEA12345678']) {
    assert.equal(reciboValido(ruim), false, 'aceitou ' + JSON.stringify(ruim));
  }
});

test('o rótulo diz o formulário quando ele existe', () => {
  assert.equal(rotuloDoRecibo({ form: 'I-765', numero: 'SRC2790008506' }), 'I-765 SRC2790008506');
  assert.equal(rotuloDoRecibo({ form: '', numero: 'SRC2790008506' }), 'SRC2790008506');
  assert.equal(rotuloDoRecibo(null), '');
});

test('normalizar não inventa caractere', () => {
  assert.equal(normalizarRecibo('lin-2701.050 105'), 'LIN2701050105');
  assert.equal(normalizarRecibo(null), '');
  assert.equal(normalizarRecibo({}), 'OBJECTOBJECT');  // lixo vira lixo, não vira número válido
  assert.equal(reciboValido({}), false);
});

// ---------------------------------------------------------------------------
// A consulta ao USCIS e a tela
const uscis = readFileSync(new URL('../src/uscis.js', import.meta.url), 'utf8');
const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const semComent = (t) => t.replace(/^\s*\/\/.*$/gm, '');
const corpoDe = (fonte, de, ate) => {
  const i = fonte.indexOf(de);
  assert.ok(i >= 0, 'não achei: ' + de);
  return fonte.slice(i, fonte.indexOf(ate, i));
};

test('a varredura diária consulta TODOS os números, não só o primeiro', () => {
  // Com um número só sendo consultado, o I-765 do Esdras ficaria parado para
  // sempre — e é justamente o que costuma travar.
  const corpo = semComent(corpoDe(uscis, 'export async function varrerUscis', '\n}\n'));
  assert.match(corpo, /for \(const item of recibosConsultaveis\(p\)\)/);
  assert.ok(!/consultarRecibo\(p\.protocolo\.recibo\)/.test(corpo),
    'não pode voltar a consultar só o campo único');
});

test('um número que falha não derruba os outros do mesmo processo', () => {
  const corpo = semComent(corpoDe(uscis, 'export async function consultarProcesso', '\n}\n'));
  assert.match(corpo, /catch \(e\) \{\s*aplicarErro\(p, item, e\.message\)/);
  assert.match(corpo, /erros\.length === itens\.length/,
    'só é erro de verdade quando NENHUM respondeu');
});

test('cada número guarda o status dele, e o primeiro fica espelhado no topo', () => {
  // Quinze pontos entre telas, avisos e portal leem `p.uscis.status` esperando
  // UM status. O espelho é o que deixa tudo isso funcionar sem alteração.
  assert.match(uscis, /function espelharPrincipal\(p\)/);
  const corpo = semComent(corpoDe(uscis, 'function aplicarResultado', '\n}\n'));
  assert.match(corpo, /p\.uscis\.casos = casos/);
  assert.match(corpo, /espelharPrincipal\(p\)/);
  assert.match(corpo, /casos\.findIndex\(\(c\) => c && c\.recibo === item\.numero\)/,
    'o caso é achado pelo número, senão um sobrescreve o outro');
});

test('o aviso nomeia o número que mudou, não o principal', () => {
  // Num processo com I-914 e I-765, avisar sempre o principal faria a mensagem
  // apontar para o caso errado.
  const corpo = semComent(corpoDe(uscis, 'async function avisarMudanca', '\n}\n'));
  assert.match(corpo, /const u = caso \|\| p\.uscis;/);
  assert.match(corpo, /rotuloDoRecibo\(u\)/);
  assert.ok(!/\$\{p\.uscis\.recibo\}/.test(corpo), 'a mensagem não pode citar o principal fixo');
});

test('a tela mostra um bloco de status por número', () => {
  const corpo = corpoDe(tela, 'function blocoUscisHtml(p){', '\n}\n');
  assert.match(corpo, /LW\.recibosDoProcesso\(p\)/);
  assert.match(corpo, /itens\.map\(bloco\)/, 'um bloco por número');
  assert.match(corpo, /p\.uscis\.casos/);
  // Ficha antiga, consultada antes desta mudança, tem status no topo e nenhum
  // `casos`. Ela não pode virar "ainda não consultado".
  assert.match(corpo, /p\.uscis && p\.uscis\.status \? \[p\.uscis\] : \[\]/);
});

test('a busca encontra pelo segundo número também', () => {
  // Digitar SRC2790008506 tem que achar o Esdras. Procurar só no campo único
  // devolveria nada, e a pessoa concluiria que o processo não existe.
  assert.match(tela, /\.\.\.LW\.recibosDoProcesso\(p\)\.map\(r=>r\.numero\)/);
});

test('salvar grava a lista e espelha o primeiro no campo antigo', () => {
  const corpo = semComent(corpoDe(tela, 'async function salvarMarcos(', '\n}\n'));
  assert.match(corpo, /recibos: digitados,/);
  assert.match(corpo, /recibo: \(digitados\[0\] \|\| \{\}\)\.numero \|\| null/,
    'sem o espelho, quinze leitores param de ver o número');
});

test('número repetido e número inválido são recusados antes de gravar', () => {
  const corpo = semComent(corpoDe(tela, 'async function salvarMarcos(', '\n}\n'));
  assert.match(corpo, /está repetido/);
  assert.match(corpo, /!jaExistia\.has\(r\.numero\) && !LW\.reciboValido\(r\.numero\)/,
    'só o que MUDOU é validado: os antigos fora do padrão não podem travar a tela');
});

test('tirar um número apaga o status dele, não o dos outros', () => {
  // Status guardado de um número que saiu da lista é andamento de outro caso.
  const corpo = semComent(corpoDe(tela, 'async function salvarMarcos(', '\n}\n'));
  assert.match(corpo, /const restam = p\.uscis\.casos\.filter\(c => c && vivos\.has\(c\.recibo\)\)/);
});
