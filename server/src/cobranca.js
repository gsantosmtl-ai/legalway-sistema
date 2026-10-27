// Cobrança do contrato ≠ cobrança adicional.
//
// Regra dela, 27/10/2026: "o contrato foi de 5 mil e o cliente pagou 5.105 —
// foi porque ele está pagando a tradução. Pode ter sido taxa, SEVIS, laudo.
// Antigamente eles juntavam ali no número da parcela; agora vão registrar
// itens separados. Cobrança do contrato é uma coisa, cobranças adicionais ao
// serviço contratado são outra, e não vão juntar no número da parcela."
//
// Isso muda três lugares:
//   · a numeração — "Parcela 3/15" conta só o que é do contrato;
//   · a conciliação — contrato de 5.000 com 5.105 cobrados não é divergência,
//     são 5.000 de contrato mais 105 de tradução;
//   · a mensagem ao cliente — um adicional diz o que é ("Tradução"), não um
//     número de parcela que não existe.
//
// Para o que já está na base, o tipo é DEDUZIDO do texto: são anos de
// lançamento sem esse campo, e reescrever todos sem olhar seria pior. Para o
// que entrar daqui para frente, o campo `cobranca` manda, e a dedução nem é
// consultada.

export const ADICIONAIS = ['tradução', 'taxa', 'laudo', 'outro'];

// O que, no texto de um lançamento antigo, denuncia um adicional. Palavras
// escolhidas uma a uma a partir do que existe na base — nada genérico como
// "extra", que apareceria em frase solta e classificaria errado.
const PISTAS = [
  [/tradu[çc][ãa]o|translat/i, 'tradução'],
  [/\bsevis\b|\bi-?901\b/i, 'taxa'],
  [/taxa|fee\b|uscis fee|pagamento das taxas/i, 'taxa'],
  [/laudo|per[íi]cia|avalia[çc][ãa]o m[ée]dica/i, 'laudo'],
];

const texto = (f) => [f && f.descricao, f && f.observacao].map((x) => String(x || '')).join(' ');

/** 'contrato' ou 'adicional'. O campo gravado sempre ganha da dedução. */
export function tipoDeCobranca(f) {
  const marcado = f && f.cobranca && typeof f.cobranca === 'object' ? f.cobranca : null;
  if (marcado && (marcado.tipo === 'contrato' || marcado.tipo === 'adicional')) return marcado.tipo;
  return PISTAS.some(([re]) => re.test(texto(f))) ? 'adicional' : 'contrato';
}

/** Que tipo de adicional é — para a mensagem dizer o nome, não um número. */
export function itemAdicional(f) {
  if (tipoDeCobranca(f) !== 'adicional') return '';
  const marcado = f && f.cobranca && typeof f.cobranca === 'object' ? f.cobranca : null;
  if (marcado && ADICIONAIS.includes(marcado.item)) return marcado.item;
  const achou = PISTAS.find(([re]) => re.test(texto(f)));
  return achou ? achou[1] : 'outro';
}

export const ehDoContrato = (f) => tipoDeCobranca(f) === 'contrato';

/**
 * Como a cobrança se apresenta ao cliente.
 *
 * Só o que é do contrato recebe número, e o número conta apenas as irmãs do
 * contrato — era isso que ficava errado quando a tradução entrava no meio e
 * empurrava a contagem.
 */
export function rotuloDaCobranca(f, todasDoContrato) {
  const propria = String((f && f.descricao) || '').trim();
  if (propria) return propria;

  if (!ehDoContrato(f)) {
    const item = itemAdicional(f);
    return item === 'outro' ? 'cobrança adicional' : item;
  }

  const contrato = f && f.contratoId;
  if (!contrato) return 'parcela';
  const irmas = (todasDoContrato || []).filter((x) => x && x.contratoId === contrato && ehDoContrato(x));
  if (irmas.length > 1) {
    const ordem = irmas.slice().sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')));
    const i = ordem.findIndex((x) => x.id === f.id);
    if (i >= 0) return `parcela ${i + 1}/${ordem.length}`;
  }
  if (irmas.length === 1) return 'parcela única';
  return 'parcela';
}

/** O que o contrato de fato cobra, sem os adicionais. */
export function somaDoContrato(todasDoContrato, contratoId) {
  return (todasDoContrato || [])
    .filter((f) => f && f.contratoId === contratoId && ehDoContrato(f))
    .reduce((s, f) => s + Number(f.valor || 0), 0);
}
