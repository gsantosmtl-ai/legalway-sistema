// Lembretes que sobem na tela, no canto, em qualquer página do sistema.
//
// "precisamos colocar um popup que sempre vai subir uma notificacao para todo
// mundo quando tiver uma atividade, por exemplo; follow up agora, ligacao em 15
// minutos, como se fosse lembretes, cliente assinou o contrato, (como se fosse
// antigamente do MSN que subia o popup no canto da tela)"
//
// O cálculo é no SERVIDOR de propósito. A alternativa seria cada aba aberta
// baixar o bloco de agenda e o de contratos a cada minuto para decidir sozinha
// — com cinco pessoas e duas abas cada, isso é muita leitura de bloco inteiro
// para responder "tem algo nos próximos 15 minutos?". Aqui a resposta é
// calculada uma vez, guardada por 30 segundos e servida a todos, já filtrada
// por quem está pedindo.
import { Router } from 'express';
import { ler } from './armazenamento.js';
import { exigirLogin } from './auth.js';
import { FUSO_ESCRITORIO, hojeNoFuso, instanteDe } from './datas.js';

export const rotasLembretes = Router();

// Janelas, em minutos. "Daqui a 15 minutos" é o aviso que ela pediu; os 10
// minutos para trás pegam quem acabou de perder a hora e ainda dá tempo de
// correr. Mais do que isso vira lista de atrasados, que é outro assunto e já
// tem painel próprio no funil.
export const ANTES_MIN = 15;
export const DEPOIS_MIN = 10;
// Contrato assinado é notícia do escritório, não compromisso de agenda: avisa
// todo mundo, e por uma janela maior, porque ninguém está olhando a tela no
// segundo em que o cliente assina.
export const ASSINADO_MIN = 45;

// Quanto tempo uma menção continua subindo o popup. Três dias para quem estava
// de folga ou com o sistema fechado ainda receber ao voltar — a tela guarda os
// ids já vistos, então ninguém vê o mesmo aviso duas vezes.
const MENCAO_MIN = 3 * 24 * 60;
const CACHE_MS = 30 * 1000;
let cache = { quando: 0, itens: [] };

// Minutos desde a meia-noite do fuso do escritório. É assim que se compara com
// o "14:30" que está gravado no compromisso, que também é hora do escritório.
export function minutosAgora(agora = new Date(), tz = FUSO_ESCRITORIO) {
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(agora);
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function emMinutos(hora) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function comoFalar(diferenca) {
  if (diferenca <= 0) return 'agora';
  if (diferenca === 1) return 'em 1 minuto';
  return `em ${diferenca} minutos`;
}

// O miolo, separado da rota para poder ser testado sem banco nem servidor.
// `agenda` e `contratos` são os blocos; devolve a lista completa, sem filtrar
// por pessoa — quem filtra é a rota, porque o cache é compartilhado.
export function montarLembretes(agenda, contratos, agora = new Date(), tz = FUSO_ESCRITORIO, processos = []) {
  const dia = hojeNoFuso(tz, agora);   // o dia vem do instante recebido, não do relógio
  const minutos = minutosAgora(agora, tz);
  const itens = [];

  for (const a of (Array.isArray(agenda) ? agenda : [])) {
    if (!a || a.status !== 'Agendada' || a.data !== dia) continue;
    const quando = emMinutos(a.hora);
    if (quando === null) continue;
    const diferenca = quando - minutos;
    if (diferenca > ANTES_MIN || diferenca < -DEPOIS_MIN) continue;
    const tipo = a.tipo || 'Compromisso';
    itens.push({
      // O id carrega a hora do compromisso, não o instante do aviso: assim a
      // tela sabe que é o MESMO lembrete em duas buscas seguidas e não sobe o
      // popup de novo a cada meio minuto.
      id: `agenda:${a.id}:${a.data}:${a.hora}`,
      tipo: 'compromisso',
      titulo: `${tipo} ${comoFalar(diferenca)}`,
      texto: a.cliente ? String(a.cliente) : 'Compromisso sem nome',
      hora: a.hora,
      para: a.vendedor || null,          // null = todo mundo
      link: a.leadId ? `funil-comercial.html?abrir=${a.leadId}` : 'agenda.html',
      urgente: diferenca <= 0,
    });
  }

  for (const c of (Array.isArray(contratos) ? contratos : [])) {
    if (!c || c.etapa !== 'Assinado' || !c.dataAssinatura) continue;
    // Data pura vira meio-dia: com new Date cru, nenhum contrato vindo do
    // Bling caía na janela de 45 minutos deste aviso.
    const assinado = instanteDe(c.dataAssinatura);
    if (!assinado) continue;
    const quanto = (agora - assinado) / 60000;
    if (!(quanto >= 0 && quanto <= ASSINADO_MIN)) continue;
    itens.push({
      id: `assinou:${c.id}:${c.dataAssinatura}`,
      tipo: 'assinatura',
      titulo: 'Contrato assinado 🎉',
      texto: `${c.cliente || 'Cliente'} assinou${c.servico ? ' — ' + c.servico : ''}`,
      para: null,
      link: `contratos.html?abrir=${c.id}`,
      urgente: false,
    });
  }

  // --- menções em anotações ---
  //
  // Quem é marcado com @ numa anotação já recebe mensagem no chat. Faltava o
  // popup no canto da tela — o mesmo que avisa compromisso e contrato assinado.
  //
  // É DERIVADO da própria anotação, não um registro novo: a marcação já vive em
  // `historico[].mencoes`. Assim não existe aviso órfão de anotação apagada, e
  // quem estava offline vê ao voltar, porque o item continua na lista enquanto
  // estiver dentro da janela.
  for (const p of (Array.isArray(processos) ? processos : [])) {
    if (!p || p.situacao === 'cancelado') continue;
    for (const h of (Array.isArray(p.historico) ? p.historico : [])) {
      if (!h || h.tipo !== 'Anotação' || !Array.isArray(h.mencoes) || !h.mencoes.length) continue;
      const quanto = (agora - new Date(h.quando)) / 60000;
      if (!(quanto >= 0 && quanto <= MENCAO_MIN)) continue;
      for (const quem of h.mencoes) {
        if (!quem || quem === h.quem) continue;      // ninguém se avisa sozinho
        itens.push({
          // O id carrega o instante da anotação e o nome: o mesmo aviso em duas
          // buscas seguidas não sobe o popup de novo, e duas pessoas marcadas na
          // mesma anotação recebem avisos distintos.
          id: `mencao:${p.id}:${h.quando}:${quem}`,
          tipo: 'mencao',
          titulo: `${h.quem || 'Alguém'} marcou você numa anotação`,
          texto: `${p.clienteNome || 'Cliente'}${p.servico ? ' — ' + p.servico : ''}: ${
            String(h.texto || '').slice(0, 160)}`,
          para: quem,
          link: `documentos.html?abrir=${encodeURIComponent(p.id)}&aba=anotacoes`,
          urgente: false,
        });
      }
    }
  }

  return itens.sort((x, y) => String(x.hora || '').localeCompare(String(y.hora || '')));
}

rotasLembretes.get('/lembretes', exigirLogin, async (req, res, next) => {
  try {
    const agora = Date.now();
    if (agora - cache.quando > CACHE_MS) {
      const [ag, ct, pr] = await Promise.all([ler('legalway-agenda-v1'), ler('legalway-contratos-v1'),
        ler('legalway-processos-documentacao-v1')]);
      cache = { quando: agora, itens: montarLembretes(ag ? ag.valor : [], ct ? ct.valor : [],
        new Date(), undefined, pr ? pr.valor : []) };
    }
    const nome = req.usuario?.nome || '';
    res.json({ lembretes: cache.itens.filter((i) => !i.para || i.para === nome) });
  } catch (e) { next(e); }
});

// Para os testes: o cache é de módulo e vazaria de um teste para o outro.
export function limparCacheDeLembretes() { cache = { quando: 0, itens: [] }; }
