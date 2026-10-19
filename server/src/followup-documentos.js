// Follow-up semanal: toda sexta (ou o dia escolhido), o cliente recebe a lista
// do que ainda falta no processo dele.
//
// Tudo vem de Configurações → Regras → Follow-up de documentos: o dia, a hora,
// de qual setor sai a mensagem, e o que conta como pendente. O texto vem de
// Configurações → Templates de mensagem → followupSemanal.
//
// QUEM ENVIA É O WAHA, pelo número do próprio setor — não o WhatsApp Business
// oficial. A diferença decide se este recurso existe: o canal oficial da Meta
// só aceita texto livre nas 24 h seguintes à mensagem do cliente, e fora disso
// exige modelo aprovado. Uma cobrança semanal cai quase sempre fora dessa
// janela, então pelo oficial ela só sairia como modelo — sem a lista de
// documentos, que é o conteúdo inteiro da mensagem.
//
// O WAHA é sessão de WhatsApp Web: manda texto livre a qualquer hora, por
// qualquer um dos números dos setores. É por isso que o follow-up vai por ele.
//
// Caminhos, nesta ordem:
//   1. setores.canal = 'waha' e a sessão do setor de pé → envia
//   2. canal 'oficial' e o cliente escreveu nas últimas 24 h → texto livre
//   3. qualquer outro caso → a mensagem fica PRONTA e o setor é avisado
//
// O caminho 3 não é falha: é como o escritório trabalha enquanto o canal não
// está ligado. A mensagem aparece no portal do cliente e vai por e-mail se o
// SMTP estiver configurado, exatamente como os outros avisos.
//
// Nunca manda duas vezes na mesma semana, mesmo que o servidor reinicie ou a
// varredura rode mil vezes: o processo guarda a data do último envio.

import { ler, gravar } from './armazenamento.js';
import { obterRegras } from './regras.js';
import { avisarCanal } from './chat.js';
import { enviarTexto as enviarOficial, enviarModelo, whatsappConfigurado, dentroDaJanela } from './whatsapp.js';
import { enviarTexto as enviarWaha, wahaConfigurado, sessaoDoSetor } from './waha.js';
import { montarAviso } from './avisos-cliente.js';

const K = {
  processos: 'legalway-processos-documentacao-v1',
  templates: 'legalway-templates-mensagem-v1',
  leads: 'legalway-leads-v1',
};
const QUEM = 'automação';
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

async function bloco(chave, padrao = []) {
  const r = await ler(chave);
  return { valor: r ? r.valor : padrao, versao: r ? r.versao : null };
}

// "Agora" no fuso do escritório. Um envio marcado para sexta 10h tem de sair
// sexta 10h na Flórida, não em UTC — senão a mensagem de sexta à noite vira
// sábado e o cliente recebe no fim de semana.
function agoraLocal(tz) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const data = `${p.year}-${p.month}-${p.day}`;
    return { data, minutos: Number(p.hour) * 60 + Number(p.minute), dia: DIAS[new Date(data + 'T12:00:00Z').getUTCDay()] };
  } catch {
    const d = new Date();
    return { data: d.toISOString().slice(0, 10), minutos: d.getUTCHours() * 60 + d.getUTCMinutes(), dia: DIAS[d.getUTCDay()] };
  }
}
const emMinutos = (hhmm) => { const [h, m] = String(hhmm || '10:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const digitos = (s) => String(s || '').replace(/\D/g, '');

// Documentos que o CLIENTE ainda precisa mandar. "Recebido" não entra: já
// chegou, está só esperando conferência nossa — cobrar seria errado.
function pendentes(p, statusQueContam) {
  const contam = new Set(statusQueContam);
  return (p.checklist || []).filter(d => contam.has(d.status || 'Não solicitado') && !d.arquivo);
}

// A lista sai agrupada por pessoa quando há dependente, porque "Passaporte"
// três vezes seguidas não diz a ninguém de quem é cada um.
function listarDocumentos(itens, teto) {
  // Hoje a média real é de 12 documentos por cliente. Uma lista de 12 itens no
  // WhatsApp é um paredão que faz a pessoa fechar e não responder. O teto é
  // opcional (0 = sem limite) e existe para quem preferir cobrar aos poucos.
  if (teto > 0 && itens.length > teto) {
    const sobra = itens.length - teto;
    return listarDocumentos(itens.slice(0, teto), 0) + `\n\n…e mais ${sobra} documento(s). A lista completa está no seu portal.`;
  }
  const grupos = new Map();
  for (const d of itens) {
    const g = d.grupo || '';
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(d.nome);
  }
  const partes = [];
  for (const [g, nomes] of grupos) {
    if (g) partes.push(`*${g}*`);
    for (const n of nomes) partes.push(`• ${n}`);
  }
  return partes.join('\n');
}

function preencher(txt, valores) {
  return String(txt || '').replace(/\{(\w+)\}/g, (m, chave) => valores[chave] !== undefined ? valores[chave] : m);
}

const PADRAO = `Olá, {cliente}! 👋

Passando para lembrar dos documentos que ainda faltam no seu processo de {servico}:

{documentos}

Assim que conseguir, pode mandar por aqui mesmo. Qualquer dúvida é só chamar!

{empresa}`;

export async function followupDocumentos(log) {
  const R = await obterRegras();
  const cfg = (R.followupDocumentos) || {};
  if (!cfg.ativo) return;

  const tz = (R.agenda && R.agenda.fusoHorario) || 'America/New_York';
  const agora = agoraLocal(tz);
  if (agora.dia !== (cfg.diaSemana || 'sex')) return;

  // A varredura roda a cada minuto. Esta janela de 10 minutos evita que um
  // reinício no minuto exato faça o envio passar batido — e a trava de
  // "já mandei esta semana" impede repetição.
  const alvo = emMinutos(cfg.hora || '10:00');
  if (agora.minutos < alvo || agora.minutos > alvo + 10) return;

  const { valor: processos, versao } = await bloco(K.processos);
  if (!Array.isArray(processos) || !processos.length) return;

  const t = await ler(K.templates);
  let templates = t ? t.valor : {};
  if (typeof templates === 'string') { try { templates = JSON.parse(templates); } catch { templates = {}; } }
  const modelo = (templates && templates.followupSemanal) || PADRAO;

  const { valor: leads } = await bloco(K.leads);
  const porTelefone = new Map();
  for (const l of (Array.isArray(leads) ? leads : [])) {
    const d = digitos(l.telefone); if (d.length >= 10) porTelefone.set(d.slice(-10), l);
  }

  const keySetor = cfg.setor || 'documentos';
  const setor = ((R.setores && R.setores.lista) || []).find(s => s.key === keySetor) || {};
  const canal = (R.setores && R.setores.canal) || 'manual';
  const sessao = sessaoDoSetor(R, keySetor);
  const porWaha = canal === 'waha' && wahaConfigurado() && !!sessao;
  const porOficial = canal === 'oficial' && whatsappConfigurado();
  const automatico = !!(R.setores && R.setores.envioAutomatico) && (porWaha || porOficial);

  if (R.setores && R.setores.envioAutomatico && canal === 'waha' && !porWaha) {
    log.push('follow-up: canal WAHA escolhido mas ' + (!wahaConfigurado()
      ? 'as variáveis WAHA_URL/WAHA_API_KEY não estão no servidor'
      : 'o setor "' + keySetor + '" está sem sessão configurada') + ' — as mensagens ficam prontas.');
  }
  const statusQueContam = Array.isArray(cfg.statusQueContam) && cfg.statusQueContam.length
    ? cfg.statusQueContam : ['Não solicitado', 'Solicitado', 'Incorreto'];

  let enviados = 0, preparados = 0, pulados = 0;
  const prontas = [];
  let mudou = false;

  for (const p of processos) {
    if (p.followupSemanal && p.followupSemanal.ultimoEnvio === agora.data) { pulados++; continue; }
    if (cfg.pularProtocolados !== false && p.protocolo) { pulados++; continue; }

    const faltam = pendentes(p, statusQueContam);
    if (!faltam.length) { pulados++; continue; }

    const texto = preencher(modelo, {
      cliente: (p.clienteNome || '').split(' ')[0] || p.clienteNome || '',
      nomeCompleto: p.clienteNome || '',
      servico: p.servico || '',
      documentos: listarDocumentos(faltam, Number(cfg.maxDocumentos) || 0),
      quantidade: String(faltam.length),
      empresa: (R.empresa && R.empresa.nome) || '',
      setor: setor.nome || '',
    });

    const tel = digitos(p.telefone);
    const lead = tel.length >= 10 ? porTelefone.get(tel.slice(-10)) : null;
    let como = 'pronta';

    if (automatico && tel.length >= 10) {
      try {
        if (porWaha) {
          const r = await enviarWaha(sessao, p.telefone, texto);
          if (r.ok) como = 'waha';
          else log.push(`follow-up: ${p.clienteNome} não saiu pelo WAHA — ${r.motivo}`);
        } else if (dentroDaJanela(lead)) {
          await enviarOficial(tel, texto); como = 'texto';
        } else if (cfg.modeloMeta) {
          await enviarModelo(tel, cfg.modeloMeta, cfg.idiomaModelo || 'pt_BR', [p.clienteNome || '', String(faltam.length)]);
          como = 'modelo';
        }
      } catch (e) {
        como = 'pronta';
        log.push(`follow-up: falha ao enviar para ${p.clienteNome} — ${e.message}`);
      }
    }

    p.followupSemanal = { ultimoEnvio: agora.data, quantos: faltam.length, como };
    p.historico = p.historico || [];
    p.historico.push({ quando: new Date().toISOString(),
      texto: `Follow-up semanal — ${faltam.length} documento(s) pendente(s)`
        + (como === 'pronta' ? '. Mensagem pronta para o setor enviar.'
          : ` — cobrança enviada por ${como === 'waha' ? 'WhatsApp (' + (setor.nome || keySetor) + ')' : como === 'modelo' ? 'modelo aprovado' : 'WhatsApp oficial'}.`) });
    mudou = true;

    // Põe o aviso no portal do cliente e manda por e-mail quando houver acesso
    // e SMTP — é o mesmo caminho dos outros avisos. Não grava sozinho.
    await montarAviso(p, {
      tipo: 'documentos',
      titulo: `Faltam ${faltam.length} documento(s)`,
      texto,
    });

    if (como === 'pronta') { preparados++; prontas.push({ nome: p.clienteNome, tel: p.telefone, quantos: faltam.length }); }
    else enviados++;
  }

  if (!mudou) return;
  await gravar(K.processos, processos, versao, QUEM);

  if (enviados) log.push(`follow-up semanal: ${enviados} enviado(s)`);
  if (preparados) {
    log.push(`follow-up semanal: ${preparados} mensagem(ns) pronta(s)`);
    const lista = prontas.slice(0, 15).map(x => `• ${x.nome} (${x.tel || 'sem telefone'}) — ${x.quantos} doc.`).join('\n');
    await avisarCanal(cfg.setor || 'documentos',
      `📋 Follow-up de sexta: ${preparados} cliente(s) com documento pendente.\n`
      + `As mensagens estão prontas no processo de cada um` + (setor.numero ? `, para enviar pelo ${setor.numero}` : '') + `.\n\n${lista}`
      + (prontas.length > 15 ? `\n…e mais ${prontas.length - 15}.` : '')).catch(() => {});
  }
}
