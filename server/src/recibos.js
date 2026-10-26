// Os números de recibo do USCIS de um processo — no PLURAL.
//
// Um caso não tem um número só. O Visto T do Esdras, por exemplo, tem dois:
// o I-914 (a petição do visto) e o I-765 (a autorização de trabalho), cada um
// com seu próprio número e seu próprio andamento no USCIS. Até agora o sistema
// guardava UM campo, e o escritório empilhava o resto dentro de "Observações"
// como texto solto — onde nada é consultado e nada avisa quando muda.
//
// Formato do número: 3 letras + 10 dígitos (ex.: LIN2701050105). As letras são
// o centro do USCIS que processa (LIN, SRC, IOE, EAC, WAC, MSC, NBC, YSC).
//
// COMPATIBILIDADE: o campo antigo `protocolo.recibo` (texto único) continua
// sendo lido e entra na lista como o primeiro item. Nenhuma ficha precisa ser
// migrada, e nenhum dos 15 pontos que leem `protocolo.recibo` quebra.
//
// O espelho disto vive em docs/assets/comum.js (LW.recibosDoProcesso), e
// server/testes/recibos-do-processo.test.js prova que os dois respondem igual.

export const RE_RECIBO = /^[A-Z]{3}\d{10}$/;

/** Normaliza um número digitado: maiúsculas, sem espaços nem traços. */
export function normalizarRecibo(x) {
  return String(x == null ? '' : x).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const reciboValido = (x) => RE_RECIBO.test(normalizarRecibo(x));

/**
 * A lista de recibos do processo, já normalizada e sem repetidos.
 * Cada item: { form, numero }. `form` é o rótulo que a pessoa escolheu
 * (I-765, I-914…) e pode vir vazio — inclusive no registro antigo, que não
 * tinha onde guardar isso.
 */
export function recibosDoProcesso(p) {
  const pr = (p && p.protocolo) || {};
  const out = [];
  const vistos = new Set();
  const add = (form, numero) => {
    const n = normalizarRecibo(numero);
    if (!n || vistos.has(n)) return;      // vazio ou repetido não entra duas vezes
    vistos.add(n);
    out.push({ form: String(form == null ? '' : form).trim().toUpperCase(), numero: n });
  };
  for (const r of (Array.isArray(pr.recibos) ? pr.recibos : [])) if (r) add(r.form, r.numero);
  // O campo único antigo entra por último para não roubar a posição de quem
  // foi cadastrado de propósito — mas, se for o único, vira o principal.
  add('', pr.recibo);
  return out;
}

/** Só os que o USCIS aceitaria consultar. */
export const recibosConsultaveis = (p) => recibosDoProcesso(p).filter((r) => RE_RECIBO.test(r.numero));

/**
 * O recibo PRINCIPAL: o primeiro da lista. É ele que continua espelhado em
 * `protocolo.recibo` e no topo de `p.uscis`, para as telas e avisos que
 * mostram um status só não precisarem saber que agora são vários.
 */
export const reciboPrincipal = (p) => (recibosDoProcesso(p)[0] || {}).numero || '';

/** Como se escreve um recibo numa frase para gente ler. */
export const rotuloDoRecibo = (r) => (r && r.form ? `${r.form} ${r.numero}` : (r && r.numero) || '');
