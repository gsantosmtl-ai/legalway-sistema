// Duas coisas que ela pediu junto, e que são a mesma história vista dos dois
// lados: o anexo da EQUIPE que "às vezes não ia", e o aviso de quando o
// CLIENTE anexa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');

function corpoDe(fonte, assinatura) {
  const i = fonte.indexOf(assinatura);
  assert.notEqual(i, -1, 'não achei ' + assinatura);
  let n = 0;
  for (let k = fonte.indexOf('{', i); k < fonte.length; k++) {
    if (fonte[k] === '{') n++;
    else if (fonte[k] === '}') { n--; if (n === 0) return fonte.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham');
}

// ------------------------------------------- o anexo que "não ia"
test('arrastar um arquivo passa pelo mesmo caminho do botão', () => {
  // O arrastar-e-soltar tinha caminho próprio, com três defeitos: recusava o
  // SEGUNDO arquivo (contra a decisão de que um documento pode ter frente e
  // verso), ignorava a recusa por tipo ou tamanho — dizia "anexado" sobre
  // nada — e não conferia a gravação.
  const i = docs.indexOf("data-solta-doc')); const f = e.dataTransfer.files[0]");
  const corpo = docs.slice(i, i + 700);
  assert.match(corpo, /await anexarPeloArrastar\(p, idx, f\)/);
  assert.ok(!/já tem anexo — remova antes de trocar/.test(corpo),
    'o bloqueio do segundo arquivo não pode voltar');
  assert.ok(!/toast\(`"\$\{p\.checklist\[idx\]\.nome\}" anexado\.`\)/.test(corpo),
    'não pode mais anunciar sucesso sem saber se deu certo');
});

test('arrastar confere a recusa e a gravação, e desfaz na tela quando falha', () => {
  const corpo = corpoDe(docs, 'async function anexarPeloArrastar(p, idx, arquivo)');
  assert.match(corpo, /if\(!\(await anexarArquivoNoItem\(p, idx, arquivo\)\)\) return;/,
    'arquivo recusado por tipo ou tamanho para aqui');
  assert.match(corpo, /const erro = await saveProcessos\(\);/);
  assert.match(corpo, /Object\.assign\(item, antes\);/,
    'gravação falhou: o anexo some da tela, senão ela acha que foi');
  assert.match(corpo, /arquivos: Array\.isArray\(item\.arquivos\) \? item\.arquivos\.slice\(\) : undefined/,
    'o desfazer precisa guardar a lista nova também, não só o campo antigo');
  assert.match(corpo, /NÃO foi anexado/);
});

test('anexar aceita o segundo arquivo do mesmo documento', () => {
  const corpo = corpoDe(docs, 'async function anexarArquivoNoItem(p, idx, arquivo)');
  assert.match(corpo, /item\.arquivos\.push\(\{ nome: arquivo\.name/, 'acrescenta');
  assert.match(corpo, /if\(item\.arquivo\)\{ item\.arquivos\.unshift\(/,
    'o que estava no formato antigo vira o primeiro da lista, em vez de sumir');
  assert.match(corpo, /arquivo\.size > 40\*1024\*1024/);
  assert.match(corpo, /TIPOS_ACEITOS\.test\(tipo\)/);
});

// ------------------------------------- a notificação do lado do cliente
function marcador() {
  const ctx = { Date, console };
  vm.createContext(ctx);
  vm.runInContext(corpoDe(portal, 'function marcarNovidade(p, oque)'), ctx);
  return ctx.marcarNovidade;
}

test('o cliente anexa e o processo fica marcado', () => {
  const marcar = marcador();
  const p = {};
  marcar(p, 'enviou "Passaporte"');
  assert.equal(p.novidadeCliente.visto, false);
  assert.equal(p.novidadeCliente.quantos, 1);
  assert.equal(p.novidadeCliente.oque, 'enviou "Passaporte"');
  assert.ok(p.novidadeCliente.quando, 'e quando foi');
});

test('dois envios seguidos viram "2 novidades", não dois avisos', () => {
  const marcar = marcador();
  const p = {};
  marcar(p, 'enviou "Passaporte"');
  marcar(p, 'enviou "Certidão"');
  assert.equal(p.novidadeCliente.quantos, 2);
  assert.equal(p.novidadeCliente.oque, 'mandou mais coisas');
});

test('depois de visto, o próximo envio recomeça a contagem', () => {
  const marcar = marcador();
  const p = { novidadeCliente: { quantos: 5, visto: true, oque: 'mandou mais coisas' } };
  marcar(p, 'enviou "RG"');
  assert.equal(p.novidadeCliente.quantos, 1, 'o que já foi visto não conta de novo');
  assert.equal(p.novidadeCliente.oque, 'enviou "RG"');
});

test('o formulário preenchido também marca', () => {
  const i = portal.indexOf("rotasPortalCliente.post('/portal/formulario/:indice'");
  assert.match(portal.slice(i, i + 2600), /marcarNovidade\(p, `preencheu o formulário "\$\{doc\.nome\}"`\)/);
});

// ------------------------------------------- e onde isso aparece
test('a novidade aparece no cartão, no contador e no painel do dia', () => {
  assert.match(docs, /const temNovidade = \(p\)=> !!\(p && p\.novidadeCliente && !p\.novidadeCliente\.visto\)/);
  assert.match(docs, /🔔 \$\{p\.novidadeCliente\.quantos > 1 \? p\.novidadeCliente\.quantos \+ ' novidades do cliente' : 'O cliente ' \+ esc\(p\.novidadeCliente\.oque\)\}/,
    'no cartão, dizendo o que foi');
  assert.match(docs, /const novidades = processos\.filter\(temNovidade\)\.length/);
  assert.match(docs, /🔔 Novidades do cliente/, 'no contador do topo');
  assert.match(docs, /bloco\('🔔 O cliente mandou coisa nova', d\.novidades/, 'e no painel "O dia"');
});

test('abrir a ficha marca como visto — e só grava se havia algo', () => {
  const corpo = corpoDe(docs, 'function openDrawer(id, aba)');
  assert.match(corpo, /if\(temNovidade\(p\)\)\{/);
  assert.match(corpo, /p\.novidadeCliente\.visto = true;/);
  assert.match(corpo, /p\.novidadeCliente\.vistoPor = \(sessao && sessao\.nome\) \|\| ''/, 'quem viu');
  const depoisDoRender = corpo.indexOf('renderDrawer();') < corpo.indexOf('visto = true');
  assert.ok(depoisDoRender, 'marcar DEPOIS de desenhar: quem abriu ainda vê o que mudou');
});
