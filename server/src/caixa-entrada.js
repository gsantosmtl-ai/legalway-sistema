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
import { ler, gravar } from './armazenamento.js';
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

// Montado em '/api/caixa', nunca no '/api' pelado. O motivo é um erro que
// custou caro: com `rotasCaixaEntrada.use(exigirLogin)` dentro de um router
// montado em '/api', TODA requisição que chega em /api passa por aqui — e
// morria com 401 antes de chegar nas rotas montadas depois. Entre elas o
// portal do cliente, que por definição não tem sessão de funcionário. O portal
// ficou fechado para os clientes de 10/10 até hoje, e ninguém viu porque quem
// testava estava logado no sistema na mesma aba.
export const rotasCaixaEntrada = Router();
rotasCaixaEntrada.use(exigirLogin);

// Lista das conversas. Todo mundo vê todas — foi a decisão do escritório.
rotasCaixaEntrada.get('/conversas', async (req, res, next) => {
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
rotasCaixaEntrada.get('/conversa/:id', async (req, res, next) => {
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
rotasCaixaEntrada.post('/assumir/:id', async (req, res, next) => {
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
rotasCaixaEntrada.post('/responder/:id', async (req, res, next) => {
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

// Renomear o lead. O nome vem do perfil do WhatsApp e às vezes é um emoji, um
// apelido ou nada ("♥️"). O vendedor precisa poder arrumar — e o nome vive em
// três blocos separados, então arrumar num só deixaria os outros errados.
rotasCaixaEntrada.post('/renomear', async (req, res, next) => {
  try {
    const novo = String(req.body?.nome || '').trim().slice(0, 120);
    const tel  = String(req.body?.telefone || '').replace(/\D/g, '');
    const id   = String(req.body?.id || '');
    if (!novo) return res.status(400).json({ erro: 'Escreva o nome.' });
    if (!tel && !id) return res.status(400).json({ erro: 'Preciso do telefone ou do id.' });

    const fim = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : ''; };
    const alvo = fim(tel);
    const marca = { tipo: 'Sistema', quando: new Date().toISOString(),
      texto: `Nome corrigido por ${req.usuario.nome}: "${novo}"` };

    let tocados = 0;
    for (const chave of ['legalway-leads-v1', 'legalway-funil-v1', 'legalway-sdr-v1']) {
      const atual = await ler(chave);
      const itens = Array.isArray(atual?.valor) ? atual.valor
        : (atual?.valor ? JSON.parse(atual.valor) : []);
      if (!Array.isArray(itens) || !itens.length) continue;
      let mudou = false;
      for (const it of itens) {
        if (!it) continue;
        const bate = (id && it.id === id) || (alvo && fim(it.telefone) === alvo);
        if (!bate || it.nome === novo) continue;
        it.nomeAnterior = it.nomeAnterior || it.nome;
        it.nome = novo;
        it.historico = it.historico || [];
        it.historico.push({ ...marca });
        mudou = true; tocados++;
      }
      if (mudou) await gravar(chave, itens, atual ? atual.versao : null, req.usuario.nome);
    }
    if (!tocados) return res.status(404).json({ erro: 'Não achei esse lead para renomear.' });
    res.json({ ok: true, registros: tocados, nome: novo });
  } catch (e) { next(e); }
});
