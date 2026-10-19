// Avisos automáticos ao cliente: um motor, não um recurso por mensagem.
//
// O escritório precisa mandar coisas diferentes em momentos diferentes —
// cobrança chegando, cobrança paga, documentos que faltam, processo
// protocolado, notícia do USCIS. Escrever um módulo para cada uma faria o
// próximo pedido ("agora a cada 15 dias") virar outro módulo. Então aqui tem
// GATILHOS registrados, e o escritório monta os avisos que quiser por cima
// deles, em Configurações → Avisos automáticos.
//
// Cada gatilho sabe três coisas e só isso:
//   sobre      — se percorre processos ou parcelas
//   quando     — semanal, a cada N dias, N dias antes de uma data, ou evento
//   candidatos — quem deve receber agora, com as chaves do template preenchidas
//
// O motor cuida do resto: horário no fuso do escritório, não repetir, montar o
// texto, mandar pelo WAHA do setor, registrar no histórico e no portal.
//
// QUEM ENVIA É O WAHA, pelo número do setor. O WhatsApp oficial da Meta é a
// porta de entrada dos leads e só responde dentro da janela de 24 h — aviso
// que parte do escritório não cabe lá. Ver waha.js.
//
// A CALIBRAGEM, que impede o pior acidente possível aqui. Um aviso de EVENTO
// ("pagamento confirmado") olha o estado atual, não um registro de transições:
// no dia em que alguém ligasse, as 889 parcelas já pagas virariam 889 mensagens
// sobre pagamentos de meses atrás. Por isso, na primeira passagem depois de
// ligado, o aviso de evento MARCA tudo que já existe como tratado e não envia
// nada. Dali em diante só dispara o que acontecer de novo.
//
// Aviso recorrente não se calibra: ele fala do estado de hoje, e na primeira
// sexta tem de sair para todo mundo que está devendo documento.
//
// SOBRE COBRANÇA: não há gateway de pagamento ainda. "Pago" e "Atrasado" são
// o que o sistema sabe hoje, e é disso que os gatilhos de cobrança vivem.
// Quando o Stripe entrar, o evento de falha real vira um gatilho novo aqui,
// sem mexer em mais nada.

import { ler, gravar } from './armazenamento.js';
import { obterRegras } from './regras.js';
import { avisarCanal } from './chat.js';
import { enviarTexto as enviarWaha, wahaConfigurado, sessaoDoSetor } from './waha.js';
import { montarAviso } from './avisos-cliente.js';

const K = {
  avisos: 'legalway-avisos-automaticos-v1',
  processos: 'legalway-processos-documentacao-v1',
  financeiro: 'legalway-financeiro-v1',
  contratos: 'legalway-contratos-v1',
};
const QUEM = 'automação';
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

async function bloco(chave, padrao = []) {
  const r = await ler(chave);
  return { valor: r ? r.valor : padrao, versao: r ? r.versao : null };
}
const digitos = (s) => String(s || '').replace(/\D/g, '');
const fmtData = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
const fmtValor = (v) => 'US$ ' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const primeiroNome = (n) => String(n || '').trim().split(' ')[0] || '';

function agoraLocal(tz) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const data = `${p.year}-${p.month}-${p.day}`;
    return { data, minutos: Number(p.hour) * 60 + Number(p.minute), dia: DIAS[new Date(data + 'T12:00:00Z').getUTCDay()] };
  } catch {
    const d = new Date();
    return { data: d.toISOString().slice(0, 10), minutos: d.getUTCHours() * 60 + d.getUTCMinutes(), dia: DIAS[d.getUTCDay()] };
  }
}
const emMinutos = (hhmm) => { const [h, m] = String(hhmm || '10:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const somarDias = (data, n) => { const d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Documentos que o CLIENTE ainda deve. "Recebido" fica de fora: já chegou e
// espera conferência nossa — cobrar faria a pessoa mandar duas vezes.
const PENDENTE = new Set(['Não solicitado', 'Solicitado', 'Incorreto']);
const pendentesDe = (p) => (p.checklist || []).filter(d => PENDENTE.has(d.status || 'Não solicitado') && !d.arquivo);

// A lista sai agrupada por pessoa quando há dependente: "Passaporte" três
// vezes seguidas não diz a ninguém de quem é cada um.
function listarDocumentos(itens, teto) {
  if (teto > 0 && itens.length > teto) {
    return listarDocumentos(itens.slice(0, teto), 0)
      + `\n\n…e mais ${itens.length - teto} documento(s). A lista completa está no seu portal.`;
  }
  const grupos = new Map();
  for (const d of itens) { const g = d.grupo || ''; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(d.nome); }
  const linhas = [];
  for (const [g, nomes] of grupos) { if (g) linhas.push(`*${g}*`); for (const n of nomes) linhas.push(`• ${n}`); }
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// OS GATILHOS. Para criar um novo, basta acrescentar aqui: a tela de
// configuração se monta a partir desta lista.
// ---------------------------------------------------------------------------
export const GATILHOS = {
  documentosPendentes: {
    nome: 'Documentos que faltam', sobre: 'processo', quando: 'semanal', setorSugerido: 'documentos',
    ajuda: 'Uma vez por semana, para quem ainda tem documento pendente.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'documentos', 'quantidade'],
    padrao: `Olá, {cliente}! 👋\n\nPassando para lembrar dos documentos que ainda faltam no seu processo de {servico}:\n\n{documentos}\n\nAssim que conseguir, pode mandar por aqui mesmo. Qualquer dúvida é só chamar!\n\n{empresa}`,
    candidatos(d, cfg, agora) {
      const fora = [];
      for (const p of d.processos) {
        if (cfg.pularProtocolados !== false && p.protocolo && p.protocolo.recibo) continue;
        const faltam = pendentesDe(p);
        if (!faltam.length) continue;
        fora.push({ alvo: p, onde: 'processo', chaveUnica: 'semana:' + agora.data, telefone: p.telefone,
          valores: { cliente: primeiroNome(p.clienteNome), nomeCompleto: p.clienteNome || '', servico: p.servico || '',
            documentos: listarDocumentos(faltam, Number(cfg.maxItens) || 0), quantidade: String(faltam.length) },
          titulo: `Faltam ${faltam.length} documento(s)` });
      }
      return fora;
    },
  },

  processoProtocolado: {
    nome: 'Processo protocolado', sobre: 'processo', quando: 'evento', setorSugerido: 'documentos',
    ajuda: 'Uma vez, assim que o recibo do USCIS for preenchido no processo.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'recibo'],
    padrao: `Boa notícia, {cliente}! 🎉\n\nSeu processo de {servico} foi protocolado no USCIS.\n\nNúmero do recibo: *{recibo}*\n\nGuarde esse número — é por ele que o caso é acompanhado. Vamos avisando a cada novidade.\n\n{empresa}`,
    candidatos(d) {
      return d.processos
        .filter(p => p.protocolo && p.protocolo.recibo)
        .map(p => ({ alvo: p, onde: 'processo', chaveUnica: 'recibo:' + p.protocolo.recibo, telefone: p.telefone,
          valores: { cliente: primeiroNome(p.clienteNome), nomeCompleto: p.clienteNome || '',
            servico: p.servico || '', recibo: p.protocolo.recibo },
          titulo: 'Processo protocolado' }));
    },
  },

  atualizacaoUscis: {
    nome: 'Atualização do USCIS', sobre: 'processo', quando: 'cadaDias', setorSugerido: 'documentos',
    ajuda: 'De tempos em tempos, o status atual do caso no USCIS. Só para quem já tem recibo.',
    chaves: ['cliente', 'nomeCompleto', 'servico', 'recibo', 'status', 'desdeQuando'],
    padrao: `Olá, {cliente}!\n\nAtualização do seu processo de {servico} (recibo {recibo}):\n\n*{status}*\n\nQualquer mudança a gente avisa. Você também acompanha tudo pelo portal.\n\n{empresa}`,
    candidatos(d) {
      return d.processos
        .filter(p => p.protocolo && p.protocolo.recibo && p.uscis && p.uscis.status)
        .map(p => ({ alvo: p, onde: 'processo', chaveUnica: 'uscis:' + (p.uscis.status || ''), telefone: p.telefone,
          valores: { cliente: primeiroNome(p.clienteNome), nomeCompleto: p.clienteNome || '', servico: p.servico || '',
            recibo: p.protocolo.recibo, status: p.uscis.status,
            desdeQuando: fmtData(p.uscis.mudouEm || p.uscis.atualizadoEm) },
          titulo: 'Atualização do USCIS' }));
    },
  },

  parcelaVencendo: {
    nome: 'Cobrança chegando', sobre: 'parcela', quando: 'diasAntes', setorSugerido: 'financeiro',
    ajuda: 'Alguns dias antes do vencimento de cada parcela.',
    chaves: ['cliente', 'valor', 'vencimento', 'servico', 'parcela'],
    candidatosPrecisamDeDias: true,
    padrao: `Olá, {cliente}!\n\nSua parcela de {valor} vence em {vencimento}.\n\nQualquer dúvida sobre o pagamento é só chamar por aqui.\n\n{empresa}`,
    candidatos(d, cfg, agora) {
      const alvoData = somarDias(agora.data, Number(cfg.diasAntes) || 1);
      return d.financeiro
        .filter(f => (f.status === 'A vencer') && String(f.vencimento || '').slice(0, 10) === alvoData)
        .map(f => ({ alvo: f, onde: 'parcela', chaveUnica: 'vencendo:' + f.id, telefone: d.telefoneDoCliente(f),
          valores: { cliente: primeiroNome(f.clienteNome), nomeCompleto: f.clienteNome || '',
            valor: fmtValor(f.valor), vencimento: fmtData(f.vencimento), servico: f.servico || '',
            parcela: f.descricao || '' },
          titulo: 'Parcela vencendo' }));
    },
  },

  cobrancaPaga: {
    nome: 'Pagamento confirmado', sobre: 'parcela', quando: 'evento', setorSugerido: 'financeiro',
    ajuda: 'Uma vez, quando a parcela for marcada como paga.',
    chaves: ['cliente', 'valor', 'vencimento', 'servico', 'parcela', 'quandoPagou'],
    padrao: `Recebemos, {cliente}! ✅\n\nPagamento de {valor} confirmado.\n\nObrigado! Qualquer dúvida é só chamar.\n\n{empresa}`,
    candidatos(d) {
      return d.financeiro
        .filter(f => f.status === 'Pago')
        .map(f => ({ alvo: f, onde: 'parcela', chaveUnica: 'paga:' + f.id, telefone: d.telefoneDoCliente(f),
          valores: { cliente: primeiroNome(f.clienteNome), nomeCompleto: f.clienteNome || '',
            valor: fmtValor(f.valorRecebido || f.valor), vencimento: fmtData(f.vencimento),
            servico: f.servico || '', parcela: f.descricao || '', quandoPagou: fmtData(f.dataRecebimento) },
          titulo: 'Pagamento confirmado' }));
    },
  },

  cobrancaAtrasada: {
    nome: 'Cobrança não entrou', sobre: 'parcela', quando: 'evento', setorSugerido: 'financeiro',
    ajuda: 'Uma vez, quando a parcela passa a atrasada. Enquanto não houver gateway de pagamento, é isto que o sistema sabe sobre falha de cobrança.',
    chaves: ['cliente', 'valor', 'vencimento', 'servico', 'parcela'],
    padrao: `Olá, {cliente}.\n\nNão identificamos o pagamento da parcela de {valor}, que venceu em {vencimento}.\n\nSe já pagou, por favor nos avise aqui para darmos baixa. Se preferir outra forma de pagamento, a gente resolve junto.\n\n{empresa}`,
    candidatos(d) {
      return d.financeiro
        .filter(f => f.status === 'Atrasado')
        .map(f => ({ alvo: f, onde: 'parcela', chaveUnica: 'atrasada:' + f.id, telefone: d.telefoneDoCliente(f),
          valores: { cliente: primeiroNome(f.clienteNome), nomeCompleto: f.clienteNome || '',
            valor: fmtValor(f.valor), vencimento: fmtData(f.vencimento), servico: f.servico || '',
            parcela: f.descricao || '' },
          titulo: 'Cobrança em aberto' }));
    },
  },
};

// Chegou a hora deste aviso?
function naHora(aviso, gat, agora) {
  const alvo = emMinutos(aviso.hora || '10:00');
  const naJanela = agora.minutos >= alvo && agora.minutos <= alvo + 10;
  if (gat.quando === 'semanal') return agora.dia === (aviso.diaSemana || 'sex') && naJanela;
  if (gat.quando === 'cadaDias' || gat.quando === 'diasAntes') return naJanela;
  if (gat.quando === 'evento') return naJanela;   // evento é conferido uma vez por dia, no horário
  return false;
}

export async function avisosAutomaticos(log) {
  const confAvisos = await ler(K.avisos);
  let avisos = confAvisos ? confAvisos.valor : [];
  if (typeof avisos === 'string') { try { avisos = JSON.parse(avisos); } catch { avisos = []; } }
  if (!Array.isArray(avisos) || !avisos.length) return;
  const ligados = avisos.filter(a => a && a.ativo && GATILHOS[a.gatilho]);
  if (!ligados.length) return;

  const R = await obterRegras();
  const tz = (R.agenda && R.agenda.fusoHorario) || 'America/New_York';
  const agora = agoraLocal(tz);
  if (!ligados.some(a => naHora(a, GATILHOS[a.gatilho], agora))) return;

  const { valor: processos, versao: vP } = await bloco(K.processos);
  const { valor: financeiro, versao: vF } = await bloco(K.financeiro);
  const { valor: contratos } = await bloco(K.contratos);

  // A parcela guarda o nome do cliente, não o telefone. Ele vem do contrato,
  // e, se faltar lá, do processo do mesmo cliente.
  const telPorContrato = new Map(contratos.map(c => [c.id, c.telefone || '']));
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const telPorNome = new Map();
  for (const p of processos) if (p.telefone) telPorNome.set(norm(p.clienteNome), p.telefone);
  const telefoneDoCliente = (f) => telPorContrato.get(f.contratoId) || telPorNome.get(norm(f.clienteNome)) || '';

  const dados = { processos, financeiro, contratos, telefoneDoCliente };
  const canal = (R.setores && R.setores.canal) || 'manual';
  const podeWaha = canal === 'waha' && wahaConfigurado() && !!(R.setores && R.setores.envioAutomatico);

  let mexeuProcessos = false, mexeuFinanceiro = false, mexeuAvisos = false;
  const resumo = [];

  for (const aviso of ligados) {
    const gat = GATILHOS[aviso.gatilho];
    if (!naHora(aviso, gat, agora)) continue;

    // "a cada N dias" se mede pelo último disparo deste aviso, não pelo calendário
    if (gat.quando === 'cadaDias') {
      const cada = Math.max(1, Number(aviso.cadaDias) || 15);
      if (aviso.ultimoDisparo && aviso.ultimoDisparo > somarDias(agora.data, -cada)) continue;
    }

    const setorKey = aviso.setor || gat.setorSugerido;
    const setor = ((R.setores && R.setores.lista) || []).find(s => s.key === setorKey) || {};
    const sessao = sessaoDoSetor(R, setorKey);
    const envia = podeWaha && !!sessao;

    let candidatos = [];
    try { candidatos = gat.candidatos(dados, aviso, agora) || []; }
    catch (e) { log.push(`aviso "${aviso.nome}": falhou ao escolher quem recebe — ${e.message}`); continue; }

    // Primeira passagem de um aviso de evento: marca o passado como tratado e
    // não manda nada. Sem isto, ligar "pagamento confirmado" dispararia para
    // toda parcela já paga na história do escritório.
    if (gat.quando === 'evento' && !aviso.calibrado) {
      for (const c of candidatos) {
        c.alvo.avisosEnviados = c.alvo.avisosEnviados || {};
        c.alvo.avisosEnviados[aviso.id + '|' + c.chaveUnica] = 'calibragem';
        if (c.onde === 'processo') mexeuProcessos = true; else mexeuFinanceiro = true;
      }
      aviso.calibrado = agora.data;
      mexeuAvisos = true;
      log.push(`aviso "${aviso.nome}": calibrado — ${candidatos.length} registro(s) anteriores marcados como tratados, nada foi enviado. A partir de agora só dispara o que for novo.`);
      continue;
    }

    let enviados = 0, prontos = 0;
    const pendentesDeEnvio = [];

    for (const c of candidatos) {
      const marca = 'avisosEnviados';
      c.alvo[marca] = c.alvo[marca] || {};
      const chave = aviso.id + '|' + c.chaveUnica;
      if (c.alvo[marca][chave]) continue;                     // já mandou isso

      const texto = String(aviso.template || gat.padrao || '')
        .replace(/\{(\w+)\}/g, (m, k) => c.valores[k] !== undefined ? c.valores[k]
          : k === 'empresa' ? ((R.empresa && R.empresa.nome) || '')
          : k === 'setor' ? (setor.nome || '') : m);

      let como = 'pronta';
      if (envia && digitos(c.telefone).length >= 10) {
        const r = await enviarWaha(sessao, c.telefone, texto);
        if (r.ok) como = 'waha';
        else log.push(`aviso "${aviso.nome}": ${c.valores.nomeCompleto} não saiu — ${r.motivo}`);
      }

      c.alvo[marca][chave] = agora.data;
      if (c.onde === 'processo') {
        mexeuProcessos = true;
        c.alvo.historico = c.alvo.historico || [];
        c.alvo.historico.push({ quando: new Date().toISOString(),
          texto: `${aviso.nome} — ${como === 'waha' ? 'enviado pelo WhatsApp do ' + (setor.nome || setorKey) : 'mensagem pronta para o setor enviar'}` });
        await montarAviso(c.alvo, { tipo: 'aviso', titulo: c.titulo || aviso.nome, texto });
      } else {
        mexeuFinanceiro = true;
      }

      if (como === 'waha') enviados++;
      else { prontos++; pendentesDeEnvio.push({ nome: c.valores.nomeCompleto, tel: c.telefone, texto }); }
    }

    if (gat.quando === 'cadaDias' && (enviados || prontos)) { aviso.ultimoDisparo = agora.data; mexeuAvisos = true; }

    if (enviados || prontos) {
      resumo.push(`${aviso.nome}: ${enviados} enviado(s), ${prontos} pronto(s)`);
      if (prontos) {
        const lista = pendentesDeEnvio.slice(0, 15)
          .map(x => `• ${x.nome} (${x.tel || 'sem telefone'})`).join('\n');
        await avisarCanal(setorKey,
          `📬 ${aviso.nome}: ${prontos} mensagem(ns) pronta(s) para enviar`
          + (setor.numero ? ` pelo ${setor.numero}` : '') + `.\n\n${lista}`
          + (pendentesDeEnvio.length > 15 ? `\n…e mais ${pendentesDeEnvio.length - 15}.` : '')).catch(() => {});
      }
    }
  }

  if (mexeuProcessos) await gravar(K.processos, processos, vP, QUEM);
  if (mexeuFinanceiro) await gravar(K.financeiro, financeiro, vF, QUEM);
  if (mexeuAvisos) await gravar(K.avisos, avisos, confAvisos ? confAvisos.versao : null, QUEM);
  for (const r of resumo) log.push(r);
}
