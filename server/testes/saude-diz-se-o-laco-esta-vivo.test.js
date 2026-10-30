// "As 22 automações rodam a cada minuto. Alguma está falhando em silêncio?"
//
// O log do servidor não responde isso: rodada que não acha nada não escreve
// nada (de propósito — ver automacoes-mostram-o-que-fizeram). Então silêncio
// no log não distingue "não havia nada a fazer" de "o laço morreu".
//
// /api/saude passa a responder a idade da última rodada. É a rota que o
// Railway já chama e a única que dá para conferir sem login — e é justamente
// por não pedir login que ela só pode dizer a IDADE, nunca o conteúdo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

// Recorta o corpo do manipulador contando chaves. Fatia de tamanho fixo já me
// traiu quatro vezes: basta um comentário crescer e o alvo sai da janela.
function corpoDoManipulador() {
  const abre = fonte.indexOf("app.get('/api/saude'");
  assert.ok(abre > 0, 'a rota /api/saude desapareceu');
  const inicio = fonte.indexOf('{', fonte.indexOf('=>', abre));
  let nivel = 0;
  for (let i = inicio; i < fonte.length; i++) {
    if (fonte[i] === '{') nivel++;
    else if (fonte[i] === '}') { nivel--; if (!nivel) return fonte.slice(inicio + 1, i); }
  }
  throw new Error('não fechei as chaves do manipulador');
}

// Roda o manipulador de verdade, com um `ultimaRodada` de mentira.
function responder({ ultima, ligadas = true }) {
  let corpo = null;
  const caixa = {
    ultimaRodada: () => ultima,
    process: { env: ligadas ? {} : { AUTOMACOES: '0' } },
    res: { json: (o) => { corpo = o; } },
    req: {},
    Date, Math, JSON,
  };
  vm.createContext(caixa);
  vm.runInContext(corpoDoManipulador(), caixa);
  return corpo;
}

test('sem nenhuma rodada ainda, a idade é nula — não zero', () => {
  // Zero significaria "rodou agorinha". Depois de um deploy ainda não rodou.
  const r = responder({ ultima: null });
  assert.equal(r.ok, true);
  assert.equal(r.automacoes.segundosDesdeUltima, null);
});

test('com rodada recente, a idade sai em segundos', () => {
  const r = responder({ ultima: { quando: new Date(Date.now() - 42_000).toISOString() } });
  assert.ok(r.automacoes.segundosDesdeUltima >= 41 && r.automacoes.segundosDesdeUltima <= 44,
    `esperava ~42 s, veio ${r.automacoes.segundosDesdeUltima}`);
});

test('laço morto há duas horas aparece como idade grande, não como ok silencioso', () => {
  const r = responder({ ultima: { quando: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() } });
  assert.ok(r.automacoes.segundosDesdeUltima > 7000,
    'é este número que denuncia o laço parado — o laço roda a cada 60 s');
});

test('a rota diz se as automações estão desligadas nesta cópia', () => {
  // AUTOMACOES=0 existe para rodar uma segunda cópia sem mandar mensagem a
  // cliente. Sem este campo, idade nula numa cópia dessas parece defeito.
  assert.equal(responder({ ultima: null, ligadas: false }).automacoes.ligadas, false);
  assert.equal(responder({ ultima: null }).automacoes.ligadas, true);
});

test('a rota NÃO devolve o que a rodada fez — ela não pede login', () => {
  const ultima = {
    quando: new Date().toISOString(),
    motivo: 'agendado',
    oQueFez: ['cobrança enviada a Deise Conceicao Merces'],
    falhas: ['varrer USCIS: token expirado'],
  };
  const r = responder({ ultima });
  const texto = JSON.stringify(r);
  assert.doesNotMatch(texto, /Deise/, 'nome de cliente numa rota sem login');
  assert.doesNotMatch(texto, /USCIS/, 'motivo de falha interna numa rota sem login');
  assert.equal(r.automacoes.oQueFez, undefined);
  assert.equal(r.automacoes.falhas, undefined);
});

test('a idade vem da função, não de uma variável parada no arranque', () => {
  // Se alguém trocar ultimaRodada() por um valor lido uma vez na subida, a
  // rota vira um relógio quebrado que responde sempre a mesma coisa.
  assert.match(fonte, /ultimaRodada\(\)/);
  assert.match(fonte, /import \{[^}]*ultimaRodada[^}]*\} from '\.\/automacoes\.js';/);
});
