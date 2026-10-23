// Auditoria da Documentação pelo PROCESSO.
//
// Os botões estavam todos certos — o analisador não achou função inexistente
// nem botão mudo. Os dois defeitos estavam no fluxo, e os dois eram do mesmo
// tipo: uma regra existe num lugar e o resto do sistema não sabe dela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
const regras = readFileSync(new URL('../src/regras.js', import.meta.url), 'utf8');

// -------------------------------------------- o cartão parado no quadro
test('cliente enviando documento move o cartão no quadro', () => {
  // O portal marcava o documento como "Recebido" e deixava o PROCESSO parado
  // em "Documentos solicitados". O quadro dizia que ninguém tinha mandado
  // nada, enquanto os arquivos chegavam.
  const i = portal.indexOf("doc.status = 'Recebido';");
  const corpo = portal.slice(i, i + 1100);
  assert.match(corpo, /if \(p\.status === 'Documentos solicitados' \|\| p\.status === 'Aguardando boas-vindas'\)/);
  assert.match(corpo, /p\.status = 'Recebendo documentos';/);
  assert.match(corpo, /Movido de "\$\{antes\}" para "Recebendo documentos" — o cliente começou a enviar/,
    'a mudança fica no histórico: quem olhar depois precisa saber que foi o sistema');
});

test('o cartão só anda para a frente, nunca para trás', () => {
  // Processo já em "Protocolado" não pode voltar para "Recebendo documentos"
  // porque o cliente mandou um documento atrasado. Rodando a regra:
  const mover = (status) => {
    if (status === 'Documentos solicitados' || status === 'Aguardando boas-vindas') return 'Recebendo documentos';
    return status;
  };
  assert.equal(mover('Documentos solicitados'), 'Recebendo documentos');
  assert.equal(mover('Aguardando boas-vindas'), 'Recebendo documentos');
  for (const parado of ['Recebendo documentos', 'Documentação completa', 'Aguardando autorização financeira',
    'Liberado para protocolo', 'Protocolado', 'Em acompanhamento', 'Documento finalizado']) {
    assert.equal(mover(parado), parado, parado + ' não pode retroceder');
  }
  // E a regra no código é essa mesma, não outra.
  const i = portal.indexOf("doc.status = 'Recebido';");
  const corpo = portal.slice(i, i + 1100);
  assert.match(corpo, /if \(p\.status === 'Documentos solicitados' \|\| p\.status === 'Aguardando boas-vindas'\) \{/);
});

// ------------------------------------- a regra que ninguém estava lendo
test('o % mínimo para protocolar vem das Regras, não do código', () => {
  // O campo existe em Configurações, é salvo, e estava chumbado em 30 na
  // tela. Quem mudasse a regra não mudava nada.
  assert.match(regras, /percentualMinimoProtocolo: 0/, 'a regra existe no padrão');
  assert.match(cfg, /\{k:'percentualMinimoProtocolo', label:'% mínimo pago pra autorizar protocolo \(0 = livre\)'/,
    'e tem campo na tela de Configurações');
  assert.match(docs, /const minimo = Number\(\(REGRAS_CONTRATOS_DOC \|\| \{\}\)\.percentualMinimoProtocolo\) \|\| 0/);
  assert.ok(!/fin\.percentual < 30/.test(docs), 'o 30 chumbado não pode voltar');
  assert.match(docs, /const bloqueado = minimo > 0 && fin\.percentual < minimo/,
    'zero quer dizer livre: sem mínimo, não existe aviso');
});

test('a Documentação carrega as regras de CONTRATOS, que é onde o campo mora', () => {
  assert.match(docs, /if\(R && R\.contratos\) REGRAS_CONTRATOS_DOC = \{\.\.\.REGRAS_CONTRATOS_DOC, \.\.\.R\.contratos\}/);
  assert.match(docs, /mora em Configurações → CONTRATOS,\s*\n\/\/ não em Documentação/,
    'o porquê precisa estar escrito: é contraintuitivo e alguém vai "consertar"');
});

// -------------------------------------------------- rodando o aviso
test('o aviso de pagamento aparece e some conforme a regra', () => {
  const i = docs.indexOf("} else if(p.status === 'Documentação completa'){");
  const corpo = docs.slice(i, docs.indexOf('btn-pedir-autorizacao', i));
  const ctx = { REGRAS_CONTRATOS_DOC: {}, fin: {}, saida: '' };
  vm.createContext(ctx);
  const calc = `
    function avaliar(regra, pct){
      const minimo = Number((regra || {}).percentualMinimoProtocolo) || 0;
      return { minimo, bloqueado: minimo > 0 && pct < minimo };
    }`;
  vm.runInContext(calc, ctx);
  assert.equal(ctx.avaliar({ percentualMinimoProtocolo: 0 }, 5).bloqueado, false, '0 = livre');
  assert.equal(ctx.avaliar({}, 5).bloqueado, false, 'sem regra, livre');
  assert.equal(ctx.avaliar({ percentualMinimoProtocolo: 50 }, 49).bloqueado, true);
  assert.equal(ctx.avaliar({ percentualMinimoProtocolo: 50 }, 50).bloqueado, false, 'exatamente o mínimo passa');
  assert.match(corpo, /o escritório pede ao menos \$\{minimo\}%/, 'o aviso diz qual é o mínimo');
});

// ------------------------------------------- o resto do funil, conferido
test('o funil só avança com todos os documentos aprovados', () => {
  const i = docs.indexOf("} else if(p.status === 'Documentos solicitados' || p.status === 'Recebendo documentos'){");
  const corpo = docs.slice(i, docs.indexOf("} else if(p.status === 'Documentação completa')", i));
  assert.match(corpo, /if\(total > 0 && aprovados === total\)/,
    'nem com zero documentos no checklist, nem com algum pendente');
  assert.match(corpo, /Faltam documentos — \$\{aprovados\}\/\$\{total\} aprovados/);
});
