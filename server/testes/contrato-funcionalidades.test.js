// Auditoria do módulo de Contratos: todas as funcionalidades, uma a uma.
//
// "Vamos organizar os botões, layout para não ficar amontoado... precisamos
// deixar organizado SEM TIRAR AS FUNCIONALIDADES."
//
// Por isso este arquivo começa pelo inventário: se um botão sumir numa
// reorganização futura, aqui reprova. Organizar é mover, não perder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ct = readFileSync(new URL('../../docs/contratos.html', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const i = ct.indexOf(assinatura);
  assert.notEqual(i, -1, 'não achei ' + assinatura);
  let n = 0;
  for (let k = ct.indexOf('{', i); k < ct.length; k++) {
    if (ct[k] === '{') n++;
    else if (ct[k] === '}') { n--; if (n === 0) return ct.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham');
}

// ---------------------------------------------------------- inventário
test('nenhuma funcionalidade sumiu na reorganização', () => {
  const precisam = {
    'dt-salvar': 'salvar alterações',
    'dt-cancelar': 'cancelar contrato',
    'dt-pausar': 'pausar',
    'dt-reativar': 'reativar',
    'dt-gerar-pdf': 'gerar contrato e link',
    'dt-fechar': 'fechar',
    'dt-voltar': 'voltar etapa',
    'dt-avancar': 'avançar etapa',
    'dt-anexo-novo': 'anexar arquivo ao contrato',
    'dt-mais': 'menu de situação',
  };
  for (const [id, oque] of Object.entries(precisam)) {
    assert.ok(ct.includes(`id="${id}"`), `sumiu: ${oque} (${id})`);
  }
});

test('os campos do contrato continuam todos lá', () => {
  for (const campo of ['dt-telefone', 'dt-email', 'dt-endereco', 'dt-cpf', 'dt-nacionalidade',
    'dt-sinal', 'dt-sinal-status', 'dt-valor', 'dt-entrada', 'dt-num-parcelas',
    'dt-data-primeira', 'dt-recorrencia', 'dt-dias-custom', 'dt-pagamento-entrada',
    'dt-pagamento', 'dt-obs']) {
    assert.ok(ct.includes(`id="${campo}"`), 'sumiu o campo ' + campo);
  }
});

// ---------------------------------------------------------- organização
test('o rodapé não é mais uma fileira de sete botões', () => {
  // Cancelar, pausar e reativar saíram da linha e foram para o menu "⋮":
  // são raros, e dois deles são sem volta.
  const i = ct.indexOf('id="dt-menu-mais"');
  assert.notEqual(i, -1, 'falta o menu de situação');
  const menu = ct.slice(i, ct.indexOf('</div>', ct.indexOf('dt-cancelar', i)));
  for (const id of ['dt-pausar', 'dt-reativar', 'dt-cancelar']) {
    assert.ok(menu.includes(`id="${id}"`), id + ' tem que estar dentro do menu');
  }
  assert.match(ct, /Eram sete botões numa linha só/, 'o porquê fica escrito');
});

test('o menu fecha ao clicar fora, e não fecha ao clicar nele', () => {
  assert.match(ct, /document\.addEventListener\('click', \(\)=>\{\s*\n\s*const m = document\.getElementById\('dt-menu-mais'\);\s*\n\s*if\(m\) m\.style\.display = 'none';/);
  assert.match(ct, /getElementById\('dt-menu-mais'\)\.addEventListener\('click', \(e\)=> e\.stopPropagation\(\)\)/,
    'clicar num item do menu não pode fechar antes de o clique chegar');
});

test('o Salvar saiu do meio do formulário para o rodapé', () => {
  const salvar = ct.indexOf('id="dt-salvar"');
  const obs = ct.indexOf('id="dt-obs"');
  const rodape = ct.indexOf('id="dt-avancar"');
  assert.ok(salvar > obs && salvar < rodape + 400, 'o Salvar fica junto das outras ações, no fim');
});

// ------------------------------------------------- a ação de cada etapa
test('cada etapa mostra em destaque a ação que importa nela', () => {
  const corpo = corpoDe('function pintarAcaoPrincipal(c)');
  assert.match(corpo, /c\.etapa === 'Cancelado'/);
  assert.match(corpo, /Refazer contrato<\/b> no Financeiro/, 'cancelado aponta para o caminho certo');
  assert.match(corpo, /c\.etapa === 'Assinado'/);
  assert.match(corpo, /As parcelas e a ficha do cliente já foram criadas/);
  assert.match(corpo, /c\.etapa === 'Aguardando assinatura'/);
  assert.match(corpo, /Esperando o cliente assinar\$\{d !== null \? ` há <b>\$\{d\} dia\(s\)<\/b>` : ''\}/,
    'quantos dias esperando é a informação que faz alguém agir');
  assert.match(corpo, /📄 Gerar o contrato e o link/, 'antes de enviar, o que falta é gerar');
  assert.match(corpo, /document\.getElementById\('dt-gerar-pdf'\)\.click\(\)/,
    'o destaque reaproveita o botão que já existia — não é um caminho novo');
});

// ---------------------------------------------------------- anexos
test('dá para anexar foto do cartão no contrato', () => {
  assert.match(ct, /id="dt-anexo-novo" multiple accept="image\/\*,application\/pdf"/);
  assert.match(ct, /Foto do cartão, comprovante de pagamento, procuração\. Fica só aqui — o cliente não vê/,
    'precisa estar dito que não vai para o cliente');
  const corpo = corpoDe('async function anexarNoContrato(arquivos)');
  assert.match(corpo, /f\.size > MAX_ANEXO_CONTRATO/);
  assert.match(corpo, /TIPOS_ANEXO_CONTRATO\.test\(tipo\)/);
  assert.match(corpo, /if\(recusados\.length\) toast\('Não anexei: '/,
    'arquivo recusado não pode sumir calado');
  assert.match(corpo, /const vivo = contratos\.find\(x=> x\.id === editingId\)/,
    'ler os arquivos é uma espera: relê antes de gravar');
  assert.match(corpo, /const erro = await saveContratos\(\);/);
  assert.match(corpo, /NÃO consegui anexar/);
  assert.match(corpo, /anexo\(s\) adicionado\(s\) por/, 'fica no histórico quem anexou o quê');
});

test('remover anexo confirma, relê e confere a gravação', () => {
  const corpo = corpoDe('async function removerAnexoContrato(i)');
  assert.match(corpo, /await LW\.confirmar\(/);
  assert.match(corpo, /aindaEle\.nome !== alvo\.nome/, 'a lista pode ter mudado durante a pergunta');
  assert.match(corpo, /A lista de anexos mudou enquanto você confirmava/);
  assert.match(corpo, /const erro = await saveContratos\(\);/);
});

test('o que o CLIENTE mandou ao assinar continua separado do que a equipe anexa', () => {
  // São coisas diferentes: um é prova da assinatura, o outro é papel interno.
  assert.match(ct, /function anexosDoCliente\(c\)/);
  assert.match(ct, /Enviado pelo cliente na assinatura/);
  assert.match(ct, /c\.anexosCliente/, 'campo próprio, não misturado com c.anexos');
});

// ------------------------------------------------- assinatura pelo link
test('o link de assinatura nasce com token e move a etapa sozinho', () => {
  const i = ct.indexOf("LW.api('/publico/token'");
  const corpo = ct.slice(i - 300, i + 1400);
  assert.match(corpo, /tipo:'assinatura', ref:c\.id/);
  assert.match(corpo, /Não consegui gerar o link seguro/, 'falha no token não pode virar link quebrado');
  assert.match(corpo, /c\.etapa = 'Aguardando assinatura';/,
    'gerar o link É o envio: a etapa anda sozinha, senão o contrato fica eternamente "A gerar"');
  assert.match(corpo, /if\(erro\) toast\('Link gerado, mas NÃO consegui gravar a etapa — '/,
    'o link já existe; dizer só "erro" faria ela gerar de novo');
});

// --------------------------------------------- aritmética das parcelas
test('as parcelas fecham no centavo', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(corpoDe('function calcularParcelas('), ctx);
  const r = ctx.calcularParcelas('2026-01-17', 3, 30, 'mensal', null, 1000, 100, null);
  const soma = r.reduce((s, p) => s + Number(p.valor || 0), 0);
  assert.equal(Math.round(soma * 100) / 100, 900, '1000 menos 100 de entrada, em 3, tem que dar 900');
  assert.equal(r.length, 3);
});
