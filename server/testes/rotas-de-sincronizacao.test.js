// As rotas de sincronização. O que estes testes guardam é o CONTRATO de
// segurança delas — o que torna aceitável um botão que puxa dado de fora e
// escreve no banco da Legal Way:
//
//   1. prévia separada do aplicar: nenhuma rota que busca na internet grava
//      na mesma chamada;
//   2. o plano é refeito NA HORA de aplicar, nunca se aplica o que a prévia
//      viu minutos atrás;
//   3. auditoria em toda aplicação;
//   4. no Trello, a foto dos cards antes e depois — a regra crítica dela;
//   5. segredo nenhum sai na resposta.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/sinc-rotas.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const semComent = (t) => t.replace(/^\s*\/\/.*$/gm, '');
const corpoDe = (de, ate) => {
  const i = fonte.indexOf(de);
  assert.ok(i >= 0, 'não achei: ' + de);
  return fonte.slice(i, fonte.indexOf(ate, i));
};

test('as rotas estão no ar e todas exigem login', () => {
  assert.match(index, /app\.use\('\/api', rotasSinc\)/);
  const rotas = [...fonte.matchAll(/rotasSinc\.(get|post)\('([^']+)'\s*,\s*(\w+)/g)];
  assert.ok(rotas.length >= 7, 'faltou rota: ' + rotas.length);
  for (const [, , caminho, guarda] of rotas) {
    assert.equal(guarda, 'exigirLogin', caminho + ' sem exigirLogin');
  }
});

test('prévia e aplicar são rotas diferentes, e a prévia não grava', () => {
  for (const lado of ['bling', 'trello']) {
    assert.match(fonte, new RegExp(`rotasSinc\\.get\\('/sinc/${lado}/previa'`), lado);
    assert.match(fonte, new RegExp(`rotasSinc\\.post\\('/sinc/${lado}/aplicar'`), lado);
    const previa = semComent(corpoDe(`rotasSinc.get('/sinc/${lado}/previa'`, '\n});'));
    assert.ok(!/await gravar\(/.test(previa), `a prévia do ${lado} não pode gravar`);
  }
});

test('o plano é refeito na hora de aplicar', () => {
  // Aplicar o que a prévia viu minutos atrás duplica o que entrou no meio.
  for (const [lado, fn] of [['bling','planoDoBling'], ['trello','planoDoTrello']]) {
    const h = semComent(corpoDe(`rotasSinc.post('/sinc/${lado}/aplicar'`, '\n});'));
    assert.ok(h.includes(fn + '('), `o aplicar do ${lado} tem que refazer o plano`);
    assert.ok(!/req\.body\?\.plano/.test(h), `o ${lado} não pode aceitar um plano pronto de fora`);
  }
});

test('nada a fazer não grava nem audita', () => {
  for (const lado of ['bling', 'trello']) {
    const h = semComent(corpoDe(`rotasSinc.post('/sinc/${lado}/aplicar'`, '\n});'));
    assert.match(h, /nadaAFazer: true/, lado);
    const iNada = h.indexOf('nadaAFazer: true');
    const iGrava = h.indexOf('await gravar(');
    assert.ok(iGrava === -1 || iNada < iGrava, `${lado}: a saída por "nada a fazer" vem antes de gravar`);
  }
});

test('toda aplicação entra na auditoria', () => {
  for (const lado of ['bling', 'trello']) {
    const h = corpoDe(`rotasSinc.post('/sinc/${lado}/aplicar'`, '\n});');
    assert.match(h, /INSERT INTO auditoria/, lado);
  }
});

test('o Trello prova que nenhum card se moveu', () => {
  // A regra que ela chamou de crítica: sincronizar anexo não pode mexer em
  // posição, coluna nem ordenação.
  const h = semComent(corpoDe("rotasSinc.post('/sinc/trello/aplicar'", '\n});'));
  const iAntes = h.indexOf('fotoDosCards(processos)');
  const iGrava = h.indexOf('await gravar(');
  const iDepois = h.indexOf('compararFotos(antes');
  assert.ok(iAntes > 0 && iAntes < iGrava, 'a foto tem que ser tirada ANTES de gravar');
  assert.ok(iDepois > iGrava, 'e a comparação DEPOIS');
  assert.match(h, /cardsQueMudaramDePosicao: mexeram\.length/, 'e o número volta na resposta');
  // A foto de depois vem do que foi GRAVADO, não da lista em memória: comparar
  // a lista consigo mesma provaria nada.
  assert.match(h, /const \{ valor: depoisBruto \} = await bloco\(K\.processos\)/);
});

test('o Trello só mexe em anexos', () => {
  const h = semComent(corpoDe("rotasSinc.post('/sinc/trello/aplicar'", '\n});'));
  for (const re of [/\.status\s*=/, /\.situacao\s*=/, /\.ordem\s*=/, /\.responsavel\s*=/, /\.splice\(/]) {
    assert.doesNotMatch(h, re, 'a sincronização de anexo não pode escrever em ' + re);
  }
  assert.match(h, /ficha\.anexos\.push\(/);
});

test('o anexo guarda o id do Trello — é o que impede duplicata amanhã', () => {
  const h = corpoDe("rotasSinc.post('/sinc/trello/aplicar'", '\n});');
  assert.match(h, /idTrello: a\.id/);
});

test('anexo que falha não derruba os outros', () => {
  // Um arquivo apagado no Trello não pode fazer os outros 200 não entrarem.
  const h = semComent(corpoDe("rotasSinc.post('/sinc/trello/aplicar'", '\n});'));
  assert.match(h, /catch \(e\) \{ falharam\.push/);
  assert.match(h, /falharam/, 'e as falhas voltam na resposta, em vez de sumir');
});

test('o Trello tem limite por rodada', () => {
  // 1.800 anexos numa requisição só derruba o container — leitura pesada já
  // fez isso antes.
  const h = corpoDe("rotasSinc.post('/sinc/trello/aplicar'", '\n});');
  assert.match(h, /Math\.min\(500, Math\.max\(1, Number\(req\.body\?\.limite\) \|\| 200\)\)/);
  assert.match(h, /aindaFaltam:/, 'e diz quanto sobrou para a próxima');
});

test('cartão anexado a cartão não é tratado como arquivo', () => {
  const h = corpoDe('async function buscarTrello', '\n}');
  assert.match(h, /!String\(a\.url\)\.includes\('trello\.com\/c\/'\)/);
});

test('o refresh token novo do Bling é guardado', () => {
  // O Bling roda o refresh a cada uso. Não guardar o novo faz a integração
  // parar sozinha na próxima vez, sem erro aparente.
  const h = corpoDe('async function tokenDoBling', '\n}');
  assert.match(h, /if \(j\.refresh_token && j\.refresh_token !== valor\.refreshToken\)/);
  assert.match(h, /await gravar\(K\.bling/);
});

test('segredo nenhum sai na resposta', () => {
  const h = corpoDe("rotasSinc.get('/sinc/estado'", '\n});');
  assert.ok(!/b\.secret\s*[,}]/.test(h) && !/t\.token\s*[,}]/.test(h),
    'a rota de estado só pode dizer SE existe, nunca o valor');
  assert.match(h, /configurado: !!\(b\.id && b\.secret\)/);
  assert.match(h, /falta:/, 'e diz o que falta configurar, pelo nome da variável');
});

test('as credenciais vêm do ambiente, nunca do corpo da requisição', () => {
  assert.match(fonte, /process\.env\.BLING_CLIENT_ID/);
  assert.match(fonte, /process\.env\.TRELLO_API_KEY/);
  assert.ok(!/req\.body\?\.(key|token|secret)/.test(fonte),
    'chave não pode chegar por requisição: ficaria no log e no histórico');
});
