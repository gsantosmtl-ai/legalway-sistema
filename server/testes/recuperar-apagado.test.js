// A ficha do Jose Anselmo — 3 documentos trabalhados e 10 anexos — sumiu numa
// unificação. O defeito que a apagou já está corrigido (unificar-processos),
// mas restava um buraco maior: não havia NENHUM caminho de volta dentro do
// sistema. Restaurar um backup troca o módulo inteiro, e isso levaria junto
// tudo o que o escritório fez desde a cópia — então na prática ninguém
// restaura, e o dado fica perdido.
//
// Toda gravação já virava uma versão em `armazenamento_hist` (as 30 últimas).
// Até aqui só a mesclagem lia isso. Agora dá para devolver um registro só.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { devolverItens } = await import('../src/armazenamento.js');

const srv = readFileSync(new URL('../src/armazenamento.js', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

const JOSE = { id: 'doc1791747916222783', clienteNome: 'Jose Anselmo Ferreira Junior',
  checklist: [{ nome: 'Passaporte' }, { nome: 'Certidão' }, { nome: 'Procuração' }],
  anexos: Array.from({ length: 10 }, (_, i) => ({ id: 'a' + i })) };

test('devolver acrescenta e não encosta no que existe hoje', () => {
  const hoje = [{ id: 'x', nome: 'Edna' }, { id: 'y', nome: 'Maria' }];
  const { lista, devolvidos } = devolverItens(hoje, [JOSE]);
  assert.equal(lista.length, 3);
  assert.equal(devolvidos.length, 1);
  assert.equal(lista[2].id, 'doc1791747916222783');
  assert.equal(lista[2].anexos.length, 10, 'volta com os anexos');
  assert.equal(hoje.length, 2, 'a lista de hoje não é alterada no lugar');
  assert.equal(lista[0].nome, 'Edna', 'o que já estava continua igual, na mesma ordem');
});

test('um id que já está lá não entra de novo', () => {
  // Ela clica duas vezes, ou a ficha foi recriada com o mesmo id. Duplicar
  // seria trocar um problema por outro.
  const hoje = [{ id: 'doc1791747916222783', clienteNome: 'recriada em branco' }];
  const { lista, devolvidos } = devolverItens(hoje, [JOSE]);
  assert.equal(lista.length, 1);
  assert.equal(devolvidos.length, 0);
  assert.equal(lista[0].clienteNome, 'recriada em branco', 'e a de hoje não é sobrescrita pela antiga');
});

test('dois pedidos iguais no mesmo clique viram um só', () => {
  const { lista } = devolverItens([], [JOSE, { ...JOSE }]);
  assert.equal(lista.length, 1);
});

test('lista vazia ou módulo que ainda não é lista', () => {
  assert.equal(devolverItens(null, [JOSE]).lista.length, 1);
  assert.equal(devolverItens(undefined, []).lista.length, 0);
});

test('a rota só procura o que NÃO existe mais hoje', () => {
  const i = srv.indexOf("rotasArmazenamento.get('/storage/:chave/apagados'");
  const corpo = srv.slice(i, srv.indexOf('\n});', i));
  assert.match(corpo, /NOT EXISTS \(\s*SELECT 1 FROM armazenamento a/,
    'senão a lista traria os 263 processos vivos junto');
  assert.match(corpo, /DISTINCT ON \(e->>'id'\)[\s\S]*ORDER BY e->>'id', h\.versao DESC/,
    'de cada registro apagado interessa a versão mais recente em que ele ainda estava');
  assert.match(corpo, /jsonb_array_length\(e->'anexos'\)/,
    'o resumo tem que dizer quantos anexos vinham — é o que ela reconhece');
  assert.ok(!/SELECT h\.valor|valor AS/.test(corpo),
    'as 30 versões inteiras são dezenas de MB: só o resumo volta para o navegador');
});

test('recuperar exige permissão de gravar e fica na auditoria', () => {
  const i = srv.indexOf("rotasArmazenamento.post('/storage/:chave/recuperar'");
  const corpo = srv.slice(i, srv.indexOf('\n});', i));
  assert.match(corpo, /if \(!podeGravar\(req\.usuario, chave\)\)/, 'ler não basta para devolver');
  assert.match(corpo, /anotar\('sem-permissao'/);
  assert.match(corpo, /INSERT INTO auditoria/, 'quem devolveu o quê tem que ficar registrado');
  assert.match(corpo, /Essa versão já saiu do histórico \(ficam as 30 últimas\)/,
    'quando não dá mais, a mensagem explica por quê em vez de dizer "erro"');
  assert.match(corpo, /Esse módulo não é uma lista de registros/,
    'bloco que não é lista (regras, templates) não tem id para recuperar');
});

test('o histórico não é visível para quem não pode ler o módulo', () => {
  for (const rota of ["/storage/:chave/versoes'", "/storage/:chave/versoes/:versao'", "/storage/:chave/apagados'"]) {
    const i = srv.indexOf(rota);
    assert.notEqual(i, -1, 'não achei ' + rota);
    const corpo = srv.slice(i, srv.indexOf('\n});', i));
    assert.match(corpo, /if \(!podeLer\(req\.usuario, chave\)\)/, rota + ' sem checar permissão vaza o módulo inteiro');
    assert.match(corpo, /RE_CHAVE\.test\(chave\)/, rota + ' precisa validar a chave');
  }
});

test('a tela está na aba de Backup e diz a diferença entre devolver e restaurar', () => {
  assert.match(cfg, /↩️ Recuperar algo apagado/);
  assert.match(cfg, /Restaurar o backup inteiro faz o contrário: troca o módulo todo/,
    'as duas coisas ficam lado a lado: tem que estar escrito qual é qual');
  assert.match(cfg, /id="rec-modulo"/);
  assert.match(cfg, /id="btn-recuperar-buscar"/);
  assert.match(cfg, /sel\.innerHTML = Object\.keys\(NOME_DO_BLOCO\)/,
    'os módulos são os mesmos que o backup já sabe nomear');
  assert.match(cfg, /ch==='legalway-processos-documentacao-v1'\?' selected':''/,
    'Documentação já vem escolhida — é de lá que a ficha sumiu');
});

test('devolver é confirmado, e a confirmação avisa do que pode acontecer', () => {
  const i = cfg.indexOf('async function devolverApagado(chave, id, versao, btn)');
  const corpo = cfg.slice(i, cfg.indexOf('\n}', i));
  assert.match(corpo, /await LW\.confirmar\(/);
  assert.match(corpo, /Nada que existe hoje é alterado ou apagado/);
  assert.match(corpo, /as duas vão aparecer — aí dá para unificar/,
    'a ficha foi recriada em branco: ela precisa saber que vai ver duas');
  assert.match(corpo, /toast\('Não consegui devolver — ' \+ e\.message\)/,
    'falha não pode passar por sucesso');
  assert.match(corpo, /btn\.disabled = false; btn\.textContent = 'Devolver'/,
    'e o botão tem que voltar a funcionar');
});
