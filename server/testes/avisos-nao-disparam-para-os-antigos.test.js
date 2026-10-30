// Regra dela, 30/10/2026: "o único que vai estar aberto do processo vai ser o
// boas-vindas, a primeira mensagem, e a segunda com login e senha. Para os
// NOVOS contratos. Os antigos a gente não vai disparar, porque a gente não
// sabe o real status deles, nem o que eles já enviaram de documentação."
//
// Medido na produção ANTES do corte: ligar as boas-vindas mandaria a mensagem
// para 209 clientes reais — 79 já em acompanhamento, 27 já protocolados, 3 com
// o I-797 na mão. Todos receberiam "seja bem-vindo, vamos precisar destes
// documentos".
//
// E marcar só `boasVindasEnviada` nas antigas pioraria: o aviso do portal
// EXIGE esse campo, então as 238 sem portal virariam candidatas de uma vez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');

// Recorta contando chaves, e DENTRO do bloco do próprio gatilho. Procurar
// "candidatos(d)" a partir do nome achava o do gatilho SEGUINTE quando o
// atual não tinha um — e o teste passava a olhar a função errada.
function blocoDe(gatilho) {
  const i = fonte.indexOf('\n  ' + gatilho + ': {');
  assert.notEqual(i, -1, `não achei o gatilho ${gatilho}`);
  let nivel = 0;
  for (let k = fonte.indexOf('{', i); k < fonte.length; k++) {
    if (fonte[k] === '{') nivel++;
    else if (fonte[k] === '}' && --nivel === 0) return fonte.slice(i, k + 1);
  }
  throw new Error('chaves não fecharam');
}

function candidatosDe(gatilho) {
  const bloco = blocoDe(gatilho);
  // A assinatura varia: candidatos(d) e candidatos(d, cfg, agora).
  const j = bloco.search(/candidatos\s*\(/);
  assert.ok(j > -1, `${gatilho} não tem candidatos() próprio`);
  let nivel = 0;
  for (let k = bloco.indexOf('{', j); k < bloco.length; k++) {
    if (bloco[k] === '{') nivel++;
    else if (bloco[k] === '}' && --nivel === 0) return bloco.slice(j, k + 1);
  }
  throw new Error('chaves não fecharam');
}

test('as boas-vindas pulam as fichas de antes da virada', () => {
  assert.match(candidatosDe('boasVindasDocumentos'), /\.filter\(p => !p\.semAvisoAutomatico\)/,
    'sem este corte, 209 clientes reais recebem boas-vindas de novo');
});

test('o acesso ao portal pula as mesmas fichas', () => {
  assert.match(candidatosDe('acessoPortal'), /\.filter\(p => !p\.semAvisoAutomatico\)/,
    'este é o segundo disparo — e ele piora se só as boas-vindas forem marcadas');
});

test('o corte vem ANTES do filtro que já existia', () => {
  // Ordem importa para quem for ler: a primeira linha tem de ser o corte, para
  // ficar claro que nada de antes da virada passa daqui.
  const c = candidatosDe('boasVindasDocumentos');
  const corte = c.indexOf('!p.semAvisoAutomatico');
  const antigo = c.indexOf('!p.boasVindasEnviada');
  assert.ok(corte > -1 && antigo > -1 && corte < antigo);
});

test('nenhum OUTRO aviso de documentos ganhou o corte por engano', () => {
  // O corte é só para os dois que vão ficar ligados. Pôr nos outros
  // esconderia que eles estão desligados por decisão, não por filtro.
  const outros = ['documentosPendentes', 'processoProtocolado', 'atualizacaoUscis',
    'prazoDoCaso', 'etapaDocumentos'];
  for (const g of outros) {
    assert.doesNotMatch(candidatosDe(g), /semAvisoAutomatico/,
      `${g} não devia ter o corte — ele está desligado por decisão dela`);
  }
});
