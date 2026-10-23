// "Tenho que tirar os testes para deixar a plataforma limpa."
//
// São 16 registros espalhados por cinco módulos — "maria teste", "Cliente Teste
// 1192", "teste de funil", "Felipe Test". O nome é o único sinal que existe:
// ninguém marcou nada como teste na hora de criar.
//
// Por isso a ferramenta PROCURA e MOSTRA, mas não decide: a lista nasce marcada
// e ela desmarca o que for gente de verdade. Apagar por padrão de nome, sem
// alguém olhar, é como esta tela erraria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

function pegar(nome) {
  const i = cfg.indexOf(`const ${nome} =`);
  assert.ok(i > 0, `não achei ${nome}`);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cfg.slice(i, cfg.indexOf('\n', i)) + `\nglobalThis.f = ${nome};`, ctx);
  return ctx.f;
}

test('reconhece os registros de teste que existem hoje', () => {
  const f = pegar('PARECE_TESTE');
  for (const nome of ['maria teste', 'Cliente Teste 1192', 'teste 2', 'teste de funil',
                      'Felipe Test', 'Teste Revisão', 'TESTE', 'cliente-teste', 'lead_teste_3']) {
    assert.equal(f(nome), true, `"${nome}" é registro de teste`);
  }
});

test('nome de gente de verdade não é confundido', () => {
  // A busca é por palavra inteira. Sem isso, "Celeste" e "Modesto" entrariam na
  // lista de apagar — e seria um cliente apagado por causa de uma letra.
  const f = pegar('PARECE_TESTE');
  for (const nome of ['Celeste Maria da Silva', 'Modesto Pereira', 'Ernesto Alves',
                      'Testa Branca', 'Protestante', 'Maria Silva', '']) {
    assert.equal(f(nome), false, `"${nome}" é gente de verdade`);
  }
});

test('registro com dinheiro recebido não pode ser apagado por aqui', () => {
  // Um contrato de teste em que alguém deu baixa por engano deixou de ser um
  // contrato de teste: virou um problema de conciliação, e apagar esconde o
  // problema em vez de resolver.
  const f = pegar('temDinheiro');
  assert.equal(f({ valorRecebido: 500 }), true);
  assert.equal(f({ valorPago: 0.01 }), true);
  assert.equal(f({ valorRecebido: 0 }), false);
  assert.equal(f({}), false);
  assert.equal(f(null), false);
  // E o protegido nasce desmarcado e travado na tela.
  assert.match(cfg, /if\(!a\.protegido\) marcados\.add\(b\.chave \+ '\|' \+ a\.i\)/,
    'protegido não pode nascer marcado');
  assert.match(cfg, /\$\{a\.protegido\?'disabled':''\}/, 'e a caixinha fica travada');
});

test('apaga de trás para a frente', () => {
  // Os índices são do array original. Removendo do começo, o primeiro removido
  // desloca todos os outros e some o registro errado — um cliente de verdade.
  const i = cfg.indexOf('const alvo = b.achados.filter');
  const linha = cfg.slice(i, cfg.indexOf('\n', i));
  assert.match(linha, /\.sort\(\(x,y\)=> y - x\)/, 'a ordem decrescente é o que torna o splice seguro');
  assert.match(cfg, /alvo\.forEach\(i=> copia\.splice\(i, 1\)\)/);
});

test('mexe numa cópia, e só grava o módulo que mudou', () => {
  const i = cfg.indexOf('const aplicar = async ()=>');
  const corpo = cfg.slice(i, cfg.indexOf('\n  };', i));
  assert.match(corpo, /const copia = b\.lista\.slice\(\);/, 'não mexe na lista original antes de gravar');
  assert.match(corpo, /if\(!alvo\.length\) continue;/, 'módulo sem nada marcado não é regravado à toa');
  assert.match(corpo, /if\(erro\) falhas\.push/, 'falha de gravação precisa aparecer');
  assert.match(corpo, /Não consegui em: \$\{falhas\.join\('; '\)\}/,
    'e dizer em qual módulo, senão ela não sabe o que ficou pela metade');
});

test('mostra o que vai sair antes de sair', () => {
  const i = cfg.indexOf('const aplicar = async ()=>');
  const corpo = cfg.slice(i, cfg.indexOf('\n  };', i));
  assert.match(corpo, /const ok = await LW\.confirmar\(`Apagar \$\{marcados\.size\} registro\(s\)\?`/,
    'tem que confirmar com o número');
  assert.match(corpo, /\[\.\.\.new Set\(nomes\)\]\.join\(', '\)/, 'e listar os nomes');
  assert.match(corpo, /versão no histórico de alterações, então dá para voltar/,
    'a pessoa precisa saber que é reversível — senão não clica, ou clica com medo');
});

test('procura nos módulos onde os testes aparecem', () => {
  const i = cfg.indexOf('const ONDE_PROCURAR_TESTES = [');
  const bloco = cfg.slice(i, cfg.indexOf('];', i));
  for (const chave of ['legalway-contratos-v1', 'legalway-clientes-v1', 'legalway-funil-v1',
                       'legalway-leads-v1', 'legalway-sdr-v1', 'legalway-processos-documentacao-v1',
                       'legalway-financeiro-v1', 'legalway-contas-pagar-v1']) {
    assert.ok(bloco.includes(chave), `falta procurar em ${chave}`);
  }
  // Cada módulo guarda o nome do cliente num campo diferente.
  assert.match(bloco, /chave:'legalway-contratos-v1',\s+rotulo:'Contratos',\s+campo:'cliente'/);
  assert.match(bloco, /chave:'legalway-processos-documentacao-v1', rotulo:'Documentação',\s+campo:'clienteNome'/);
});

test('módulo sem permissão não derruba a procura', () => {
  const i = cfg.indexOf('async function abrirLimpezaDeTestes()');
  const corpo = cfg.slice(i, cfg.indexOf('const quantos =', i));
  assert.match(corpo, /catch\(e\)\{ \/\* sem permissão nesse módulo: não é problema desta tela \*\/ \}/,
    'quem não lê Contas a pagar ainda tem de poder limpar o Funil');
});
