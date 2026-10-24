// Três itens da lista dela, todos sobre o contrato depois de assinado:
//
//  · "o pdf esta sendo gerado todo cortado"
//  · "anexo que o cliente coloca no contrato nao aparece depois"
//  · "os dados do contrato tem que aparecer mas sem a possibilidade de serem editaveis"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tpl = new URL('../../docs/contratos-templates/', import.meta.url);
const MODELOS = ['eb2niw.html', 'visto-t.html', 'modelo.html'];
const contratos = readFileSync(new URL('../../docs/contratos.html', import.meta.url), 'utf8');
const auto = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');
const assinaturas = readFileSync(new URL('../src/assinaturas.js', import.meta.url), 'utf8');

function corpoDe(fonte, assinatura) {
  const ini = fonte.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < fonte.length; i++) { if (fonte[i] === '{') nivel++; else if (fonte[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return fonte.slice(ini, fim);
}

// ---------- o PDF cortado ----------
test('nenhum modelo usa avoid-all, que era o que cortava o PDF', () => {
  // `avoid-all` põe break-inside:avoid em TODO elemento, inclusive no `.body`,
  // que envolve o contrato inteiro. Gerando o PDF dos dois jeitos e comparando
  // página a página: com ele, a emenda caía no meio das linhas e o texto saía
  // fatiado na horizontal. O mesmo contrato ocupava 10 páginas em vez de 8.
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tpl), 'utf8');
    assert.doesNotMatch(html, /avoid-all/, `${m} ainda usa avoid-all`);
  }
});

test('as quebras seguem o CSS e só os blocos pequenos ficam inteiros', () => {
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tpl), 'utf8');
    assert.match(html, /mode:\['css','legacy'\]/, `${m}: o modo tem que respeitar o CSS`);
    // os invólucros grandes podem atravessar a página
    assert.match(html, /#wrap \.body, #wrap \.sec\{ break-inside:auto/, `${m}: o corpo precisa poder quebrar`);
    // e as unidades pequenas não se partem no meio
    for (const alvo of ['.pay-row', '.info-item', 'tr']) {
      assert.ok(html.includes(`'${alvo}'`), `${m}: ${alvo} deveria estar na lista de avoid`);
    }
  }
});

test('o fundo da captura é branco, como o papel', () => {
  // O PDF sai em papel branco. Com o azul-escuro da tela aqui, cada página
  // saía com uma faixa azul sólida na margem — dá para ver no PDF gerado,
  // não é teoria.
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tpl), 'utf8');
    assert.doesNotMatch(html, /backgroundColor:'#09152a'/, `${m}: fundo escuro na captura`);
    assert.match(html, /backgroundColor:'#ffffff'/, `${m}`);
  }
});

test('título de seção não fica sozinho no pé da página', () => {
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tpl), 'utf8');
    assert.match(html, /\.sec-title[^']*break-after:avoid/, m);
  }
});

// ---------- o anexo do cliente ----------
// Roda a reconciliação de verdade, com dublês, e devolve como os contratos ficaram.
function reconciliar(contratosEntrada, confirmacoes) {
  let gravou = null;
  const log = [];
  const ctx = {
    K: { contratos: 'kc' },
    bloco: async () => ({ valor: contratosEntrada, versao: 1 }),
    salvar: async (_k, v) => { gravou = v; },
    ler: async (chave) => {
      const id = chave.replace('legalway-contrato-assinado-', '');
      return confirmacoes[id] ? { valor: confirmacoes[id] } : null;
    },
    agora: () => '2026-10-23T12:00:00.000Z',
    console,
  };
  vm.createContext(ctx);
  new vm.Script(corpoDe(auto, 'async function assinaturasPendentes(log)')
    + `\nvar pronto = assinaturasPendentes(${JSON.stringify(log)} && globalThis.__log);`)
    .runInContext(Object.assign(ctx, { __log: log }));
  return ctx.pronto.then(() => ({ gravou, log }));
}

test('o anexo do cliente entra no contrato que JÁ estava Assinado', () => {
  // Era o caso real: a rota de assinatura grava o anexo, a tela de Contratos
  // grava a lista inteira a partir de uma cópia velha e apaga, e a automação
  // pulava o contrato porque ele já estava "Assinado".
  return reconciliar(
    [{ id: 'c1', cliente: 'Neilson', etapa: 'Assinado', dataAssinatura: '2026-10-22T23:08:55.000Z', historico: [] }],
    { c1: { assinadoEm: '2026-10-22T23:08:55.000Z', pdf: '/api/arquivos/x.pdf', anexos: [{ nome: 'cartao.jpg', arquivo: 'a1.jpg' }] } }
  ).then(({ gravou }) => {
    assert.ok(gravou, 'tinha diferença: precisa gravar');
    assert.equal(gravou[0].anexosCliente.length, 1);
    assert.equal(gravou[0].anexosCliente[0].arquivo, 'a1.jpg');
    assert.equal(gravou[0].pdfAssinado, '/api/arquivos/x.pdf');
  });
});

test('reconciliar de novo não duplica o anexo nem grava à toa', () => {
  return reconciliar(
    [{ id: 'c1', cliente: 'Neilson', etapa: 'Assinado', dataAssinatura: '2026-10-22T23:08:55.000Z',
       pdfAssinado: '/api/arquivos/x.pdf', anexosCliente: [{ nome: 'cartao.jpg', arquivo: 'a1.jpg' }], historico: [] }],
    { c1: { assinadoEm: '2026-10-22T23:08:55.000Z', pdf: '/api/arquivos/x.pdf', anexos: [{ nome: 'cartao.jpg', arquivo: 'a1.jpg' }] } }
  ).then(({ gravou }) => assert.equal(gravou, null, 'nada mudou: não grava'));
});

test('o segundo anexo do cliente entra ao lado do primeiro', () => {
  return reconciliar(
    [{ id: 'c1', cliente: 'Neilson', etapa: 'Assinado', dataAssinatura: 'x',
       anexosCliente: [{ nome: 'cartao.jpg', arquivo: 'a1.jpg' }], historico: [] }],
    { c1: { anexos: [{ nome: 'cartao.jpg', arquivo: 'a1.jpg' }, { nome: 'cartao.jpg', arquivo: 'a2.jpg' }] } }
  ).then(({ gravou }) => {
    // mesmo nome, arquivos diferentes: são dois documentos
    assert.equal(gravou[0].anexosCliente.length, 2);
  });
});

test('contrato cancelado fica fora da reconciliação', () => {
  return reconciliar(
    [{ id: 'c1', etapa: 'Cancelado', historico: [] }],
    { c1: { anexos: [{ nome: 'x', arquivo: 'a1' }] } }
  ).then(({ gravou }) => assert.equal(gravou, null));
});

test('contrato sem confirmação ainda não é marcado', () => {
  return reconciliar([{ id: 'c1', etapa: 'Enviado', historico: [] }], {})
    .then(({ gravou }) => assert.equal(gravou, null));
});

test('a tela de Contratos também lê os anexos da confirmação', () => {
  const corpo = corpoDe(contratos, 'async function checarConfirmacoesDeAssinatura()');
  assert.match(corpo, /confirmacao\.anexos/, 'a tela grava a lista inteira: se não ler, apaga');
  assert.match(corpo, /tenho\.has\(a\.arquivo\)/, 'sem duplicar');
});

test('a rota de assinatura grava o anexo mesmo com o contrato já Assinado', () => {
  const i = assinaturas.indexOf("const c = contratos.find((x) => x && x.id === contratoId)");
  const trecho = assinaturas.slice(i, i + 2200);
  assert.match(trecho, /let mudou = false/);
  assert.match(trecho, /if \(mudou\) await gravar\('legalway-contratos-v1'/,
    'a gravação ficava DENTRO do if de "ainda não assinado" — o anexo era mutado e nunca salvo');
});

// ---------- a tranca dos dados ----------
test('os dados do contrato assinado ficam travados', () => {
  assert.match(contratos, /function contratoTrancado\(c\)/);
  const corpo = corpoDe(contratos, 'function contratoTrancado(c)');
  assert.match(corpo, /c\.etapa === 'Assinado' \|\| c\.etapa === 'Cancelado'/);
});

function trancar(contrato) {
  const campos = {};
  const vistos = {};
  const ctx = {
    destravados: new Set(),
    CAMPOS_DE_DADOS: ['dt-telefone', 'dt-valor', 'dt-data-primeira', 'dt-recorrencia'],
    document: {
      getElementById: (id) => {
        if (!campos[id]) campos[id] = { id, tagName: id === 'dt-recorrencia' ? 'SELECT' : 'INPUT', style: {}, textContent: '', innerHTML: '', addEventListener(){} };
        return campos[id];
      },
    },
    LW: { escaparHtml: (x) => String(x) },
  };
  vm.createContext(ctx);
  new vm.Script(corpoDe(contratos, 'function contratoTrancado(c)')
    + '\n' + corpoDe(contratos, 'function aplicarTrancaDoContrato(c)')
    + `\naplicarTrancaDoContrato(${JSON.stringify(contrato)});`).runInContext(ctx);
  return { campos, vistos };
}

test('assinado: cada campo de dado fica desabilitado', () => {
  const { campos } = trancar({ id: 'c1', etapa: 'Assinado' });
  for (const id of ['dt-telefone', 'dt-valor', 'dt-data-primeira', 'dt-recorrencia']) {
    assert.equal(campos[id].disabled, true, `${id} deveria estar travado`);
  }
  assert.match(campos['dt-aviso-editar-assinado'].innerHTML, /travados/);
  assert.match(campos['dt-aviso-editar-assinado'].innerHTML, /dt-destravar/, 'com saída para corrigir de verdade');
});

test('cancelado também tranca', () => {
  const { campos } = trancar({ id: 'c1', etapa: 'Cancelado' });
  assert.equal(campos['dt-valor'].disabled, true);
});

test('antes de assinar, tudo editável — é o vendedor montando o contrato', () => {
  const { campos } = trancar({ id: 'c1', etapa: 'A gerar' });
  for (const id of ['dt-telefone', 'dt-valor', 'dt-data-primeira', 'dt-recorrencia']) {
    assert.equal(campos[id].disabled, false, `${id} não deveria estar travado`);
  }
  assert.equal(campos['dt-aviso-editar-assinado'].style.display, 'none');
});

test('observações e anexos ficam FORA da tranca', () => {
  // nota interna não é cláusula, e a foto do cartão costuma chegar depois de
  // assinar — travar isso atrapalharia sem proteger nada
  const corpo = corpoDe(contratos, "const CAMPOS_DE_DADOS = [");
  assert.doesNotMatch(corpo, /dt-obs/);
  assert.doesNotMatch(corpo, /dt-anexo/);
});

test('liberar para corrigir exige motivo e deixa rastro', () => {
  const corpo = corpoDe(contratos, 'async function destravarContrato(id)');
  assert.match(corpo, /LW\.pedirAnotacao\(/, 'pergunta o motivo');
  assert.match(corpo, /if\(motivo === null\) return;/, 'cancelar não libera');
  assert.match(corpo, /Escreva o motivo da correção/, 'motivo em branco não libera');
  assert.match(corpo, /c\.historico\.push/, 'o motivo fica no histórico do contrato');
  assert.match(corpo, /c\.historico\.pop\(\)/, 'e desfaz se a gravação falhar');
});

// ---------------------------------------------------------------------------
// Segunda rodada: "bug no pdf ainda" e "quando assina pelo celular nao valida
// o contrato e nao dispara o pdf".
//
// O que eu tinha consertado antes (as quebras de página) era real, mas não era
// tudo. Medindo o PDF gerado de verdade, em largura de celular e de
// computador, apareceram três coisas:
//
//  1. O contrato era esticado para 900px antes de ser fotografado, mas o
//     html2pdf monta o conteúdo num container do tamanho da ÁREA ÚTIL da
//     página — A4 menos as margens, 190mm, que dão 719px. Os 181px que
//     sobravam eram cortados: o lado direito do documento sumia. No
//     computador também, não só no celular.
//  2. O PDF era gerado DUAS vezes, uma para guardar e outra para o download.
//     Dois canvas enormes seguidos é memória que um telefone não tem.
//  3. Quando a geração falhava, o erro só ia para o console. O envio seguia
//     sem PDF, o servidor recusava a assinatura, e a pessoa — que já tinha
//     assinado — via uma mensagem de erro de conexão que não era de conexão.
test('o contrato não é esticado antes de ser fotografado', () => {
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tpl), 'utf8');
    const i = html.indexOf('var contractEl = document.getElementById(\'wrap\')');
    assert.ok(i > 0, m);
    const trecho = html.slice(i, i + 1800);
    assert.doesNotMatch(trecho, /contractEl\.style\.width\s*=\s*'900px'/, `${m}: largura forçada`);
    assert.doesNotMatch(trecho, /contractEl\.style\.maxWidth\s*=\s*'900px'/, `${m}: max-width forçada`);
  }
});

test('a captura não manda largura nem janela próprias', () => {
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tpl), 'utf8');
    const i = html.indexOf('html2canvas:{');
    const bloco = html.slice(i, html.indexOf('jsPDF:', i));
    assert.doesNotMatch(bloco, /windowWidth\s*:/, `${m}: windowWidth desalinha a foto`);
    assert.doesNotMatch(bloco, /\bwidth\s*:/, `${m}: width briga com a largura da página`);
  }
});

test('a escala é calculada para caber no canvas do aparelho', () => {
  // o Safari do iPhone recusa canvas acima de uns 16,7 milhões de pixels
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tpl), 'utf8');
    assert.match(html, /var LARGURA_PAGINA = 719;/, m);
    assert.match(html, /var LIMITE_CANVAS = 14e6;/, m);
    assert.match(html, /opt\.html2canvas\.scale = Math\.max\(1, Math\.min\(1\.5,/, m);
  }
});

test('o PDF é gerado UMA vez, e o download reaproveita os bytes', () => {
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tpl), 'utf8');
    assert.doesNotMatch(html, /\.from\(contractEl\)\.save\(\)/, `${m}: segunda geração só para baixar`);
    assert.match(html, /function baixarPdf\(dataUri, nomeArquivo\)/, m);
    assert.match(html, /baixarPdf\(pdfDataUri, fileName\)/, m);
    assert.equal((html.match(/outputPdf\('datauristring'\)/g) || []).length, 1, `${m}: uma geração só`);
  }
});

test('falha ao gerar o PDF para a assinatura e explica, em vez de seguir calada', () => {
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tpl), 'utf8');
    assert.doesNotMatch(html, /catch\(e\) \{ console\.error\('Falha ao gerar PDF em memória:', e\); \}/,
      `${m}: o catch que engolia a falha`);
    const i = html.indexOf("console.error('PDF error:', e);");
    assert.ok(i > 0, m);
    const trecho = html.slice(i, i + 900);
    assert.match(trecho, /return showErr\(/, `${m}: tem que avisar a pessoa`);
    assert.match(trecho, /btn\.disabled = false/, `${m}: e deixar tentar de novo`);
  }
});

test('o download não derruba a assinatura se falhar', () => {
  // o contrato assinado chega por e-mail e fica no sistema de qualquer jeito
  for (const m of MODELOS) {
    const html = readFileSync(new URL(m, tpl), 'utf8');
    const corpo = corpoDe(html, 'function baixarPdf(dataUri, nomeArquivo)');
    assert.match(corpo, /catch\(e\)\{/, m);
    assert.match(corpo, /console\.warn/, m);
  }
});
