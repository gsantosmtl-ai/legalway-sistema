// O dashboard escolhe duas coisas separadas: qual container fica visível e qual função desenha.
// Se as duas condições discordarem, a pessoa vê uma tela em branco — foi o que aconteceu com o
// papel 'sistema', que desenhava os cartões dentro de uma div com display:none.
// Este teste roda o trecho real do index.html e exige que as duas decisões batam, para todo papel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8');
const inicio = html.indexOf('  // Qual painel esta pessoa vê');
const fim = html.indexOf('  } else {', inicio);
assert.ok(inicio > 0 && fim > inicio, 'não achei o trecho que decide o painel no index.html');
const trecho = html.slice(inicio, fim + '  } else {'.length);

function decidir(papelDaSessao){
  const visivel = {};
  const res = { desenhou: null };
  const contexto = {
    res,
    papel: papelDaSessao,
    document: { getElementById: (id) => ({ set style(_){}, get style(){ return { set display(v){ visivel[id] = (v !== 'none'); } }; } }) },
    renderDashboardDocumentacao(){ res.desenhou = 'dash-documentacao'; },
    renderDashboardSDR(){ res.desenhou = 'dash-sdr'; },
  };
  vm.createContext(contexto);
  new vm.Script(trecho + "\n res.desenhou = 'dash-socio'; \n}").runInContext(contexto);
  const mostrado = Object.keys(visivel).filter(k => visivel[k]);
  return { mostrado, desenhou: res.desenhou };
}

for(const papel of ['socio', 'sistema', 'documentacao', 'sdr', 'admin', 'financeiro', '']){
  test(`papel "${papel}": o painel visível é o painel desenhado`, () => {
    const { mostrado, desenhou } = decidir(papel);
    assert.equal(mostrado.length, 1, `papel "${papel}" deixou visível: ${JSON.stringify(mostrado)}`);
    assert.equal(mostrado[0], desenhou, `papel "${papel}" mostra ${mostrado[0]} mas desenha ${desenhou}`);
  });
}

test('papel desconhecido cai no painel geral, não na tela em branco', () => {
  assert.equal(decidir('sistema').desenhou, 'dash-socio');
});
