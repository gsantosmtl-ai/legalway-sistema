// O motivo do cancelamento, que era pedido e nunca mostrado.
//
// Cancelar passou a exigir um motivo — foi o conserto de 47 contratos
// cancelados sem ninguém saber por quê. Só que a tela GRAVA em
// `canceladoMotivo` e quem lê procurava `motivoCancelamento`. Dois nomes para
// o mesmo campo, em arquivos diferentes: o motivo era digitado, gravado, e
// não aparecia em canto nenhum.
//
// Lê os dois nomes de propósito. Reescrever os registros antigos para
// padronizar o nome seria mexer em contrato real por uma questão de estilo.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { motivoDoStatus } from '../src/status-contrato.js';

const AQUI = dirname(fileURLToPath(import.meta.url));

test('o motivo gravado pela tela de Contratos é o que a tela lê', () => {
  const contratos = readFileSync(join(AQUI, '../../docs/contratos.html'), 'utf8');
  const campo = /alvo\.(canceladoMotivo|motivoCancelamento) = motivo;/.exec(contratos);
  assert.ok(campo, 'não achei onde o cancelamento grava o motivo');
  assert.strictEqual(motivoDoStatus({ etapa: 'Cancelado', [campo[1]]: 'Cliente desistiu' }), 'Cliente desistiu',
    `a tela grava em "${campo[1]}" e quem lê não enxerga esse campo`);
});

// Os dois nomes, porque os registros antigos podem ter qualquer um.
test('entende os dois nomes de campo', () => {
  assert.strictEqual(motivoDoStatus({ etapa: 'Cancelado', canceladoMotivo: 'Não conseguiu pagar' }), 'Não conseguiu pagar');
  assert.strictEqual(motivoDoStatus({ etapa: 'Cancelado', motivoCancelamento: 'Caso inviável' }), 'Caso inviável');
  assert.strictEqual(motivoDoStatus({ etapa: 'Cancelado' }), '');
});

// A pausa continua respondendo pelo seu próprio motivo, e cancelado ganha
// dela: num contrato cancelado o motivo que importa é o do cancelamento.
test('pausado responde pelo motivo da pausa, e cancelado ganha', () => {
  assert.strictEqual(motivoDoStatus({ etapa: 'Assinado', pausa: { motivo: 'cliente pediu para parar' } }),
    'cliente pediu para parar');
  assert.strictEqual(motivoDoStatus({ etapa: 'Cancelado', canceladoMotivo: 'Erro de cadastro',
    pausa: { motivo: 'cliente pediu para parar' } }), 'Erro de cadastro');
});

// O mesmo conserto precisa estar nos dois lados: o servidor e a tela têm
// cópias desta função, e uma só corrigida deixaria o defeito vivo no navegador.
test('a cópia do navegador foi corrigida junto', () => {
  const comum = readFileSync(join(AQUI, '../../docs/assets/comum.js'), 'utf8');
  assert.ok(/canceladoMotivo \|\| c\.motivoCancelamento/.test(comum),
    'o comum.js ainda lê só um dos dois nomes');
});
