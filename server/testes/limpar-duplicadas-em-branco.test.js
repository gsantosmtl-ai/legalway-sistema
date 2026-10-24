// Depois de devolver 250 fichas apagadas, o quadro ficou com 451 onde deveriam
// ser ~278: ao lado de cada ficha recuperada está a casca vazia que a automação
// tinha recriado no lugar dela.
//
// Devolver um registro NÃO apaga o que está lá hoje — de propósito, porque uma
// recuperação que apaga é pior do que nenhuma. Esta limpeza paga esse preço, e
// a regra que a torna segura é uma só: ficha com QUALQUER arquivo nunca entra
// na lista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const ini = tela.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = tela.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < tela.length; i++) { if (tela[i] === '{') nivel++; else if (tela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return tela.slice(ini, fim);
}

function agrupar(processos) {
  const ctx = { processos, situacaoDe: () => null,
    semAcDoc: x => String(x||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim() };
  vm.createContext(ctx);
  new vm.Script(corpoDe('function trabalhoDaFicha(p)') + '\n' + corpoDe('function gruposDuplicados()')
    + '\nvar r = JSON.stringify(gruposDuplicados().map(g=>({ fica:g.fica.map(p=>p.id), cascas:g.cascas.map(p=>p.id) })));')
    .runInContext(ctx);
  return JSON.parse(ctx.r);
}

const ficha = (id, extra = {}) => ({ id, clienteNome: 'Fulano', telefone: '+1 407 555 0101',
  servico: 'Visto T', status: 'Aguardando boas-vindas', checklist: [], anexos: [], ...extra });

test('a casca sai e a que tem anexo fica', () => {
  const r = agrupar([
    ficha('cheia', { anexos: [{ nome: 'x' }], status: 'Em acompanhamento' }),
    ficha('vazia'),
  ]);
  assert.deepEqual(r, [{ fica: ['cheia'], cascas: ['vazia'] }]);
});

test('checklist em branco não conta como trabalho', () => {
  // a casca recriada vem com o checklist montado, mas sem nenhum arquivo
  const r = agrupar([
    ficha('cheia', { checklist: [{ nome: 'Passaporte', arquivo: '/x.pdf' }] }),
    ficha('casca', { checklist: [{ nome: 'Passaporte' }, { nome: 'Carta' }] }),
  ]);
  assert.deepEqual(r, [{ fica: ['cheia'], cascas: ['casca'] }]);
});

test('arquivo em `arquivos` também segura a ficha', () => {
  const r = agrupar([
    ficha('a', { checklist: [{ nome: 'Passaporte', arquivos: [{ url: '/x' }] }] }),
    ficha('b'),
  ]);
  assert.deepEqual(r, [{ fica: ['a'], cascas: ['b'] }]);
});

test('duas vazias da mesma pessoa NÃO são tocadas', () => {
  // pode ser caso real que ninguém começou; escolher qual apagar seria chute
  assert.deepEqual(agrupar([ficha('a'), ficha('b')]), []);
});

test('duas cheias não são tocadas', () => {
  const r = agrupar([
    ficha('a', { anexos: [{ nome: 'x' }] }),
    ficha('b', { anexos: [{ nome: 'y' }] }),
  ]);
  assert.deepEqual(r, []);
});

test('serviços diferentes não são duplicata', () => {
  const r = agrupar([
    ficha('a', { servico: 'Visto T', anexos: [{ nome: 'x' }] }),
    ficha('b', { servico: 'MOTION' }),
  ]);
  assert.deepEqual(r, []);
});

test('pessoas diferentes não são duplicata', () => {
  const r = agrupar([
    ficha('a', { anexos: [{ nome: 'x' }] }),
    ficha('b', { telefone: '+1 407 555 0999', clienteNome: 'Sicrano' }),
  ]);
  assert.deepEqual(r, []);
});

test('sem telefone, agrupa pelo nome', () => {
  const r = agrupar([
    ficha('a', { telefone: '', anexos: [{ nome: 'x' }] }),
    ficha('b', { telefone: '' }),
  ]);
  assert.deepEqual(r, [{ fica: ['a'], cascas: ['b'] }]);
});

test('ficha cancelada fica fora da conta', () => {
  const ctx = { processos: [ficha('a', { anexos: [{ nome: 'x' }] }), ficha('b')],
    situacaoDe: (p) => p.id === 'b' ? 'cancelado' : null,
    semAcDoc: x => String(x||'').toLowerCase().trim() };
  vm.createContext(ctx);
  new vm.Script(corpoDe('function trabalhoDaFicha(p)') + '\n' + corpoDe('function gruposDuplicados()')
    + '\nvar r = JSON.stringify(gruposDuplicados().length);').runInContext(ctx);
  assert.equal(JSON.parse(ctx.r), 0);
});

// ---------------------------------------------------------------- a remoção
test('confere de novo depois da pergunta, e deixa de fora quem ganhou arquivo', () => {
  const corpo = corpoDe('async function removerCascas(grupos)');
  const iPergunta = corpo.indexOf('await LW.confirmar(');
  const iConfere = corpo.indexOf('const aRemover = ids.filter');
  assert.ok(iConfere > iPergunta, 'alguém pode anexar enquanto a caixa está aberta');
  assert.match(corpo, /!trabalhoDaFicha\(p\)\.temAlgo/);
  assert.match(corpo, /ficha\(s\) ganharam arquivo agora e ficaram de fora/);
});

test('se a gravação falhar, nada é removido', () => {
  const corpo = corpoDe('async function removerCascas(grupos)');
  assert.match(corpo, /const antes = processos\.slice\(\)/);
  assert.match(corpo, /if\(erro\)\{ processos = antes;/);
});

test('o aviso diz que dá para desfazer', () => {
  const corpo = corpoDe('async function removerCascas(grupos)');
  assert.match(corpo, /Configurações → Backup/, 'remover aqui não é perder: volta pela devolução');
  assert.match(corpo, /sem nenhum arquivo e sem nenhum anexo/);
});

test('o botão só aparece quando há casca', () => {
  const i = tela.indexOf('id="abrir-duplicadas"');
  assert.ok(i > 0);
  assert.match(tela.slice(i - 300, i), /const g = gruposDuplicados\(\); const cascas = g\.reduce/);
});

// ---------------------------------------------------------------------------
// A trava de redução em massa existia sem porta.
//
// O servidor recusa uma gravação que apague muita coisa de uma vez — é a defesa
// contra uma tela com dado pela metade sobrescrever o módulo inteiro. Quem
// quiser mesmo manda `confirmarReducao: true`. Só que NENHUMA tela sabia
// mandar: a limpeza removia na tela, o servidor recusava, o código desfazia, e
// ninguém entendia por que nada acontecia.
test('o storage sabe confirmar uma redução em massa', () => {
  const storage = readFileSync(new URL('../../docs/assets/storage.js', import.meta.url), 'utf8');
  assert.match(storage, /async function set\(key, value, shared, opcoes\)/);
  assert.match(storage, /if\(opcoes && opcoes\.confirmarReducao\) corpo\.confirmarReducao = true;/);
});

test('e só a limpeza usa isso, depois de perguntar com o número na frente', () => {
  const corpo = corpoDe('async function removerCascas(grupos)');
  assert.match(corpo, /\{ confirmarReducao: true \}/);
  const iPergunta = corpo.indexOf('await LW.confirmar(');
  const iConfirma = corpo.indexOf('confirmarReducao: true');
  assert.ok(iPergunta > 0 && iConfirma > iPergunta, 'confirmar antes de perguntar seria o avesso');
  assert.match(corpo, /Remover \$\{ids\.length\} ficha\(s\) em branco\?/, 'o número aparece na pergunta');
  // e é a única CHAMADA da tela que confirma redução (o nome também aparece no
  // comentário que explica por que ela existe)
  assert.equal((tela.match(/\{ confirmarReducao: true \}/g) || []).length, 1,
    'nenhuma outra gravação desta tela pode passar por cima da trava');
});

test('falhar ao gravar continua desfazendo tudo', () => {
  const corpo = corpoDe('async function removerCascas(grupos)');
  assert.match(corpo, /catch\(e\)\{ erro = e\.message/);
  assert.match(corpo, /LW\.avisarFalhaGravacao\(PROCESSOS_KEY, erro\)/, 'a faixa vermelha aparece');
  assert.match(corpo, /if\(erro\)\{ processos = antes; renderDrawer\(\); return; \}/);
});

test('o servidor continua recusando quem não confirma', () => {
  const rotas = readFileSync(new URL('../src/armazenamento.js', import.meta.url), 'utf8');
  assert.match(rotas, /if \(risco && !req\.body\.confirmarReducao\)/, 'a trava não foi afrouxada');
  assert.match(rotas, /anotar\('apagar-em-massa'/, 'e a tentativa recusada continua indo para a segurança');
  assert.match(rotas, /Redução confirmada: de \$\{risco\.antes\} para \$\{risco\.depois\} registros/,
    'a confirmada fica na auditoria');
});
