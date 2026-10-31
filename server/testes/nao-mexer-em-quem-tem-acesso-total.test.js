// Escalada de privilégio pela porta dos fundos.
//
// `PUT /usuarios/:id` já conferia: quem não tem acesso total não edita quem
// tem. Três irmãs dela não conferiam nada disso — só `podeEditar`, que também
// vale para quem tem a permissão "usuários: editar" sem ser administrador:
//
//   POST /usuarios/:id/ativo           → desativar um sócio
//   POST /usuarios/:id/resetar-senha   → e esta DEVOLVE a senha temporária
//                                        na resposta, então dá para entrar
//                                        como ele em seguida
//   DELETE /usuarios/:id               → excluir um sócio inativo
//
// Conferido no banco em 31/10/2026: as seis pessoas que hoje podem editar
// usuários já têm acesso total, então não havia por onde. O buraco abriria no
// dia em que existisse um perfil de secretaria — e segunda é o dia em que as
// contas são mexidas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/usuarios.js', import.meta.url), 'utf8');

function corpoDaRota(assinatura) {
  const i = fonte.indexOf(assinatura);
  assert.ok(i > 0, `não achei ${assinatura}`);
  const abre = fonte.indexOf('{', fonte.indexOf('=>', i));
  let nivel = 0;
  for (let k = abre; k < fonte.length; k++) {
    if (fonte[k] === '{') nivel++;
    else if (fonte[k] === '}') { nivel--; if (!nivel) return fonte.slice(i, k + 1); }
  }
  throw new Error('não fechei as chaves');
}

const ROTAS = [
  ["rotasUsuarios.post('/usuarios/:id/ativo'", 'ativar/desativar'],
  ["rotasUsuarios.post('/usuarios/:id/resetar-senha'", 'resetar a senha'],
  ["rotasUsuarios.delete('/usuarios/:id'", 'excluir'],
];

for (const [assinatura, oque] of ROTAS) {
  test(`${oque}: só quem tem acesso total mexe em quem tem`, () => {
    assert.match(corpoDaRota(assinatura), /if \(await barrarMexerEmAdmin\(req, res, '[^']+'\)\) return;/,
      'a rota precisa barrar antes de agir');
  });

  test(`${oque}: a conferência vem ANTES de qualquer escrita`, () => {
    const c = corpoDaRota(assinatura);
    const guarda = c.indexOf('barrarMexerEmAdmin');
    const escrita = Math.min(...['UPDATE usuarios', 'DELETE FROM usuarios']
      .map((p) => { const i = c.indexOf(p); return i < 0 ? Infinity : i; }));
    assert.ok(guarda > 0 && guarda < escrita,
      'conferir depois de gravar não serve para nada');
  });
}

test('a trava olha o ALVO, deixa passar o administrador e registra a tentativa', () => {
  const g = corpoDaRota('async function barrarMexerEmAdmin(req, res, oque)');
  assert.match(g, /SELECT acesso_total FROM usuarios WHERE id = \$1/);
  assert.match(g, /if \(!alvo\.rows\[0\] \|\| !alvo\.rows\[0\]\.acesso_total \|\| req\.usuario\.acesso_total\) return false;/);
  assert.match(g, /anotar\('mexer-em-admin', req/);
  assert.match(g, /res\.status\(403\)/);
  assert.match(g, /return true;/);
});

test('a trava é usada nas três rotas e em nenhuma a menos', () => {
  const usos = [...fonte.matchAll(/await barrarMexerEmAdmin\(/g)].length;
  assert.equal(usos, 3);
});

test('o tipo do evento existe no catálogo do guardião', () => {
  // Evento que não está no catálogo é engolido em silêncio.
  const guardiao = readFileSync(new URL('../src/guardiao.js', import.meta.url), 'utf8');
  assert.match(guardiao, /'mexer-em-admin':/);
});

test('definir-senha continua só para acesso total', () => {
  // Essa já era a regra mais dura, e tem de continuar sendo.
  assert.match(corpoDaRota("rotasUsuarios.post('/usuarios/:id/definir-senha'"),
    /if \(!req\.usuario\.acesso_total\) return res\.status\(403\)/);
});

test('o PUT de edição não perdeu a conferência que já tinha', () => {
  const c = corpoDaRota("rotasUsuarios.put('/usuarios/:id'");
  assert.match(c, /Só quem tem acesso total pode editar um usuário com acesso total/);
  assert.match(c, /tentou mudar as próprias permissões/);
});

test('ninguém se desativa sozinho', () => {
  assert.match(corpoDaRota("rotasUsuarios.post('/usuarios/:id/ativo'"),
    /Você não pode desativar a si mesma\(o\)/);
});
