// Primeiro contato automático: lead novo → escolhe o vendedor disponível → agenda a ligação no
// próximo horário livre dele (hoje, ou no próximo dia em que alguém atende) → avisa no chat.
// Tudo vem das Regras do escritório (Configurações → Regras → Entrada de Leads / Agenda):
//   leads.primeiroContato  — por origem: atribuir vendedor? agendar ligação? mensagem automática?
//   leads.distribuicao     — 'manual' (ninguém é atribuído), 'disponibilidade' (quem atende antes ganha) ou 'rodizio'
//   agenda.disponibilidade — linhas {vendedor, dias:'seg,ter,...,sab,dom', inicio:'09:00', fim:'18:00'}
//   agenda.duracaoLigacaoMin, leads.antecedenciaMin, leads.janelaWhatsappHoras, agenda.fusoHorario
import { ler, gravar } from './armazenamento.js';
import { avisarCanal, avisarPessoa } from './chat.js';
import { obterRegras } from './regras.js';
import { query } from './db.js';

const K = { leads: 'legalway-leads-v1', funil: 'legalway-funil-v1', agenda: 'legalway-agenda-v1', tarefas: 'legalway-tarefas-v1' };
const QUEM = 'automação';
const uid = (p) => p + Date.now() + Math.floor(Math.random() * 1000);
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const pad = (n) => String(n).padStart(2, '0');
const min = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const hhmm = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

async function bloco(chave, padrao = []) { const r = await ler(chave); return { valor: r ? r.valor : padrao, versao: r ? r.versao : null }; }

// "Agora" no fuso do escritório: data (YYYY-MM-DD), minutos do dia, dia da semana
function agoraLocal(tz) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const data = `${p.year}-${p.month}-${p.day}`;
    return { data, minutos: Number(p.hour) * 60 + Number(p.minute), dia: DIAS[new Date(data + 'T12:00:00Z').getUTCDay()] };
  } catch { const d = new Date(); return { data: d.toISOString().slice(0, 10), minutos: d.getUTCHours() * 60 + d.getUTCMinutes(), dia: DIAS[d.getUTCDay()] }; }
}
function somarDias(data, n) { const d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const diaDe = (data) => DIAS[new Date(data + 'T12:00:00Z').getUTCDay()];
const nomeDia = (data) => ({ dom: 'domingo', seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado' })[diaDe(data)];

// Janelas de atendimento de um vendedor num dia (em minutos)
function janelas(disp, vendedor, dia) {
  return disp.filter(d => String(d.vendedor || '').trim().toLowerCase() === vendedor.toLowerCase() && String(d.dias || '').toLowerCase().split(/[,\s;]+/).includes(dia))
    .map(d => ({ ini: min(d.inicio), fim: min(d.fim) })).filter(j => j.fim > j.ini);
}
function ocupado(eventos, vendedor, data, ini, dur) {
  return eventos.some(e => e.vendedor === vendedor && e.data === data && e.status !== 'Cancelada' && (() => { const a = min(e.hora), b = a + (Number(e.duracaoMin) || 30); return ini < b && ini + dur > a; })());
}
// Primeiro horário livre do vendedor a partir de "agora" (+antecedência), olhando até 14 dias
function primeiroHorario(vendedor, disp, eventos, R, agora) {
  const dur = Number(R.agenda.duracaoLigacaoMin) || 15, passo = dur;
  for (let n = 0; n < 14; n++) {
    const data = somarDias(agora.data, n);
    const desde = n === 0 ? agora.minutos + (Number(R.leads.antecedenciaMin) || 0) : 0;
    for (const j of janelas(disp, vendedor, diaDe(data)).sort((a, b) => a.ini - b.ini)) {
      let t = Math.max(j.ini, Math.ceil(desde / passo) * passo);
      for (; t + dur <= j.fim; t += passo) if (!ocupado(eventos, vendedor, data, t, dur)) return { data, hora: hhmm(t), dur, dias: n };
    }
  }
  return null;
}

async function vendedoresAtivos(disp) {
  const nomes = [...new Set(disp.map(d => String(d.vendedor || '').trim()).filter(Boolean))];
  if (!nomes.length) return [];
  const { rows } = await query('SELECT nome FROM usuarios WHERE ativo = true AND id <> $1', ['sistema']);
  const ativos = new Set(rows.map(r => r.nome.toLowerCase()));
  return nomes.filter(n => ativos.has(n.toLowerCase()));
}

export async function primeiroContato(log) {
  const R = await obterRegras();
  const cfgs = Array.isArray(R.leads.primeiroContato) ? R.leads.primeiroContato : [];
  if (!cfgs.length && R.leads.distribuicao === 'manual') return;
  const { valor: leads, versao } = await bloco(K.leads);
  const limite = Date.now() - 7 * 864e5;
  const novos = leads.filter(l => !l.responsavel && !l.primeiroContato && l.entrada && new Date(l.entrada).getTime() > limite);
  if (!novos.length) return;
  const { valor: funil, versao: vF } = await bloco(K.funil);
  const { valor: agenda, versao: vA } = await bloco(K.agenda);
  const { valor: tarefas, versao: vT } = await bloco(K.tarefas);
  const disp = Array.isArray(R.agenda.disponibilidade) ? R.agenda.disponibilidade : [];
  const vendedores = await vendedoresAtivos(disp);
  const tz = R.agenda.fusoHorario || 'America/New_York';
  const agora = agoraLocal(tz);
  const sim = (v) => /^s/i.test(String(v || ''));
  let atribuidos = 0, agendados = 0, avisos = 0, mF = false, mA = false, mT = false;
  const rodizioBase = leads.filter(l => l.primeiroContato && l.primeiroContato.vendedor).length;

  for (const lead of novos) {
    const origem = (lead.origens && lead.origens[0]) || 'outro';
    const cfg = cfgs.find(c => String(c.origem || '').toLowerCase() === origem.toLowerCase()) || {};
    const quando = new Date().toISOString();
    const atribuir = sim(cfg.atribuir) && R.leads.distribuicao !== 'manual' && vendedores.length > 0;
    lead.historico = lead.historico || [];

    if (!atribuir) {
      // fica na Entrada de Leads pro vendedor captar; só avisa a equipe uma vez
      lead.primeiroContato = { status: 'aguardando_vendedor', quando };
      avisarCanal('vendas', `🆕 Novo lead (${origem}): ${lead.nome}${lead.servico ? ' — ' + lead.servico : ''}. Está na Entrada de Leads esperando alguém assumir.`).catch(() => {});
      avisos++; continue;
    }

    // escolha do vendedor: quem tem o horário livre mais cedo; empate → menos ligações no dia (ou rodízio)
    const opcoes = vendedores.map(v => ({ v, slot: primeiroHorario(v, disp, agenda, R, agora) })).filter(o => o.slot);
    if (!opcoes.length) {
      lead.primeiroContato = { status: 'sem_disponibilidade', quando };
      avisarCanal('vendas', `⚠️ Novo lead (${origem}): ${lead.nome}. Nenhum vendedor tem horário configurado — confira Configurações → Regras → Agenda → Disponibilidade.`).catch(() => {});
      avisos++; continue;
    }
    opcoes.sort((a, b) => (a.slot.data + a.slot.hora).localeCompare(b.slot.data + b.slot.hora));
    const melhorDia = opcoes[0].slot.data;
    const noDia = opcoes.filter(o => o.slot.data === melhorDia);
    let escolha;
    if (R.leads.distribuicao === 'rodizio') escolha = noDia[(rodizioBase + atribuidos) % noDia.length];
    else escolha = noDia.map(o => ({ ...o, carga: agenda.filter(e => e.vendedor === o.v && e.data === melhorDia && e.status !== 'Cancelada').length })).sort((a, b) => a.carga - b.carga || (a.slot.hora).localeCompare(b.slot.hora))[0];
    const vend = escolha.v, slot = escolha.slot;

    lead.responsavel = vend; lead.assumidoEm = quando;
    lead.historico.push({ tipo: 'Sistema', quando, texto: `Atribuído automaticamente a ${vend} (${R.leads.distribuicao === 'rodizio' ? 'rodízio' : 'disponibilidade'})` });
    atribuidos++;

    let eventoTxt = '';
    if (sim(cfg.agendarLigacao)) {
      agenda.push({ id: uid('ag'), cliente: lead.nome, telefone: lead.telefone || '', vendedor: vend, data: slot.data, hora: slot.hora, tipo: 'Ligação', duracaoMin: slot.dur, status: 'Agendada', resultado: null, origem: 'Primeiro contato automático', leadId: lead.id, criadoEm: quando });
      eventoTxt = `${slot.dias === 0 ? 'hoje' : slot.dias === 1 ? 'amanhã' : nomeDia(slot.data) + ' ' + slot.data.split('-').reverse().slice(0, 2).join('/')} às ${slot.hora}`;
      lead.historico.push({ tipo: 'Sistema', quando, texto: `Ligação de primeiro contato agendada com ${vend}: ${eventoTxt}` });
      mA = true; agendados++;
    }
    lead.primeiroContato = { status: 'atribuido', quando, vendedor: vend, data: sim(cfg.agendarLigacao) ? slot.data : null, hora: sim(cfg.agendarLigacao) ? slot.hora : null };

    if (!funil.some(f => f.telefone && f.telefone === lead.telefone)) {
      funil.unshift({ id: uid('fl'), nome: lead.nome, telefone: lead.telefone, servico: lead.servico, origem, valorPotencial: 0, vendedor: vend, etapa: 'Lead assumido', entradaEtapa: quando, assumidoEm: quando,
        proximaAcao: sim(cfg.agendarLigacao) ? { tipo: 'Ligação', data: slot.data, hora: slot.hora } : null, saida: null, comercial: { proposta: '', valorNegociado: 0, negociacao: '' },
        historico: [{ tipo: 'Sistema', quando, texto: `Atribuído automaticamente a ${vend} (vindo da Entrada de Leads)${eventoTxt ? ' — ligação ' + eventoTxt : ''}` }] });
      mF = true;
    }

    // mensagem automática: sem WhatsApp oficial conectado vira tarefa com o prazo da janela de 24h
    if (sim(cfg.mensagemAutomatica)) {
      const horas = Number(R.leads.janelaWhatsappHoras) || 24;
      const prazo = new Date(new Date(lead.entrada).getTime() + horas * 3600e3);
      let prazoTxt; try { prazoTxt = prazo.toLocaleString('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { prazoTxt = prazo.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; }
      tarefas.unshift({ id: uid('tf'), titulo: `Responder ${lead.nome} no WhatsApp (janela de ${horas}h termina ${prazoTxt})`, descricao: `Lead ${origem}: ${lead.nome} ${lead.telefone || ''}${lead.servico ? ' — ' + lead.servico : ''}. O WhatsApp oficial ainda não está conectado ao sistema, então a primeira mensagem sai manualmente.`, responsavel: vend, prioridade: 'Alta', prazo: prazo.toISOString().slice(0, 10), vinculo: lead.nome, leadId: lead.id, origem: 'primeiro-contato', status: 'A fazer', criadoEm: quando, concluidaEm: null, criadoPor: 'Sistema (primeiro contato)', historico: [] });
      mT = true;
    }
    avisarPessoa(vend, `🆕 Lead novo pra você: ${lead.nome} (${origem})${lead.servico ? ' — ' + lead.servico : ''}.${eventoTxt ? ` Ligação agendada ${eventoTxt} (já está na sua Agenda).` : ''}${sim(cfg.mensagemAutomatica) ? ' Responda no WhatsApp dentro da janela de 24h.' : ''}`).catch(() => {});
  }
  await gravar(K.leads, leads, versao, QUEM);
  if (mF) await gravar(K.funil, funil, vF, QUEM);
  if (mA) await gravar(K.agenda, agenda, vA, QUEM);
  if (mT) await gravar(K.tarefas, tarefas, vT, QUEM);
  log.push(`primeiro contato: ${novos.length} lead(s) — ${atribuidos} atribuído(s), ${agendados} ligação(ões) agendada(s), ${avisos} aviso(s)`);
}
