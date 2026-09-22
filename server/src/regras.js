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
    // Modelos de contrato editáveis (Configurações → Modelos de contrato). O arquivo modelo.html
    // monta o contrato com estas cláusulas; {cliente} {servico} {valor} {entrada} {parcelas}
    // {empresa} {endereco} {data} {email} {telefone} são trocados na hora de gerar.
    modelos: [
      {
        chave: 'padrao', nome: 'Contrato padrão', titulo: 'Contrato de Prestação de Serviços',
        clausulas: [
          { titulo: 'Objeto do contrato', texto: 'A CONTRATADA {empresa} prestará ao CONTRATANTE {cliente} serviços administrativos de preparação, organização documental e acompanhamento do processo de {servico}, conforme a proposta comercial aprovada.\n\nOs serviços são de natureza administrativa e de assessoria documental. A decisão sobre qualquer pedido é exclusiva das autoridades de imigração dos Estados Unidos.' },
          { titulo: 'Obrigações das partes', texto: 'A CONTRATADA se compromete a:\n- Orientar sobre os documentos necessários e revisar o material entregue\n- Organizar e montar o caso conforme as exigências aplicáveis\n- Informar o andamento do processo pelos canais combinados\n\nO CONTRATANTE se compromete a:\n- Entregar documentos verdadeiros, completos e dentro dos prazos solicitados\n- Comunicar qualquer mudança de endereço, estado civil, status migratório ou contato\n- Efetuar os pagamentos nas datas combinadas' },
          { titulo: 'Valores e forma de pagamento', texto: 'Valor total dos serviços: {valor}.\nEntrada: {entrada}.\nParcelamento: {parcelas}.\n\nOs valores acima não incluem taxas governamentais, traduções juramentadas, avaliações de credenciais, exames médicos ou honorários de terceiros, que são pagos à parte pelo CONTRATANTE.' },
          { titulo: 'Prazos', texto: 'Os prazos de preparação dependem da entrega dos documentos pelo CONTRATANTE. Prazos de análise e decisão são definidos pelas autoridades americanas e não estão sob controle da CONTRATADA.' },
          { titulo: 'Rescisão e reembolso', texto: 'Este contrato pode ser encerrado por qualquer das partes mediante aviso por escrito.\n\nOs valores referentes ao trabalho já realizado não são reembolsáveis. Taxas governamentais já recolhidas e serviços de terceiros já contratados também não são reembolsáveis.' },
          { titulo: 'Confidencialidade e proteção de dados', texto: 'A CONTRATADA trata os dados e documentos do CONTRATANTE de forma confidencial, usando-os apenas para a prestação dos serviços, e os compartilha somente com órgãos oficiais e prestadores envolvidos no caso.' },
          { titulo: 'Disposições finais', texto: 'Este contrato representa o acordo integral entre as partes e substitui entendimentos anteriores. Fica eleito o foro da comarca da sede da CONTRATADA, no Estado da Flórida, para dirimir eventuais controvérsias.\n\n{empresa} — {endereco}\nData: {data}' },
        ],
      },
    ],
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
    // Datas que não podem passar batido. "Dias" = prazo padrão a contar do dia em que o marco acontece
    // (0 = a data vem da carta do USCIS). "Avisar antes" = com quantos dias de antecedência o sistema cobra.
    prazos: [
      { tipo: 'Resposta ao RFE', dias: 87, avisarAntes: 30 },
      { tipo: 'Resposta ao NOID', dias: 33, avisarAntes: 15 },
      { tipo: 'Biometria', dias: 0, avisarAntes: 3 },
      { tipo: 'Entrevista', dias: 0, avisarAntes: 7 },
      { tipo: 'Validade do EAD (cartão de trabalho)', dias: 0, avisarAntes: 150 },
      { tipo: 'Validade do Advance Parole', dias: 0, avisarAntes: 90 },
      { tipo: 'Janela do I-751 (90 dias antes do vencimento)', dias: 0, avisarAntes: 30 },
      { tipo: 'Elegibilidade para o N-400', dias: 0, avisarAntes: 60 },
      { tipo: 'Validade do passaporte', dias: 0, avisarAntes: 180 },
      { tipo: 'Outro prazo', dias: 0, avisarAntes: 7 },
    ],
  },
  prestadores: {
    tipos: [{ key: 'traducao', nome: 'Tradução', geraPagamento: true }, { key: 'psicologica', nome: 'Avaliação psicológica', geraPagamento: true }],
  },
  tarefas: { lembreteDiasAntes: 0 },
  // Portal do cliente: o que o cliente vê e pode fazer no acesso dele
  portal: {
    ativo: true, permitirEnvio: true, mostrarUscis: true, mostrarFinanceiro: true,
    aviso: 'Dúvida sobre algum documento? Fale com a gente pelo WhatsApp — respondemos em horário comercial.',
    // O que o cliente é avisado (no portal e, se o e-mail estiver configurado, por e-mail)
    avisarCliente: { documentoAprovado: true, documentoRecusado: true, statusUscis: true, parcelaVencendo: true, diasAntesParcela: 5 },
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
  try { const r = await obterRegras(); res.json({ empresa: r.empresa, prestadores: r.prestadores, contratos: { modelos: (r.contratos && r.contratos.modelos) || [] } }); } catch (e) { next(e); }
});
