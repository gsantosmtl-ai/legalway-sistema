// Regras do escritório: tudo que era fixo no código vira configuração, com o padrão = jeito da Legal Way.
// Guardado na chave 'legalway-regras-v1' (mesmo mecanismo dos módulos: versão, auditoria, permissão).
// Telas e automações leem sempre "padrão + o que o escritório mudou".
import { Router } from 'express';
import { ler } from './armazenamento.js';
import { exigirLogin } from './auth.js';

export const CHAVE_REGRAS = 'legalway-regras-v1';

export const REGRAS_PADRAO = {
  empresa: {
    nome: 'Legal Way Group', nomeCurto: 'LW', slogan: 'Disciplina hoje, liberdade amanhã.',
    endereco: '9100 Conroy Windermere Rd., Suite 200, Office 286, Windermere, FL 34786', cidade: 'Windermere, Florida',
    telefone: '(689) 312 0885', email: 'contato@legalway.group', site: 'legalwayservices.com',
    fuso: 'America/New_York', moeda: 'USD', logo: null,
  },
  chat: {
    canais: [
      { key: 'vendas', nome: 'vendas', icone: '💼' },
      { key: 'documentacao', nome: 'documentação', icone: '📁' },
      { key: 'financeiro', nome: 'financeiro', icone: '💰' },
    ],
  },
  leads: {
    origens: [
      { key: 'formulario', nome: 'Formulário' }, { key: 'whatsapp', nome: 'WhatsApp' }, { key: 'google_ads', nome: 'Google Ads' },
      { key: 'indicacao', nome: 'Indicação' }, { key: 'outro', nome: 'Outro' },
    ],
    primeiroContatoAtivo: false, // liga/desliga a automação de primeiro contato inteira
    distribuicao: 'manual', // manual | disponibilidade | rodizio
    // Primeiro contato por origem (Legal Way: WhatsApp atribui e agenda; formulário fica pro vendedor captar)
    primeiroContato: [
      { origem: 'whatsapp', atribuir: 'sim', agendarLigacao: 'sim', mensagemAutomatica: 'sim' },
      { origem: 'formulario', atribuir: 'nao', agendarLigacao: 'nao', mensagemAutomatica: 'nao' },
      { origem: 'google_ads', atribuir: 'nao', agendarLigacao: 'nao', mensagemAutomatica: 'nao' },
      { origem: 'indicacao', atribuir: 'nao', agendarLigacao: 'nao', mensagemAutomatica: 'nao' },
    ],
    antecedenciaMin: 30, janelaWhatsappHoras: 24,
  },
  funil: {
    etapas: ['Lead assumido', 'Tentativa de contato', 'Contato realizado', 'Qualificação', 'Reunião agendada', 'Reunião realizada', 'Proposta', 'Negociação', 'Ganho'],
    etapaGanho: 'Ganho',
    motivosSaida: ['Sem contato', 'Não qualificado', 'Sem interesse', 'Follow-up futuro', 'Perdido', 'Repescagem', 'Reativação futura'],
    diasLeadParado: 3,
  },
  sdr: {
    faixas: [{ ate: 10, aCadaDias: 1 }, { ate: 30, aCadaDias: 2 }, { ate: 50, aCadaDias: 3 }],
    limiteBaixaPrioridade: 50,
    comissao: { valor: 100, entradaMinima: 500 },
  },
  agenda: {
    duracaoPadraoMin: 30, tipos: ['Videochamada', 'Ligação', 'Presencial'], duracaoLigacaoMin: 15, fusoHorario: 'America/New_York',
    // Quem atende quando (usado pelo primeiro contato automático). Uma linha por vendedor e faixa de horário.
    disponibilidade: [
      { vendedor: 'Renato', dias: 'seg,ter,qua,qui,sex', inicio: '09:00', fim: '18:00' },
      { vendedor: 'Adriano', dias: 'seg,ter,qua,qui,sex', inicio: '09:00', fim: '18:00' },
    ],
  },
  contratos: {
    etapas: ['A gerar', 'Em preparação', 'Aguardando assinatura', 'Assinado', 'Cancelado'],
    diasPrimeiraParcela: 30, recorrencia: 'mensal', diasAlertaAssinatura: 2, cancelarEstornaFuturas: true,
  },
  financeiro: {
    contas: ['Truist', 'Stripe', 'Zelle', 'Wise', 'Dinheiro'],
    categorias: ['Marketing', 'Software', 'Salários', 'Escritório', 'Impostos'],
    centrosCusto: ['Vendas', 'Documentação', 'Administrativo'],
    diasAvisoVencimento: 3, gateProtocolo: true, percentualMinimoProtocolo: 0,
  },
  documentos: {
    status: ['Aguardando boas-vindas', 'Documentos solicitados', 'Recebendo documentos', 'Documentação completa', 'Aguardando autorização financeira', 'Liberado para protocolo', 'Protocolado', 'Em acompanhamento'],
    diasSemRetorno: 3,
  },
  prestadores: {
    tipos: [{ key: 'traducao', nome: 'Tradução', geraPagamento: true }, { key: 'psicologica', nome: 'Avaliação psicológica', geraPagamento: true }],
  },
  tarefas: { lembreteDiasAntes: 0 },
  // Portal do cliente: o que o cliente vê e pode fazer no acesso dele
  portal: {
    ativo: true, permitirEnvio: true, mostrarUscis: true, mostrarFinanceiro: true,
    aviso: 'Dúvida sobre algum documento? Fale com a gente pelo WhatsApp — respondemos em horário comercial.',
    mensagemConvite: 'Olá, {cliente}! Criamos seu acesso ao portal da {empresa}, onde você acompanha seu processo e envia os documentos.\n\nEndereço: {link}\nE-mail: {email}\nSenha temporária: {senha}\n\nNo primeiro acesso o sistema vai pedir para você criar uma senha nova.',
  },
};

const ehObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function mesclarRegras(padrao, custom) {
  if (!ehObj(custom)) return padrao;
  const out = { ...padrao };
  for (const [k, v] of Object.entries(custom)) {
    if (v === undefined || v === null) continue;
    out[k] = (ehObj(padrao[k]) && ehObj(v)) ? mesclarRegras(padrao[k], v) : v;
  }
  return out;
}

let cache = { quando: 0, regras: null };
export async function obterRegras() {
  if (Date.now() - cache.quando < 5000 && cache.regras) return cache.regras;
  const r = await ler(CHAVE_REGRAS);
  cache = { quando: Date.now(), regras: mesclarRegras(REGRAS_PADRAO, r ? r.valor : null) };
  return cache.regras;
}
export function invalidarRegras() { cache.quando = 0; }

export const rotasRegras = Router();
// Regras completas (qualquer pessoa logada) — a tela de configuração grava direto na chave via /api/storage
rotasRegras.get('/regras', exigirLogin, async (req, res, next) => {
  try { res.json({ regras: await obterRegras(), padrao: REGRAS_PADRAO }); } catch (e) { next(e); }
});
// Parte pública (páginas de contrato e portal): só identidade da empresa
rotasRegras.get('/publico/regras', async (req, res, next) => {
  try { const r = await obterRegras(); res.json({ empresa: r.empresa, prestadores: r.prestadores }); } catch (e) { next(e); }
});
