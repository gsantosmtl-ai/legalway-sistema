// Regras do escritório: tudo que era fixo no código vira configuração, com o padrão = jeito da Legal Way.
// Guardado na chave 'legalway-regras-v1' (mesmo mecanismo dos módulos: versão, auditoria, permissão).
// Telas e automações leem sempre "padrão + o que o escritório mudou".
import { Router } from 'express';
import { ler, gravar } from './armazenamento.js';
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
      { key: 'indicacao', nome: 'Indicação' },
      { key: 'facebook', nome: 'Facebook / Instagram' }, { key: 'outro', nome: 'Outro' },
    ],
    primeiroContatoAtivo: false, // liga/desliga a automação de primeiro contato inteira
    // Em que dias da semana o atendimento automático age (vazio = todos). O jeito da Legal Way:
    // 'sab,dom' — fim de semana o sistema atende sozinho, durante a semana o vendedor pega na mão.
    diasAutomatico: 'sab,dom',
    // A mensagem chega no número oficial de entrada, mas quem liga é o consultor, de OUTRO número.
    // Por isso o texto diz o nome e o número de quem vai chamar — senão o cliente não atende.
    // Resposta automática assim que a pessoa manda mensagem no WhatsApp.
    // Sai no máximo uma vez a cada 12 h por pessoa.
    respostaAutomaticaAtiva: true,
    respostaAutomaticaWhatsapp: 'Oi, {cliente}! Seja muito bem-vindo(a) à {empresa} 💙\n\nRecebemos sua mensagem e já estamos com ela aqui. Em breve um consultor fala com você.',
    mensagemPrimeiroContato: 'Oi, {cliente}! Seja bem-vindo(a) à {empresa} 💙\n\nQuem vai te acompanhar é {vendedor}. Ele(a) te chama {quando} pelo número {numero} — já salva esse contato pra não perder a ligação 📲',
    distribuicao: 'manual', // manual | disponibilidade | rodizio
    // Quem pode ficar com um lead no nome. Vale para assumir na Entrada, para ser
    // destino de uma transferência e para receber lead lançado direto no Funil.
    // Nome como está no cadastro de usuários, igual a agenda.disponibilidade.
    // Vazio = qualquer pessoa com permissão de editar a Entrada de Leads (como era antes).
    // É regra de atendimento, não de segurança: o servidor continua barrando por
    // permissão de módulo, então quem não pode editar Leads não grava nada.
    quemPegaLead: [],
    // Primeiro contato por origem (Legal Way: WhatsApp atribui e agenda; formulário fica pro vendedor captar)
    primeiroContato: [
      { origem: 'whatsapp', atribuir: 'sim', agendarLigacao: 'sim', mensagemAutomatica: 'sim' },
      { origem: 'formulario', atribuir: 'nao', agendarLigacao: 'nao', mensagemAutomatica: 'nao' },
      { origem: 'google_ads', atribuir: 'nao', agendarLigacao: 'nao', mensagemAutomatica: 'nao' },
      { origem: 'indicacao', atribuir: 'nao', agendarLigacao: 'nao', mensagemAutomatica: 'nao' },
      // Lead de formulário do Facebook chega frio e em volume: atribui e agenda,
      // igual ao WhatsApp, porque esfriar aqui custa caro.
      { origem: 'facebook', atribuir: 'sim', agendarLigacao: 'sim', mensagemAutomatica: 'sim' },
    ],
    antecedenciaMin: 30, janelaWhatsappHoras: 24,
  },
  funil: {
    // Enxugado a pedido dela em 23/10/2026: nove etapas viraram cinco. As que
    // saíram descreviam o esforço do vendedor ("Tentativa de contato",
    // "Qualificação", "Reunião realizada", "Proposta"), não o lugar do lead —
    // e um lead parado em "Proposta" e outro em "Negociação" são a mesma
    // conversa para quem olha o quadro.
    etapas: ['Lead Assumido', 'Contato realizado', 'Reunião agendada', 'Negociação/Fechamento', 'Ganho'],
    etapaGanho: 'Ganho',
    motivosSaida: ['Sem contato', 'Não qualificado', 'Sem interesse', 'Follow-up futuro', 'Perdido', 'Repescagem', 'Reativação futura'],
    // Coluna fixa no fim do quadro. Não entra em `etapas` de propósito: ela não é
    // um passo do funil, é o fim da linha — e assim o escritório pode renomear ou
    // reordenar as etapas sem nunca perder o lugar de registrar a perda.
    etapaPerdido: 'Perda',
    // `meta: true` manda a perda para a otimização de anúncios. Fica motivo a
    // motivo porque nem toda perda é sinal de público errado: quem achou caro
    // era o público certo e a campanha acertou — tirar esse perfil do alcance
    // faria o anúncio piorar, não melhorar.
    // `opcoes` abre um segundo campo no momento do registro (ex.: qual delas).
    motivosPerda: [
      { motivo: 'Nacionalidade', opcoes: 'africano, haitiano, outras', meta: true },
      { motivo: 'Achou caro', opcoes: '', meta: false },
      { motivo: 'Foi com outro escritório', opcoes: '', meta: false },
      { motivo: 'Desistiu do processo', opcoes: '', meta: false },
      { motivo: 'Não tem perfil para o visto', opcoes: '', meta: false },
      { motivo: 'Sumiu — parou de responder', opcoes: '', meta: false },
      { motivo: 'Sem a documentação necessária', opcoes: '', meta: false },
      { motivo: 'Vai fazer por conta própria', opcoes: '', meta: false },
      { motivo: 'Sem condição financeira agora', opcoes: '', meta: false },
      { motivo: 'Outro', opcoes: '', meta: false },
    ],
    diasLeadParado: 3,
  },
  sdr: {
    faixas: [{ ate: 10, aCadaDias: 1 }, { ate: 30, aCadaDias: 2 }, { ate: 50, aCadaDias: 3 }],
    limiteBaixaPrioridade: 50,

    // Prioridade por idade do lead: quanto mais recente, mais prioridade.
    // A fila do SDR só cresce — sem isso, em pouco tempo tudo vira "cadência
    // diária" e a fila fica impossível de vencer. Rodada uma vez por dia pelas
    // automações, então um lead desce de faixa sozinho conforme envelhece.
    prioridadePorIdadeAtiva: true,
    prioridadePorIdade: [
      { ateDias: 30,  cadencia: 'diaria',   baixaPrioridade: false },
      { ateDias: 90,  cadencia: 'a_cada_2', baixaPrioridade: false },
      { ateDias: 120, cadencia: 'a_cada_3', baixaPrioridade: false },
      { ateDias: null, cadencia: 'a_cada_3', baixaPrioridade: true },  // null = daí em diante
    ],
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
    // Ligue SÓ depois que alguém do escritório revisar as traduções do contrato, cláusula por
    // cláusula. Enquanto estiver desligado, o contrato em português ou espanhol sai com um aviso
    // de "pendente de revisão jurídica" — no documento e no PDF.
    idiomasRevisados: false,
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
    categorias: ['Marketing', 'Software', 'Salários', 'Escritório', 'Impostos', 'Serviço de terceiros', 'Comissão SDR'],
    centrosCusto: ['Vendas', 'Documentação', 'Administrativo'],
    // Categoria que o sistema usa nas contas geradas sozinho pro pessoal de fora (tradução,
    // avaliação psicológica). O tipo do serviço continua aparecendo na descrição.
    categoriaPrestadores: 'Serviço de terceiros',
    diasAvisoVencimento: 3, gateProtocolo: true, percentualMinimoProtocolo: 0,
    // Cobrança pelo Stripe.
    //
    // `formas` é a decisão mais cara desta seção. Medido no recebível em aberto
    // de 19/10 (US$ 701.473,81 em 2.030 parcelas): se tudo entrar por CARTÃO, a
    // taxa é ~US$ 20.950 (2,99%); por DÉBITO ACH, ~US$ 5.560 (0,79%). Diferença
    // de ~US$ 15.390. O ACH já está habilitado na conta.
    // O preço do ACH é o prazo: cartão confirma na hora, ACH confirma em dias e
    // pode falhar depois — por isso a parcela passa por "Processando".
    // Cliente sem conta bancária nos EUA só consegue pagar por cartão, então
    // tirar o cartão da lista deixaria gente sem como pagar.
    //   'card'            — cartão, Apple Pay, Amazon Pay, Cash App
    //   'us_bank_account' — débito ACH
    stripe: {
      formas: ['card'],
      // Nome que vai no campo "forma de pagamento" da parcela. O histórico usa
      // "Stripe Recebimentos"; usar o mesmo nome agrupa com o passado, usar
      // outro separa o que foi cobrado pela plataforma. É escolha de relatório.
      formaPagamento: 'Stripe',
      // Minutos de validade do link (0 = não expira). Link antigo é risco: a
      // pessoa paga num link de meses atrás, de parcela já baixada por Zelle.
      linkExpiraMinutos: 0,
      // O dinheiro fica na Stripe antes de ir para o banco, e é por isso que
      // "Stripe" precisa existir como CONTA, não só como forma de recebimento:
      // sem um lugar para o dinheiro ficar no meio do caminho, a parcela é
      // baixada e o valor desaparece até reaparecer na Truist.
      // Cadastre "Stripe" em Contas bancárias para o saldo fechar.
      contaStripe: 'Stripe',
      contaRepasse: 'Truist',
    },
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
  // Cada departamento fala com o cliente pelo seu proprio numero oficial. Hoje o numero e o
  // remetente sugerido (a mensagem sai pronta e a pessoa do setor envia); quando o canal de envio
  // automatico estiver ligado, e por esse numero que a mensagem vai sair sozinha.
  setores: {
    envioAutomatico: false,          // liga quando o canal estiver conectado — até lá a mensagem fica pronta pra enviar
    // manual — a mensagem fica pronta e a pessoa do setor envia
    // waha   — sessão de WhatsApp Web por número de setor
    // O número oficial da Meta NÃO entra aqui: ele é a porta de entrada dos
    // leads e só responde dentro da janela de 24 h. Setor que fala quando quer
    // fala por WAHA.
    canal: 'manual',
    avisoAntesCobrancaDias: 1,       // avisa o cliente com quantos dias de antecedência da cobrança
    // `sessao` é o nome da sessão no WAHA, uma por número. Sem ela o setor não envia.
    lista: [
      { key: 'documentos', nome: 'Documentação', numero: '', responsavel: '', sessao: '' },
      { key: 'financeiro', nome: 'Financeiro', numero: '', responsavel: '', sessao: '' },
      { key: 'comercial', nome: 'Comercial', numero: '', responsavel: '', sessao: '' },
    ],
  },
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

// ---------------------------------------------------------------------------
// Migrações de regras já salvas.
//
// As regras do escritório ficam gravadas no banco. Trocar o padrão no código
// não muda o que já está salvo — e foi o que aconteceu quando as nove etapas do
// funil viraram cinco: a tela continuou mostrando as antigas, porque eram as
// dela que valiam.
//
// Pedir para o escritório reescrever a lista à mão é empurrar para a pessoa um
// trabalho que é nosso. Então o sistema migra sozinho, com uma regra estreita:
// só mexe no que está EXATAMENTE igual ao padrão antigo. Lista customizada não
// é tocada — quem escreveu as próprias etapas decidiu, e decisão de gente não
// se sobrescreve.
// ---------------------------------------------------------------------------
const FUNIL_ANTIGO = ['Lead assumido', 'Tentativa de contato', 'Contato realizado', 'Qualificação',
  'Reunião agendada', 'Reunião realizada', 'Proposta', 'Negociação', 'Ganho'];

const igual = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((x, i) => x === b[i]);

export function migrarRegrasSalvas(custom) {
  if (!ehObj(custom) || !ehObj(custom.funil)) return { regras: custom, mudou: false };
  let mudou = false;
  const funil = { ...custom.funil };
  if (igual(funil.etapas, FUNIL_ANTIGO)) {
    funil.etapas = REGRAS_PADRAO.funil.etapas.slice();
    mudou = true;
  }
  // A coluna de perda só é renomeada junto com as etapas: sozinha, "Perdido"
  // pode ser escolha do escritório.
  if (mudou && funil.etapaPerdido === 'Perdido') funil.etapaPerdido = REGRAS_PADRAO.funil.etapaPerdido;
  return mudou ? { regras: { ...custom, funil }, mudou: true } : { regras: custom, mudou: false };
}

let cache = { quando: 0, regras: null };
export async function obterRegras() {
  if (Date.now() - cache.quando < 5000 && cache.regras) return cache.regras;
  const r = await ler(CHAVE_REGRAS);
  const { regras: salvas, mudou } = migrarRegrasSalvas(r ? r.valor : null);
  // Grava a migração uma vez, para o histórico registrar o que mudou e para a
  // próxima leitura não precisar refazer a conta. Se a gravação falhar, a regra
  // migrada vale mesmo assim nesta passagem — a tela não pode ficar errada
  // esperando o banco.
  if (mudou) {
    try {
      await gravar(CHAVE_REGRAS, salvas, r ? r.versao : null, 'migração: etapas do funil');
      console.log('[regras] etapas do funil migradas para a lista nova');
    } catch (e) { console.error('[regras] não consegui gravar a migração do funil:', e.message); }
  }
  cache = { quando: Date.now(), regras: mesclarRegras(REGRAS_PADRAO, salvas) };
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
