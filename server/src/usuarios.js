// Gestão de usuários (tela usuarios.html). Senha nunca sai daqui — só "resetar" gera uma temporária nova.
import { Router } from 'express';
import { anotar } from './guardiao.js';
import { query } from './db.js';
import { exigirLogin, gerarSenhaTemporaria, hashSenha, permissoesTotal } from './auth.js';

const podeVer = (u) => u.acesso_total || ['visualizar', 'editar'].includes(u.permissoes?.usuarios);
const podeEditar = (u) => u.acesso_total || u.permissoes?.usuarios === 'editar';

// O que a tela recebe (sem senha_hash, nomes no formato que as telas já usam)
const publico = (u) => ({
  id: u.id, nome: u.nome, usuario: u.usuario, cargo: u.cargo, papel: u.papel,
  acessoTotal: u.acesso_total, permissoes: u.permissoes, ativo: u.ativo, trocarSenha: u.trocar_senha,
  criadoEm: u.criado_em,
});

function validar(body) {
  const nome = String(body?.nome || '').trim();
  const usuario = String(body?.usuario || '').trim().toLowerCase();
  if (!nome || !usuario) return { erro: 'Preencha nome e login.' };
  if (!/^[a-z0-9._-]{2,40}$/.test(usuario)) return { erro: 'Login: use só letras minúsculas, números, ponto, traço ou underline (2 a 40 caracteres).' };
  const acessoTotal = !!body.acessoTotal;
  const permissoes = acessoTotal ? permissoesTotal() : (body.permissoes && typeof body.permissoes === 'object' ? body.permissoes : {});
  for (const v of Object.values(permissoes)) {
    if (!['nenhum', 'visualizar', 'editar'].includes(v)) return { erro: 'Permissão inválida.' };
  }
  return { dados: { nome, usuario, cargo: String(body.cargo || '').trim(), papel: String(body.papel || 'socio'), acessoTotal, permissoes } };
}

export const rotasUsuarios = Router();
rotasUsuarios.use(exigirLogin);

// Lista enxuta pra qualquer pessoa logada (chat, filtros por vendedor etc.)
rotasUsuarios.get('/equipe', async (req, res, next) => {
  try {
    const { rows } = await query("SELECT id, nome, cargo, papel, ativo FROM usuarios WHERE id <> 'sistema' ORDER BY id");
    res.json({ equipe: rows });
  } catch (e) { next(e); }
});

rotasUsuarios.get('/usuarios', async (req, res, next) => {
  try {
    if (!podeVer(req.usuario)) return res.status(403).json({ erro: 'Sem permissão pra ver usuários.' });
    const { rows } = await query("SELECT * FROM usuarios WHERE id <> 'sistema' ORDER BY criado_em, id");
    res.json({ usuarios: rows.map(publico) });
  } catch (e) { next(e); }
});

// Acesso total é o poder máximo do sistema (vê tudo, baixa backup, define senhas). Só quem já tem
// acesso total pode conceder, tirar ou mexer em quem tem — senão quem administra usuários viraria
// administrador sozinho.
const soAdminPodeMexer = (req, alvoAcessoTotal) =>
  (alvoAcessoTotal || String(req.body?.papel) === 'socio_total') && !req.usuario.acesso_total;

rotasUsuarios.post('/usuarios', async (req, res, next) => {
  try {
    if (!podeEditar(req.usuario)) return res.status(403).json({ erro: 'Sem permissão pra criar usuários.' });
    const { erro, dados } = validar(req.body);
    if (erro) return res.status(400).json({ erro });
    if (dados.acessoTotal && !req.usuario.acesso_total) { anotar('virar-admin', req, 'tentou criar admin: ' + (dados.usuario || '')); return res.status(403).json({ erro: 'Só quem tem acesso total pode criar um usuário com acesso total.' }); }
    const existe = await query('SELECT 1 FROM usuarios WHERE usuario = $1', [dados.usuario]);
    if (existe.rows[0]) return res.status(409).json({ erro: 'Já existe um usuário com esse login.' });
    const senhaTemporaria = gerarSenhaTemporaria();
    const id = 'u' + Date.now();
    const { rows } = await query(
      `INSERT INTO usuarios (id, nome, usuario, senha_hash, cargo, papel, acesso_total, permissoes, trocar_senha)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`,
      [id, dados.nome, dados.usuario, await hashSenha(senhaTemporaria), dados.cargo, dados.papel, dados.acessoTotal, JSON.stringify(dados.permissoes)]
    );
    res.status(201).json({ usuario: publico(rows[0]), senhaTemporaria });
  } catch (e) { next(e); }
});

rotasUsuarios.put('/usuarios/:id', async (req, res, next) => {
  try {
    if (!podeEditar(req.usuario)) return res.status(403).json({ erro: 'Sem permissão pra editar usuários.' });
    const { erro, dados } = validar(req.body);
    if (erro) return res.status(400).json({ erro });
    const alvo = await query('SELECT acesso_total FROM usuarios WHERE id = $1', [req.params.id]);
    if (!alvo.rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (!req.usuario.acesso_total) {
      if (alvo.rows[0].acesso_total) { anotar('mexer-em-admin', req, 'alvo: ' + alvo.rows[0].usuario); return res.status(403).json({ erro: 'Só quem tem acesso total pode editar um usuário com acesso total.' }); }
      if (dados.acessoTotal) { anotar('virar-admin', req, 'tentou dar acesso total a ' + req.params.id); return res.status(403).json({ erro: 'Só quem tem acesso total pode conceder acesso total.' }); }
      if (req.params.id === req.usuario.id) { anotar('permissao-propria', req, 'tentou mudar as próprias permissões'); return res.status(403).json({ erro: 'Você não pode alterar as próprias permissões. Peça a um administrador.' }); }
    }
    const existe = await query('SELECT 1 FROM usuarios WHERE usuario = $1 AND id <> $2', [dados.usuario, req.params.id]);
    if (existe.rows[0]) return res.status(409).json({ erro: 'Já existe um usuário com esse login.' });
    const { rows } = await query(
      `UPDATE usuarios SET nome=$1, usuario=$2, cargo=$3, papel=$4, acesso_total=$5, permissoes=$6, atualizado_em=now()
       WHERE id=$7 RETURNING *`,
      [dados.nome, dados.usuario, dados.cargo, dados.papel, dados.acessoTotal, JSON.stringify(dados.permissoes), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json({ usuario: publico(rows[0]) });
  } catch (e) { next(e); }
});

// Ativar/desativar. Desativar derruba as sessões da pessoa na hora.
rotasUsuarios.post('/usuarios/:id/ativo', async (req, res, next) => {
  try {
    if (!podeEditar(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
    if (req.params.id === req.usuario.id && req.body?.ativo === false) return res.status(400).json({ erro: 'Você não pode desativar a si mesma(o).' });
    const ativo = !!req.body?.ativo;
    const { rows } = await query('UPDATE usuarios SET ativo=$1, atualizado_em=now() WHERE id=$2 RETURNING *', [ativo, req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (!ativo) await query('DELETE FROM sessoes WHERE usuario_id = $1', [req.params.id]);
    res.json({ usuario: publico(rows[0]) });
  } catch (e) { next(e); }
});

// Gera senha temporária nova; a pessoa é obrigada a trocar no próximo login
rotasUsuarios.post('/usuarios/:id/resetar-senha', async (req, res, next) => {
  try {
    if (!podeEditar(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
    const senhaTemporaria = gerarSenhaTemporaria();
    const { rows } = await query(
      'UPDATE usuarios SET senha_hash=$1, trocar_senha=true, atualizado_em=now() WHERE id=$2 RETURNING id',
      [await hashSenha(senhaTemporaria), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    await query('DELETE FROM sessoes WHERE usuario_id = $1', [req.params.id]);
    res.json({ senhaTemporaria });
  } catch (e) { next(e); }
});

// Excluir de vez: só usuário inativo, que não seja você, e sem histórico no chat (senão mantém inativo, pra não sumir conversa)
rotasUsuarios.delete('/usuarios/:id', async (req, res, next) => {
  try {
    if (!podeEditar(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
    const id = req.params.id;
    if (id === req.usuario.id || id === 'sistema') return res.status(400).json({ erro: 'Esse usuário não pode ser excluído.' });
    const u = await query('SELECT ativo FROM usuarios WHERE id = $1', [id]);
    if (!u.rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (u.rows[0].ativo) return res.status(400).json({ erro: 'Desative o usuário antes de excluir.' });
    const msgs = await query('SELECT count(*)::int AS n FROM chat_mensagens WHERE de_id = $1 OR para_id = $1', [id]);
    if (msgs.rows[0].n > 0) return res.status(409).json({ erro: `Esse usuário tem ${msgs.rows[0].n} mensagem(ns) no chat. Pra não apagar o histórico, ele fica como inativo.` });
    await query('DELETE FROM usuarios WHERE id = $1', [id]); // sessões e leituras do chat caem em cascata
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Administrador define uma senha conhecida pra pessoa (ex.: período de testes). Fica registrado na auditoria.
rotasUsuarios.post('/usuarios/:id/definir-senha', async (req, res, next) => {
  try {
    if (!req.usuario.acesso_total) return res.status(403).json({ erro: 'Só quem tem acesso total pode definir senhas.' });
    const senha = String(req.body?.senha || '');
    const obrigarTroca = req.body?.trocarSenha === true; // senha provisória: a pessoa cria a dela no próximo login
    if (senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });
    const { rows } = await query(
      'UPDATE usuarios SET senha_hash=$1, trocar_senha=$2, atualizado_em=now() WHERE id=$3 AND id <> \'sistema\' RETURNING id, nome',
      [await hashSenha(senha), obrigarTroca, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (req.params.id !== req.usuario.id) await query('DELETE FROM sessoes WHERE usuario_id = $1', [req.params.id]);
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1, $2, $3, $4, $5)', [req.usuario.nome, 'confirmacao', req.params.id, 'alterado', `Senha definida pelo administrador para ${rows[0].nome}${obrigarTroca ? ' (provisória — troca obrigatória no próximo login)' : ''}`]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
