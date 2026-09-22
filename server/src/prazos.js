// Prazos do caso: as datas que não podem passar batido (resposta ao RFE, biometria, entrevista,
// validade do EAD e do Advance Parole, janela do I-751, elegibilidade do N-400…).
// Cada processo guarda `prazos: [{ id, tipo, data, obs, concluidoEm, avisadoEm, criadoPor }]`.
// Uma vez por dia o servidor olha todos: com a antecedência configurada, cria a tarefa pro
// responsável e avisa no chat; passou da data e ainda está aberto, cobra de novo.
import { ler, gravar } from './armazenamento.js';
import { avisarCanal, avisarPessoa } from './chat.js';
import { obterRegras } from './regras.js';

const K_PROCESSOS = 'legalway-processos-documentacao-v1';
const K_TAREFAS = 'legalway-tarefas-v1';
const QUEM = 'automação';
const uid = (p) => p + Date.now() + Math.floor(Math.random() * 1000);
const hoje = () => new Date().toISOString().slice(0, 10);
const somarDias = (dataIso, n) => { const d = new Date(dataIso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diasAte = (dataIso) => Math.round((new Date(dataIso + 'T12:00:00Z') - new Date(hoje() + 'T12:00:00Z')) / 864e5);
const fmt = (iso) => iso ? iso.split('-').reverse().join('/') : '';

async function bloco(chave, padrao = []) { const r = await ler(chave); return { valor: r ? r.valor : padrao, versao: r ? r.versao : null }; }

// Cria um prazo num processo (usado pelo USCIS quando cai um RFE/NOID e pela tela)
export function novoPrazo(processo, tipo, data, obs, criadoPor) {
  processo.prazos = processo.prazos || [];
  if (processo.prazos.some(p => p.tipo === tipo && !p.concluidoEm)) return null; // já existe um aberto do mesmo tipo
  const prazo = { id: uid('pz'), tipo, data: data || null, obs: obs || '', concluidoEm: null, avisadoEm: null, criadoEm: new Date().toISOString(), criadoPor: criadoPor || 'Sistema' };
  processo.prazos.push(prazo);
  processo.historico = processo.historico || [];
  processo.historico.push({ quando: new Date().toISOString(), texto: `Prazo criado: ${tipo}${data ? ' — ' + fmt(data) : ' (sem data ainda)'}` });
  return prazo;
}

// Dias padrão de um tipo, conforme as Regras do escritório
export async function diasPadraoDoTipo(tipo) {
  const R = await obterRegras();
  const cfg = (R.documentos.prazos || []).find(p => String(p.tipo || '').toLowerCase() === String(tipo).toLowerCase());
  return cfg ? Number(cfg.dias) || 0 : 0;
}

export async function conferirPrazos(log) {
  const R = await obterRegras();
  const tipos = R.documentos.prazos || [];
  const antecedencia = (tipo) => {
    const cfg = tipos.find(p => String(p.tipo || '').toLowerCase() === String(tipo).toLowerCase());
    return cfg ? (Number(cfg.avisarAntes) || 0) : 7;
  };
  const { valor: processos, versao } = await bloco(K_PROCESSOS);
  const comPrazo = processos.filter(p => Array.isArray(p.prazos) && p.prazos.some(z => z.data && !z.concluidoEm));
  if (!comPrazo.length) return;
  const { valor: tarefas, versao: vT } = await bloco(K_TAREFAS);
  const h = hoje();
  let avisados = 0, novasTarefas = 0;

  for (const p of comPrazo) {
    for (const z of p.prazos) {
      if (!z.data || z.concluidoEm) continue;
      const faltam = diasAte(z.data);
      const dentroDaJanela = faltam <= antecedencia(z.tipo);
      if (!dentroDaJanela) continue;
      // avisa uma vez por dia enquanto estiver na janela ou atrasado
      if (z.avisadoEm === h) continue;
      z.avisadoEm = h;
      avisados++;
      const quando = faltam < 0 ? `venceu há ${Math.abs(faltam)} dia(s)` : faltam === 0 ? 'vence hoje' : `vence em ${faltam} dia(s)`;
      const linha = `⏰ ${z.tipo} — ${p.clienteNome} (${p.servico}): ${quando} (${fmt(z.data)}).${z.obs ? ' ' + z.obs : ''}`;
      avisarCanal('documentacao', linha).catch(() => {});
      if (p.responsavel) avisarPessoa(p.responsavel, linha).catch(() => {});
      const titulo = `${z.tipo} — ${p.clienteNome}`;
      if (!tarefas.some(t => t.prazoId === z.id && t.status !== 'Concluída')) {
        tarefas.unshift({
          id: uid('tf'), titulo,
          descricao: `Prazo do caso em ${fmt(z.data)} (${quando}).${z.obs ? '\n' + z.obs : ''}`,
          responsavel: p.responsavel || '', prioridade: faltam <= 7 ? 'Alta' : 'Média', prazo: z.data,
          vinculo: p.clienteNome, clienteId: p.clienteId || null, processoId: p.id, prazoId: z.id, origem: 'prazo',
          status: 'A fazer', criadoEm: new Date().toISOString(), concluidaEm: null, criadoPor: 'Sistema (prazos)', historico: [],
        });
        novasTarefas++;
      }
    }
  }
  if (avisados) {
    await gravar(K_PROCESSOS, processos, versao, QUEM);
    if (novasTarefas) await gravar(K_TAREFAS, tarefas, vT, QUEM);
    log.push(`prazos: ${avisados} aviso(s), ${novasTarefas} tarefa(s)`);
  }
}
