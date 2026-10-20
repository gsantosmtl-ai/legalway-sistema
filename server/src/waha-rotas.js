// Conectar os números dos setores ao WAHA, pela tela.
//
// Ler o QR de uma sessão dá acesso ao WhatsApp daquele número: quem consegue
// parear consegue ler e escrever como o escritório. Por isso tudo aqui é só
// para quem tem acesso total, e cada ação fica na auditoria.
//
// A tela nunca fala com o WAHA direto. Se falasse, a chave do WAHA teria de
// estar no navegador — e ela é do servidor, igual às outras.

import { Router } from 'express';
import { exigirLogin } from './auth.js';
import { query } from './db.js';
import { anotar } from './guardiao.js';
import {
  wahaConfigurado, listarSessoes, statusSessao, numeroDaSessao,
  criarSessao, pararSessao, reiniciarSessao, removerSessao, qrDaSessao,
  enviarTexto, sessaoDoSetor,
} from './waha.js';
import { obterRegras } from './regras.js';
import { podeGravar } from './permissoes.js';

const soAdmin = (req, res, next) => {
  if (req.usuario.acesso_total) return next();
  anotar('waha-negado', req, 'tentou mexer nas sessões do WhatsApp dos setores');
  return res.status(403).json({ erro: 'Só quem tem acesso total pode conectar os números.' });
};
const guard = [exigirLogin, soAdmin];

const registrar = (req, acao, resumo) =>
  query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
    [req.usuario.nome, 'waha', req.params.sessao || null, acao, resumo]).catch(() => {});

// O nome da sessão vai na URL e depois no caminho do WAHA. Sem esta checagem,
// um nome com "../" ou "/" passearia pela API do WAHA.
const nomeValido = (s) => /^[A-Za-z0-9_-]{1,60}$/.test(String(s || ''));
const checarNome = (req, res, next) =>
  nomeValido(req.params.sessao) ? next()
    : res.status(400).json({ erro: 'Nome de sessão inválido. Use letras, números, hífen ou _.' });

export const rotasWaha = Router();

/**
 * Mandar UMA mensagem pelo número de um setor.
 *
 * A cobrança sai do número do Financeiro, não do celular de quem está
 * cobrando. Quem fala com o cliente é o escritório.
 *
 * Diferente das demais rotas deste arquivo: estas mexem na conexão e por isso
 * são só de acesso total; esta aqui é trabalho do dia e basta ter permissão no
 * módulo do setor. Toda mensagem fica na auditoria com quem mandou e para
 * quem — mensagem enviada não tem como voltar atrás.
 */
rotasWaha.post('/waha/enviar', exigirLogin, async (req, res, next) => {
  try {
    const setor = String(req.body?.setor || '').trim();
    const telefone = String(req.body?.telefone || '').replace(/\D/g, '');
    const texto = String(req.body?.texto || '').trim();

    const MODULO = { financeiro: 'legalway-financeiro-v1', documentacao: 'legalway-processos-documentacao-v1', comercial: 'legalway-contratos-v1' };
    if (!MODULO[setor]) return res.status(400).json({ erro: 'Setor desconhecido.' });
    if (!(req.usuario.acesso_total || podeGravar(req.usuario, MODULO[setor]))) {
      anotar('waha-negado', req, `tentou mandar mensagem pelo número de ${setor}`);
      return res.status(403).json({ erro: 'Sem permissão nesse setor.' });
    }
    if (telefone.length < 8) return res.status(400).json({ erro: 'Telefone inválido.' });
    if (!texto) return res.status(400).json({ erro: 'Mensagem vazia.' });
    if (!wahaConfigurado()) return res.status(503).json({ erro: 'O WhatsApp dos setores não está configurado neste servidor.' });

    const regras = await obterRegras();
    const sessao = sessaoDoSetor(regras, setor);
    if (!sessao) return res.status(409).json({ erro: `O setor ${setor} ainda não tem número conectado.` });

    const r = await enviarTexto(sessao, telefone, texto);
    query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, 'waha', telefone, r.ok ? 'mensagem enviada' : 'envio falhou',
       `${setor} → ${telefone}: ${texto.slice(0, 120)}`]).catch(() => {});
    if (!r.ok) return res.status(502).json({ erro: r.motivo || 'O WhatsApp não aceitou a mensagem.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** O WAHA está configurado neste servidor? E quais sessões existem? */
rotasWaha.get('/waha/sessoes', guard, async (req, res, next) => {
  try {
    if (!wahaConfigurado()) {
      return res.json({ configurado: false, sessoes: [],
        aviso: 'Faltam WAHA_URL e WAHA_API_KEY nas variáveis do servidor.' });
    }
    const r = await listarSessoes();
    if (!r.ok) return res.status(502).json({ configurado: true, erro: r.motivo, sessoes: [] });
    res.json({ configurado: true, sessoes: r.sessoes });
  } catch (e) { next(e); }
});

/** Estado de uma sessão + qual número está conectado nela. */
rotasWaha.get('/waha/sessoes/:sessao', guard, checarNome, async (req, res, next) => {
  try {
    const st = await statusSessao(req.params.sessao);
    if (!st.ok) return res.json({ estado: 'não existe', pronta: false, motivo: st.motivo });
    const me = st.pronta ? await numeroDaSessao(req.params.sessao) : { ok: false };
    res.json({ estado: st.estado, pronta: st.pronta, numero: me.ok ? me.numero : '', nome: me.ok ? me.nome : '' });
  } catch (e) { next(e); }
});

/** Cria/inicia a sessão — primeiro passo para conectar um número. */
rotasWaha.post('/waha/sessoes/:sessao', guard, checarNome, async (req, res, next) => {
  try {
    const r = await criarSessao(req.params.sessao);
    if (!r.ok) return res.status(502).json({ erro: r.motivo });
    await registrar(req, 'alterado', `Sessão "${req.params.sessao}" do WhatsApp iniciada`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** O QR para ler no celular. Expira em segundos: a tela repete a chamada. */
rotasWaha.get('/waha/sessoes/:sessao/qr', guard, checarNome, async (req, res, next) => {
  try {
    const r = await qrDaSessao(req.params.sessao);
    if (!r.ok) return res.status(r.status === 404 ? 404 : 502).json({ erro: r.motivo });
    res.json({ imagem: r.imagem });
  } catch (e) { next(e); }
});

rotasWaha.post('/waha/sessoes/:sessao/reiniciar', guard, checarNome, async (req, res, next) => {
  try {
    const r = await reiniciarSessao(req.params.sessao);
    if (!r.ok) return res.status(502).json({ erro: r.motivo });
    await registrar(req, 'alterado', `Sessão "${req.params.sessao}" reiniciada`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rotasWaha.post('/waha/sessoes/:sessao/parar', guard, checarNome, async (req, res, next) => {
  try {
    const r = await pararSessao(req.params.sessao);
    if (!r.ok) return res.status(502).json({ erro: r.motivo });
    await registrar(req, 'alterado', `Sessão "${req.params.sessao}" parada`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** Desconecta de vez: o número sai e o QR terá de ser lido outra vez. */
rotasWaha.delete('/waha/sessoes/:sessao', guard, checarNome, async (req, res, next) => {
  try {
    const r = await removerSessao(req.params.sessao);
    if (!r.ok) return res.status(502).json({ erro: r.motivo });
    await registrar(req, 'excluido', `Sessão "${req.params.sessao}" desconectada do WhatsApp`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// O catálogo de gatilhos, para a tela de Avisos automáticos se montar sozinha.
// Vive aqui porque o módulo dos avisos não tem router próprio e porque é a
// mesma família de coisa: o que o escritório configura para falar com o cliente.
// ---------------------------------------------------------------------------
import { GATILHOS } from './avisos-automaticos.js';

rotasWaha.get('/avisos/gatilhos', exigirLogin, (req, res) => {
  res.json({
    gatilhos: Object.entries(GATILHOS).map(([key, g]) => ({
      key, nome: g.nome, sobre: g.sobre, quando: g.quando,
      ajuda: g.ajuda, chaves: g.chaves, padrao: g.padrao, setorSugerido: g.setorSugerido,
      // `extras` são os campos próprios do gatilho (ex.: qual prazo), para a
      // tela se montar sozinha. `exigeEnvioAutomatico` faz ela avisar que o
      // aviso não roda no modo manual.
      extras: g.extras || [], exigeEnvioAutomatico: !!g.exigeEnvioAutomatico,
    })),
  });
});
