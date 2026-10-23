// "SDR, quando recuperava o lead, ele tem que voltar para o funil do vendedor
// com o qual foi agendada, para Reunião agendada."
//
// Estava assim: se o lead JÁ existia no funil — que é o caso normal, porque o
// SDR trabalha o que o vendedor deixou esfriar — ele só era movido quando
// estava numa etapa inicial. Recuperado de "Perda", de "Proposta" ou de
// "Negociação", ficava exatamente onde estava: sem a reunião na próxima ação,
// às vezes com o vendedor antigo. O SDR marcava a reunião e o vendedor não via
// nada no funil dele.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sdr = readFileSync(new URL('../../docs/sdr.html', import.meta.url), 'utf8');

function mesmoTelefone() {
  const i = sdr.indexOf('const soDigitos = (t)=>');
  const fim = sdr.indexOf('};', sdr.indexOf('const mesmoTelefone')) + 2;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(sdr.slice(i, fim) + '\nglobalThis.f = mesmoTelefone;', ctx);
  return ctx.f;
}

test('o lead volta para a etapa e para o vendedor da reunião', () => {
  const i = sdr.indexOf("if(existente.etapa !== 'Ganho'){");
  assert.ok(i > 0, 'falta a devolução');
  const corpo = sdr.slice(i, sdr.indexOf('} else {', i));
  assert.match(corpo, /existente\.etapa = 'Reunião agendada';/);
  assert.match(corpo, /existente\.vendedor = vendedorEscolhido;/, 'o vendedor é o da reunião, não o antigo');
  assert.match(corpo, /existente\.entradaEtapa = now\(\)\.toISOString\(\);/,
    'senão o lead aparece parado há meses numa etapa em que acabou de entrar');
});

test('a reunião aparece como próxima ação do vendedor', () => {
  // É isso que faz o lead surgir no "Seu funil hoje" dele. Sem isto a reunião
  // existia só na agenda do SDR.
  const i = sdr.indexOf("if(existente.etapa !== 'Ganho'){");
  const corpo = sdr.slice(i, sdr.indexOf('} else {', i));
  assert.match(corpo, /existente\.proximaAcao = \{data, hora: horaFlorida, tipo:'Reunião'/);
  assert.match(corpo, /prioridade:'Alta'/);
});

test('recuperado deixa de ser perdido', () => {
  const i = sdr.indexOf("if(existente.etapa !== 'Ganho'){");
  const corpo = sdr.slice(i, sdr.indexOf('} else {', i));
  assert.match(corpo, /existente\.saida = null;/,
    'lead com saída preenchida continua contando como perdido nos relatórios');
});

test('lead já ganho não volta para o meio do funil', () => {
  // Contrato fechado não vira "Reunião agendada" de novo. Mas fica registrado.
  assert.match(sdr, /já está em Ganho — etapa mantida/, 'o caso precisa estar tratado e escrito');
});

test('a etapa antiga fica registrada no histórico', () => {
  const i = sdr.indexOf("if(existente.etapa !== 'Ganho'){");
  const corpo = sdr.slice(i, sdr.indexOf('} else {', i));
  assert.match(corpo, /const antes = existente\.etapa;/);
  assert.match(corpo, /saiu de "\$\{antes\}" para "Reunião agendada" com \$\{vendedorEscolhido\}/,
    'mover um lead sem dizer de onde ele veio é perder a conversa');
});

test('telefone escrito de jeitos diferentes é o mesmo cliente', () => {
  // Comparar o texto cru fazia o SDR criar um SEGUNDO lead no funil em vez de
  // devolver o que já existia — e aí o vendedor tinha dois cards do mesmo
  // cliente, um deles sem a reunião.
  const f = mesmoTelefone();
  assert.equal(f('+1 407 555 0110', '4075550110'), true);
  assert.equal(f('(407) 555-0110', '+14075550110'), true);
  assert.equal(f('+1 407 555 0110', '+1 407 555 0111'), false, 'números diferentes continuam diferentes');
  assert.equal(f('', '4075550110'), false, 'vazio não casa com ninguém');
  assert.equal(f('123', '123'), false, 'número curto demais não é telefone — não pode casar por acidente');
  assert.equal(f(null, undefined), false);
});

test('a busca do lead no funil usa a comparação nova', () => {
  assert.match(sdr, /const existente = funil\.find\(f=> f && mesmoTelefone\(f\.telefone, l\.telefone\)\)/,
    'a procura precisa usar o telefone normalizado');
  assert.ok(!/funil\.some\(f=>f\.telefone===l\.telefone\)/.test(sdr),
    'a comparação crua precisa ter saído');
});
