// Avisos para o cliente: documento aprovado ou recusado, mudança no USCIS e parcela chegando.
// Cada aviso fica guardado no processo (`avisosCliente`) e aparece no Portal do Cliente; se o
// e-mail do escritório estiver configurado (SMTP_*), também sai por e-mail. O que é avisado e
// com quanto tempo de antecedência fica em Configurações → Regras → Portal do cliente.
import { Router } from 'express';
import { query } from './db.js';
import { ler, gravar } from './armazenamento.js';
import { obterRegras } from './regras.js';
import { enviarEmail, emailConfigurado } from './email.js';
import { exigirLogin } from './auth.js';
import { podeGravar } from './permissoes.js';
import { limparTexto } from './sanitizar.js';

const K_PROCESSOS = 'legalway-processos-documentacao-v1';
const K_FINANCEIRO = 'legalway-financeiro-v1';
const QUEM = 'automação';
const uid = (p) => p + Date.now() + Math.floor(Math.random() * 1000);
const hoje = () => new Date().toISOString().slice(0, 10);
const fmt = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
const MAX_AVISOS = 40;

async function bloco(chave, padrao = []) { const r = await ler(chave); return { valor: r ? r.valor : padrao, versao: r ? r.versao : null }; }
async function acessoDoProcesso(processoId) {
  const { rows } = await query('SELECT nome, email, ativo FROM portal_clientes WHERE processo_id = $1', [processoId]);
  return rows[0] || null;
}

// Guarda o aviso no processo e manda por e-mail (quando dá). Não grava sozinho: quem chama grava.
export async function montarAviso(p, { tipo, titulo, texto }) {
  p.avisosCliente = p.avisosCliente || [];
  const aviso = { id: uid('av'), tipo, titulo, texto, quando: new Date().toISOString(), lido: false, email: null };
  p.avisosCliente.unshift(aviso);
  if (p.avisosCliente.length > MAX_AVISOS) p.avisosCliente.length = MAX_AVISOS;
  try {
    const acesso = await acessoDoProcesso(p.id);
    if (acesso && acesso.ativo && acesso.email) {
      const R = await obterRegras();
      const emp = R.empresa || {};
      const link = (process.env.URL_PUBLICA || '').replace(/\/$/, '') + '/portal-cliente.html';
      const r = await enviarEmail({
        para: acesso.email,
        assunto: `${emp.nome || 'Seu processo'} — ${titulo}`,
        texto: `Olá, ${(p.clienteNome || '').split(' ')[0]}!\n\n${texto}\n\nVocê pode acompanhar tudo no portal: ${link}\n\n${emp.nome || ''}${emp.telefone ? ' · ' + emp.telefone : ''}`,
      });
      aviso.email = r.enviado ? 'enviado' : 'não configurado';
    }
  } catch (e) { aviso.email = 'falhou: ' + e.message; }
  return aviso;
}

// Chamado pelo uscis.js quando o status do caso muda
export async function avisarClienteUscis(p, statusAnterior) {
  const R = await obterRegras();
  const cfg = (R.portal && R.portal.avisarCliente) || {};
  if (cfg.statusUscis === false || (R.portal && R.portal.mostrarUscis === false)) return;
  await montarAviso(p, {
    tipo: 'uscis',
    titulo: 'Seu caso teve atualização no USCIS',
    texto: `O USCIS atualizou a situação do seu caso: “${p.uscis.status}”.${statusAnterior ? ` (antes: “${statusAnterior}”)` : ''} Entre no portal para ver o que isso significa e o que fazer agora.`,
  });
}

// Uma vez por dia: parcelas chegando para quem tem acesso ao portal
export async function avisosDeParcela(log) {
  const R = await obterRegras();
  const cfg = (R.portal && R.portal.avisarCliente) || {};
  if (cfg.parcelaVencendo === false || (R.portal && R.portal.mostrarFinanceiro === false)) return;
  const dias = Number(cfg.diasAntesParcela) || 5;
  const { rows } = await query('SELECT processo_id FROM portal_clientes WHERE ativo = true');
  if (!rows.length) return;
  const ids = new Set(rows.map(r => r.processo_id));
  const { valor: processos, versao } = await bloco(K_PROCESSOS);
  const { valor: contas } = await bloco(K_FINANCEIRO);
  const limite = new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10);
  let n = 0;
  for (const p of processos.filter(x => ids.has(x.id))) {
    const minhas = contas.filter(c => (p.contratoId && c.contratoId === p.contratoId) || (!p.contratoId && c.clienteNome === p.clienteNome));
    for (const c of minhas) {
      if (c.status === 'Pago' || !c.vencimento) continue;
      if (c.vencimento > limite) continue;
      const chave = 'parcela:' + (c.id || c.descricao + c.vencimento);
      if ((p.avisosCliente || []).some(a => a.ref === chave)) continue;
      const atrasada = c.vencimento < hoje();
      const aviso = await montarAviso(p, {
        tipo: 'parcela',
        titulo: atrasada ? 'Parcela em aberto' : 'Parcela chegando',
        texto: `${c.descricao || 'Parcela'} de US$ ${Number(c.valor || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${atrasada ? 'venceu em' : 'vence em'} ${fmt(c.vencimento)}. Qualquer dúvida sobre o pagamento, fale com o escritório.`,
      });
      aviso.ref = chave; n++;
    }
  }
  if (n) { await gravar(K_PROCESSOS, processos, versao, QUEM); log.push(`avisos ao cliente: ${n} sobre parcelas`); }
}

export const rotasAvisosCliente = Router();

// A equipe avisa o cliente sobre um documento (aprovado / precisa refazer) ou manda um recado
rotasAvisosCliente.post('/avisos-cliente/:processoId', exigirLogin, async (req, res, next) => {
  try {
    if (!podeGravar(req.usuario, K_PROCESSOS)) return res.status(403).json({ erro: 'Sem permissão em Documentação.' });
    const tipo = String(req.body?.tipo || 'recado');
    const titulo = String(limparTexto(req.body?.titulo || '')).slice(0, 120);
    const texto = String(limparTexto(req.body?.texto || '')).slice(0, 1200);
    if (!titulo || !texto) return res.status(400).json({ erro: 'Informe título e texto do aviso.' });
    const R = await obterRegras();
    const cfg = (R.portal && R.portal.avisarCliente) || {};
    if (tipo === 'documento-aprovado' && cfg.documentoAprovado === false) return res.json({ ok: true, ignorado: true });
    if (tipo === 'documento-recusado' && cfg.documentoRecusado === false) return res.json({ ok: true, ignorado: true });
    const { valor: processos, versao } = await bloco(K_PROCESSOS);
    const p = processos.find(x => x.id === String(req.params.processoId));
    if (!p) return res.status(404).json({ erro: 'Processo não encontrado.' });
    const aviso = await montarAviso(p, { tipo, titulo, texto });
    await gravar(K_PROCESSOS, processos, versao, req.usuario.nome);
    res.json({ ok: true, email: aviso.email, emailConfigurado: emailConfigurado() });
  } catch (e) { next(e); }
});
