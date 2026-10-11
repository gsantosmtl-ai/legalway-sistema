// Caixa de entrada do WhatsApp: onde o lead chega, todo mundo vê, e o vendedor
// assume.
//
// O desenho combinado com o escritório:
//   · a conversa é de todos — qualquer vendedor enxerga tudo
//   · o sistema só manda UMA mensagem: a de apresentação, dizendo quem vai
//     chamar e de qual número
//   · a condução acontece no WhatsApp pessoal do vendedor
//   · mas a caixa continua viva: se o lead responder no número oficial, a
//     mensagem aparece aqui e não se perde
//
// Assumir o lead é o gatilho. Daqui em diante a mensagem sai sozinha, venha o
// clique de onde vier — desta tela, da Entrada de Leads ou do funil.
import { Router } from 'express';
import { exigirLogin } from './auth.js';
import { ler } from './armazenamento.js';
import { atualizarLead, CHAVE_LEADS } from './leads-entrada.js';
import { enviarTexto, whatsappConfigurado, dentroDaJanela } from './whatsapp.js';
import { obterRegras } from './regras.js';
import { avisarCanal } from './chat.js';

const JANELA_H = 24;

const lista = async () => {
  const a = await ler(CHAVE_LEADS);
  const v = Array.isArray(a?.valor) ? a.valor : (a?.valor ? JSON.parse(a.valor) : []);
  return Array.isArray(v) ? v : [];
};

const horasRestantes = (lead) => {
  if (!lead.whatsappUltimaEntrada) return 0;
  const resta = JANELA_H * 3600e3 - (Date.now() - new Date(lead.whatsappUltimaEntrada).getTime());
  return Math.max(0, Math.round(resta / 3600e3 * 10) / 10);
};

// Monta a mensagem de apresentação a partir do modelo das Regras.
export async function mensagemDeApresentacao(lead, vendedor) {
  const R = await obterRegras();
  const disp = Array.isArray(R.agenda?.disponibilidade) ? R.agenda.disponibilidade : [];
  const linha = disp.find(d => String(d.vendedor || '').trim().toLowerCase() === String(vendedor).toLowerCase()
    && String(d.numero || '').trim());
  const numero = linha ? String(linha.numero).trim() : '';
  const modelo = R.leads?.mensagemPrimeiroContato || '';
  const texto = modelo
    .replace(/\{cliente\}/g, (lead.nome || '').split(' ')[0] || '')
    .replace(/\{empresa\}/g, R.empresa?.nome || '')
    .replace(/\{servico\}/g, lead.servico || 'seu processo')
    .replace(/\{vendedor\}/g, vendedor)
    .replace(/\{numero\}/g, numero || '(número não cadastrado)')
    .replace(/\{quando\}/g, 'em breve');
  return { texto, numero };
}

export const rotasCaixaEntrada = Router();
rotasCaixaEntrada.use(exigirLogin);

// Lista das conversas. Todo mundo vê todas — foi a decisão do escritório.
rotasCaixaEntrada.get('/caixa/conversas', async (req, res, next) => {
  try {
    const leads = await lista();
    const conversas = leads
      .filter(l => l && (l.whatsappUltimaEntrada || (l.origens || []).includes('whatsapp')))
      .map(l => {
        const msgs = (l.historico || []).filter(h => /^Mensagem no WhatsApp:/.test(h.texto || ''));
        const ultima = msgs[msgs.length - 1] || (l.historico || [])[l.historico.length - 1];
        return {
          id: l.id, nome: l.nome, telefone: l.telefone, servico: l.servico || '',
          campanha: l.campanha || '', anuncio: l.anuncioOrigem || null,
          responsavel: l.responsavel || null,
          apresentadoEm: l.mensagemPrimeiroContatoEnviadaEm || null,
          ultimaMensagem: ultima ? String(ultima.texto).replace(/^Mensagem no WhatsApp:\s*/, '').split('\n')[0].slice(0, 120) : '',
          quando: l.whatsappUltimaEntrada || l.entrada,
          horasNaJanela: horasRestantes(l),
          mensagens: msgs.length,
        };
      })
      .sort((a, b) => new Date(b.quando) - new Date(a.quando));
    res.json({ conversas, whatsappLigado: whatsappConfigurado() });
  } catch (e) { next(e); }
});

// A conversa inteira de um lead.
rotasCaixaEntrada.get('/caixa/conversa/:id', async (req, res, next) => {
  try {
    const lead = (await lista()).find(l => l && l.id === req.params.id);
    if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.' });
    res.json({
      lead: {
        id: lead.id, nome: lead.nome, telefone: lead.telefone, email: lead.email,
        servico: lead.servico || '', campanha: lead.campanha || '',
        anuncio: lead.anuncioOrigem || null, origens: lead.origens || [],
        responsavel: lead.responsavel || null, entrada: lead.entrada,
        apresentadoEm: lead.mensagemPrimeiroContatoEnviadaEm || null,
      },
      horasNaJanela: horasRestantes(lead),
      historico: (lead.historico || []).map(h => ({ ...h })),
    });
  } catch (e) { next(e); }
});

// Assumir: o gatilho. Grava o dono e manda a mensagem de apresentação.
rotasCaixaEntrada.post('/caixa/assumir/:id', async (req, res, next) => {
  try {
    const lead = (await lista()).find(l => l && l.id === req.params.id);
    if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.' });

    const vendedor = String(req.body?.vendedor || req.usuario.nome).trim();
    if (lead.responsavel && lead.responsavel !== vendedor) {
      return res.status(409).json({ erro: `Este lead já é de ${lead.responsavel}.` });
    }

    const { texto, numero } = await mensagemDeApresentacao(lead, vendedor);
    let enviada = false, motivo = '';

    if (lead.mensagemPrimeiroContatoEnviadaEm) motivo = 'a apresentação já tinha sido enviada antes';
    else if (!whatsappConfigurado()) motivo = 'o WhatsApp não está configurado neste servidor';
    else if (!lead.telefone) motivo = 'o lead não tem telefone';
    else if (!dentroDaJanela(lead)) motivo = 'passou de 24h desde a última mensagem do cliente — a Meta só permite modelo aprovado';
    else {
      const env = await enviarTexto(lead.telefone, texto);
      enviada = env.ok;
      if (!enviada) motivo = env.motivo;
    }

    const agora = new Date().toISOString();
    await atualizarLead(lead.id, {
      responsavel: vendedor,
      ...(enviada ? { mensagemPrimeiroContatoEnviadaEm: agora } : {}),
      mensagemPrimeiroContato: texto,
    }, enviada
      ? `${vendedor} assumiu o lead. Apresentação enviada no WhatsApp${numero ? ` — vai chamar do ${numero}` : ''}.`
      : `${vendedor} assumiu o lead. A apresentação NÃO saiu automaticamente: ${motivo}.`);

    if (!numero) {
      avisarCanal('vendas', `⚠️ ${vendedor} não tem número cadastrado em Configurações → Regras → Agenda. A apresentação saiu sem dizer de qual número a ligação parte.`).catch(() => {});
    }
    res.json({ ok: true, enviada, motivo, texto, numero });
  } catch (e) { next(e); }
});

// Responder na conversa. Só dentro da janela — fora dela a Meta recusa texto livre.
rotasCaixaEntrada.post('/caixa/responder/:id', async (req, res, next) => {
  try {
    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ erro: 'Escreva alguma coisa.' });
    const lead = (await lista()).find(l => l && l.id === req.params.id);
    if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.' });
    if (!whatsappConfigurado()) return res.status(400).json({ erro: 'WhatsApp não está configurado neste servidor.' });
    if (!dentroDaJanela(lead)) {
      return res.status(400).json({ erro: 'Passaram-se mais de 24h desde a última mensagem desta pessoa. A Meta só permite modelo aprovado fora dessa janela.' });
    }
    const env = await enviarTexto(lead.telefone, texto);
    if (!env.ok) return res.status(502).json({ erro: `Não consegui enviar: ${env.motivo}` });
    await atualizarLead(lead.id, {}, `${req.usuario.nome} respondeu no WhatsApp: ${texto}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
