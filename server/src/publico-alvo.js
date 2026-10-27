// Quem recebe a mensagem.
//
// O pedido dela, com estas palavras: "sinto falta de um campo que eles consigam
// disparar as mensagens automáticas de acordo com a etapa do funil. Por
// exemplo, quero enviar uma mensagem somente para quem está no funil de
// documentos / que não faz processo externo / que está na etapa de recebendo
// documentações."
//
// Os gatilhos automáticos (avisos-automaticos.js) já cobrem o que é rotina:
// roda sozinho, no dia certo, para quem se encaixa. O que faltava é o contrário
// disso — a pessoa escolher o recorte na hora e falar com aquele grupo.
//
// Este arquivo só DECIDE QUEM. Não envia, não grava, não chama o WhatsApp: é
// uma função pura, do jeito que dá para testar sem banco e sem rede. Quem
// envia é a rota, depois que alguém de carne e osso olhou a lista.
// `chatId` normaliza o número do jeito que o WhatsApp precisa — e, de quebra,
// faz "407 555 1234" e "+1 407 555 1234" virarem a mesma pessoa. Deduplicar
// pelo telefone cru deixaria a mesma pessoa receber duas vezes; foi esse
// mesmo descuido que, no importador antigo, transformou 5 grafias em 3
// clientes quando era 1.
import { chatId } from './waha.js';

const CASA = 'Legal Way';

// Cada departamento guarda a etapa num campo com nome diferente — `etapa` no
// funil e nos contratos, `status` no SDR e nos processos. Mapear aqui evita
// espalhar esse detalhe pela tela.
export const DEPARTAMENTOS = {
  comercial: {
    rotulo: 'Comercial', chave: 'funil', campoEtapa: 'etapa', campoNome: 'nome', campoVendedor: 'vendedor',
    etapas: ['Lead Assumido', 'Contato realizado', 'Reunião agendada', 'Negociação/Fechamento', 'Ganho'],
  },
  sdr: {
    rotulo: 'SDR', chave: 'sdr', campoEtapa: 'status', campoNome: 'nome', campoVendedor: 'vendedorDestino',
    etapas: ['fila', 'baixa_prioridade', 'recuperado', 'encerrado'],
    rotulos: { fila: 'Fila SDR', baixa_prioridade: 'Baixa prioridade', recuperado: 'Recuperados', encerrado: 'Encerrados' },
  },
  contratos: {
    rotulo: 'Contratos', chave: 'contratos', campoEtapa: 'etapa', campoNome: 'cliente', campoVendedor: 'vendedor',
    etapas: ['A gerar', 'Em preparação', 'Aguardando assinatura', 'Assinado', 'Cancelado'],
  },
  documentos: {
    rotulo: 'Documentos', chave: 'processos', campoEtapa: 'status', campoNome: 'clienteNome', campoVendedor: 'vendedor',
    temExecucao: true,
    etapas: ['Aguardando boas-vindas', 'Documentos solicitados', 'Recebendo documentos', 'Documentação completa',
      'Aguardando autorização financeira', 'Liberado para protocolo', 'Protocolado', 'I-797', 'Biometria',
      'Em acompanhamento', 'Documento finalizado'],
  },
};

// Mesma regra da tela de Documentos: sem marcação, o processo é da casa. Foi
// decisão dela — "manter como padrão sempre Legal Way; quando não for, a
// Vitória altera".
export function execucaoDoProcesso(p) {
  const e = (p && p.execucao && typeof p.execucao === 'object') ? p.execucao : null;
  const tipo = e && (e.tipo === 'interno' || e.tipo === 'externo') ? e.tipo : null;
  if (tipo === 'externo') return { tipo: 'externo', quem: String(e.escritorio || '').trim(), padrao: false };
  if (tipo === 'interno') return { tipo: 'interno', quem: String(e.pessoa || '').trim() || CASA, padrao: false };
  return { tipo: 'interno', quem: CASA, padrao: true };
}

const texto = (v) => String(v == null ? '' : v).trim();
const iguala = (a, b) => texto(a).toLowerCase() === texto(b).toLowerCase();

/**
 * Monta a lista de quem recebe, a partir de um recorte.
 *
 * Devolve SEMPRE as três contas separadas — quem entra, quem ficou de fora por
 * não ter telefone, e quantos eram a mesma pessoa repetida. Um disparo que diz
 * só "47 pessoas" esconde que 12 não têm número e que 5 são a mesma pessoa em
 * dois processos; quem clica em enviar precisa ver isso antes, não depois.
 */
export function publicoAlvo(registros, filtro = {}) {
  const dep = DEPARTAMENTOS[filtro.departamento];
  if (!dep) return { erro: 'Departamento desconhecido: ' + filtro.departamento, pessoas: [], total: 0 };

  const lista = Array.isArray(registros) ? registros : [];
  const etapas = (filtro.etapas || []).map(texto).filter(Boolean);
  const servicos = (filtro.servicos || []).map(texto).filter(Boolean);
  const vendedores = (filtro.vendedores || []).map(texto).filter(Boolean);
  const execucao = filtro.execucao === 'interno' || filtro.execucao === 'externo' ? filtro.execucao : 'qualquer';

  const fora = { semTelefone: [], repetidos: [] };
  const porTelefone = new Map();
  let candidatos = 0;

  for (const r of lista) {
    if (!r || typeof r !== 'object') continue;

    const etapa = texto(r[dep.campoEtapa]);
    if (etapas.length) { if (!etapas.some((e) => iguala(e, etapa))) continue; }
    // Sem etapa escolhida, cancelado fica de fora: ninguém dispara em massa
    // querendo falar com quem já saiu. Para falar com eles, escolhe a etapa.
    else if (/^cancelad/i.test(etapa) || iguala(etapa, 'encerrado')) continue;

    if (servicos.length && !servicos.some((s) => iguala(s, r.servico))) continue;
    if (vendedores.length && !vendedores.some((v) => iguala(v, r[dep.campoVendedor]))) continue;

    if (dep.temExecucao && execucao !== 'qualquer') {
      if (execucaoDoProcesso(r).tipo !== execucao) continue;
    }

    candidatos++;
    const nome = texto(r[dep.campoNome]);
    const fone = chatId(r.telefone);
    const pessoa = {
      id: texto(r.id), codigo: texto(r.codigo), nome, telefone: texto(r.telefone),
      etapa, servico: texto(r.servico), vendedor: texto(r[dep.campoVendedor]),
    };
    if (dep.temExecucao) pessoa.execucao = execucaoDoProcesso(r).tipo;

    if (!fone) { fora.semTelefone.push(pessoa); continue; }
    if (porTelefone.has(fone)) { fora.repetidos.push({ ...pessoa, mesmoQue: porTelefone.get(fone).nome }); continue; }
    porTelefone.set(fone, pessoa);
  }

  const pessoas = [...porTelefone.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return {
    departamento: filtro.departamento, rotulo: dep.rotulo,
    total: pessoas.length, candidatos,
    semTelefone: fora.semTelefone, repetidos: fora.repetidos,
    pessoas,
  };
}

/** Troca {cliente}, {servico} e afins pelo que cada pessoa tem. */
export function mensagemPara(modelo, pessoa, extras = {}) {
  const valores = {
    cliente: texto(pessoa.nome).split(/\s+/)[0] || '',
    nomeCompleto: texto(pessoa.nome),
    servico: texto(pessoa.servico),
    etapa: texto(pessoa.etapa),
    vendedor: texto(pessoa.vendedor),
    ...extras,
  };
  return String(modelo == null ? '' : modelo).replace(/\{(\w+)\}/g, (inteiro, chave) => (
    Object.prototype.hasOwnProperty.call(valores, chave) ? valores[chave] : inteiro
  ));
}

/** As variáveis que a pessoa pode usar no texto, para a tela mostrar. */
export const VARIAVEIS = ['cliente', 'nomeCompleto', 'servico', 'etapa', 'vendedor', 'empresa'];
