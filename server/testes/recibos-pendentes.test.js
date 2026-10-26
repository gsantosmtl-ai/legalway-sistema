// A tela de Documentação e a varredura do USCIS precisam concordar sobre onde mora o
// recibo. O servidor consulta p.protocolo.recibo; se a tela um dia passar a olhar
// p.protocolo.numero (que é o número interno, outro campo), a lista de pendências ficaria
// vazia e ninguém perceberia que nenhum caso está sendo acompanhado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Lido do texto do uscis.js em vez de importado: importar o módulo acorda a conexão com
// o banco. O que importa aqui é que seja literalmente a mesma regra dos dois lados.
// A regra do formato saiu do uscis.js e virou recibos.js, que é de onde as
// duas pontas (consulta e tela) agora leem. Continua sendo lida do TEXTO, e não
// importada, porque importar o uscis.js acorda a conexão com o banco.
const fonteUscis = readFileSync(new URL('../src/recibos.js', import.meta.url), 'utf8');
const mRe = fonteUscis.match(/RE_RECIBO = (\/.+?\/);/);
assert.ok(mRe, 'não achei RE_RECIBO no recibos.js');
const RE_RECIBO = new RegExp(mRe[1].slice(1, -1));

const html = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const ini = html.indexOf('function processosSemRecibo(){');
assert.ok(ini > 0, 'não achei processosSemRecibo no documentos.html');
const fim = html.indexOf('\n}', ini) + 2;
const trecho = html.slice(ini, fim);

// `processosSemRecibo` passou a perguntar a LW.recibosDoProcesso, porque um
// processo tem vários números agora. Entra a implementação DE VERDADE,
// recortada do comum.js — um dublê aqui mediria o dublê.
function lwDeVerdade(){
  const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
  const c = vm.createContext({ window:{LW:{}}, Math, Number, String, JSON, Array, Set });
  c.LW = c.window.LW;
  for(const nome of ['RE_RECIBO','normalizarRecibo','reciboValido','recibosDoProcesso']){
    const ini = 'window.LW.' + nome + ' =';
    const i = comum.indexOf(ini);
    assert.ok(i >= 0, 'não achei ' + ini + ' no comum.js');
    let j = i + ini.length, ch = 0, pa = 0, col = 0;
    for(; j < comum.length; j++){
      const x = comum[j];
      if(x === '{') ch++; else if(x === '}') ch--;
      else if(x === '(') pa++; else if(x === ')') pa--;
      else if(x === '[') col++; else if(x === ']') col--;
      else if(x === ';' && !ch && !pa && !col) break;
    }
    vm.runInContext(comum.slice(i, j + 1), c);
  }
  return c.LW;
}

function pendentes(lista){
  const ctx = { processos: lista, LW: lwDeVerdade() };
  vm.createContext(ctx);
  new vm.Script(trecho + '\nvar __r = processosSemRecibo();').runInContext(ctx);
  return ctx.__r;
}

const comRecibo = { id:'a', clienteNome:'Com recibo', status:'Protocolado', protocolo:{ numero:'123', recibo:'IOE0912345678' } };
const semProtocolo = { id:'b', clienteNome:'Veio do Trello', status:'Protocolado', protocolo:null };
const soNumero = { id:'c', clienteNome:'Só número interno', status:'Em acompanhamento', protocolo:{ numero:'LW-2026-14', recibo:'' } };
const aindaColetando = { id:'d', clienteNome:'Coletando', status:'Recebendo documentos', protocolo:null };

test('lista quem está protocolado sem recibo', () => {
  const r = pendentes([comRecibo, semProtocolo, soNumero, aindaColetando]).map(p=>p.id);
  assert.deepEqual(r, ['b', 'c']);
});

test('número interno preenchido não conta como recibo do USCIS', () => {
  assert.deepEqual(pendentes([soNumero]).map(p=>p.id), ['c'],
    'confundiu protocolo.numero com protocolo.recibo — a varredura do USCIS usa recibo');
});

test('processo que ainda não foi protocolado não entra na lista', () => {
  assert.deepEqual(pendentes([aindaColetando]), []);
});

test('o recibo que a tela aceita é o mesmo formato que o servidor consulta', () => {
  assert.ok(RE_RECIBO.test(comRecibo.protocolo.recibo));
  assert.equal(pendentes([comRecibo]).length, 0);
  assert.ok(!RE_RECIBO.test('IOE091234567'), '12 caracteres não deveria passar');
  assert.ok(!RE_RECIBO.test('IO09123456789'), 'só 2 letras não deveria passar');
});
