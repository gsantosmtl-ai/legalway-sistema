// As rotas do aviso no celular. Três coisas: pegar a chave pública, ligar o
// aviso neste aparelho, desligar. Mais um teste, para a pessoa ver chegar.
//
// Tudo exige login: a assinatura fica amarrada a QUEM está logado, e é por
// isso que o aviso sabe para quem ir.
import { Router } from 'express';
import { exigirLogin } from './auth.js';
import { query } from './db.js';
import { chavePublica, avisarPessoaNoCelular } from './push.js';
import { limparTexto } from './sanitizar.js';
import { anotar } from './guardiao.js';

export const rotasPush = Router();

rotasPush.get('/push/chave', exigirLogin, async (req, res, next) => {
  try { res.json({ chave: await chavePublica() }); } catch (e) { next(e); }
});

/** Quais aparelhos desta pessoa já estão ligados — a tela usa para saber o que mostrar. */
rotasPush.get('/push/meus', exigirLogin, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT endpoint, aparelho, canais, criado_em, ultimo_ok FROM push_assinaturas WHERE usuario_id = $1 ORDER BY criado_em',
      [req.usuario.id]);
    // O endpoint é longo e identifica o aparelho; devolvo só o fim, que basta
    // para a tela saber se ESTE navegador já está na lista.
    res.json(rows.map((r) => ({
      fim: r.endpoint.slice(-24), aparelho: r.aparelho,
      canais: r.canais ? r.canais.split(',') : [],
      desde: r.criado_em, ultimoOk: r.ultimo_ok,
    })));
  } catch (e) { next(e); }
});

rotasPush.post('/push/assinar', exigirLogin, async (req, res, next) => {
  try {
    const a = req.body || {};
    const endpoint = String(a.endpoint || '');
    const p256dh = String(a.p256dh || '');
    const auth = String(a.auth || '');
    if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) {
      return res.status(400).json({ erro: 'Assinatura incompleta.' });
    }
    const aparelho = String(limparTexto(a.aparelho || '')).slice(0, 60);
    // Só canais que existem de verdade. Lista vazia = recebe tudo, que é o
    // padrão seguro: errar para mais incomoda, errar para menos perde lead.
    const VALIDOS = ['vendas', 'documentacao', 'financeiro'];
    const canais = (Array.isArray(a.canais) ? a.canais : [])
      .map((c) => String(c)).filter((c) => VALIDOS.includes(c));
    // O mesmo aparelho pode trocar de dono (celular emprestado, pessoa que
    // saiu): o endpoint manda, e o dono passa a ser quem acabou de ligar.
    await query(
      `INSERT INTO push_assinaturas (endpoint, usuario_id, p256dh, auth, aparelho, canais)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE
         SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh,
             auth = EXCLUDED.auth, aparelho = EXCLUDED.aparelho,
             canais = EXCLUDED.canais, falhas = 0`,
      [endpoint, req.usuario.id, p256dh, auth, aparelho || null, canais.join(',')]);
    anotar('push-ligado', req, `ligou o aviso no celular (${aparelho || 'aparelho sem nome'})`
      + ` para ${canais.length ? canais.join(', ') : 'todos os departamentos'}`);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

rotasPush.post('/push/sair', exigirLogin, async (req, res, next) => {
  try {
    const endpoint = String((req.body || {}).endpoint || '');
    if (!endpoint) return res.status(400).json({ erro: 'Falta o endereço do aparelho.' });
    // Só apaga o próprio: ninguém desliga o aviso de outra pessoa.
    await query('DELETE FROM push_assinaturas WHERE endpoint = $1 AND usuario_id = $2',
      [endpoint, req.usuario.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rotasPush.post('/push/teste', exigirLogin, async (req, res, next) => {
  try {
    const r = await avisarPessoaNoCelular(req.usuario.id, {
      titulo: 'Deu certo 🎉',
      texto: 'É assim que o aviso de lead novo vai chegar neste celular.',
      url: '/entrada-leads.html',
    });
    res.json(r);
  } catch (e) { next(e); }
});
