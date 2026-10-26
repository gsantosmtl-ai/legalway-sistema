// O número que a gente fala em voz alta.
//
// Pedido dela: "importante que tudo tenha número de proposta, número de
// contrato, número de cliente, número de processo... tenha uma lógica para não
// se perder as informações".
//
// Hoje cada registro tem um id tipo `cbrsdlduk74ur`. Isso serve ao banco e não
// serve a ninguém: não dá para ditar no telefone, nem anotar num papel, nem
// procurar. O número existe para isso.
//
//   CL-0001  cliente
//   PR-0001  proposta (o lead no funil comercial)
//   CT-0001  contrato
//   PC-0001  processo (o card da Documentação)
//
// TRÊS REGRAS, e as três existem para o número não virar outro problema:
//
// 1. O número NÃO substitui o id. Ele entra como campo novo (`codigo`) ao
//    lado. Os vínculos entre blocos são todos por id — trocar isso quebraria
//    tudo de uma vez, e sem ganho nenhum.
//
// 2. Uma vez dado, nunca muda. Um número que se mexe é pior que nenhum: a
//    pessoa anotou CT-0042 no papel e amanhã é outro contrato. Por isso o
//    próximo número sai do MAIOR já existente, e não da quantidade de
//    registros — apagar um registro não pode fazer o número seguinte repetir
//    um que já foi usado.
//
// 3. O campo se chama `codigo`, não `numero`. `numero` já é o número da
//    parcela, o do protocolo e o do telefone do setor. Mais um significado no
//    mesmo nome e ninguém mais sabe do que se fala.
//
// O espelho vive em docs/assets/comum.js (LW.codigoDe, LW.formatarCodigo).

export const PREFIXO = { cliente: 'CL', proposta: 'PR', contrato: 'CT', processo: 'PC' };
const LARGURA = 4;

/** 7 -> 'CT-0007'. Acima de 9999 cresce em vez de truncar. */
export function formatarCodigo(tipo, n) {
  const p = PREFIXO[tipo];
  if (!p || !Number.isFinite(Number(n)) || Number(n) < 1) return '';
  return p + '-' + String(Math.floor(Number(n))).padStart(LARGURA, '0');
}

/** 'CT-0007' -> 7. Qualquer outra coisa -> 0. */
export function numeroDoCodigo(codigo) {
  const m = /^([A-Z]{2})-(\d+)$/.exec(String(codigo || '').trim().toUpperCase());
  return m ? Number(m[2]) : 0;
}

/** O maior número já usado neste bloco. */
export function maiorCodigo(lista) {
  let maior = 0;
  for (const r of (Array.isArray(lista) ? lista : [])) {
    const n = numeroDoCodigo(r && r.codigo);
    if (n > maior) maior = n;
  }
  return maior;
}

/**
 * Dá número a quem ainda não tem, em ordem de CRIAÇÃO — o mais antigo fica
 * com o menor número, que é o que qualquer pessoa espera.
 *
 * Quem já tem número NÃO é tocado, nem para "arrumar" a ordem: o número é um
 * endereço, não uma classificação.
 *
 * Devolve quantos ganharam número. Não grava nada — quem grava é quem chamou.
 */
export function numerar(lista, tipo) {
  if (!Array.isArray(lista) || !PREFIXO[tipo]) return 0;
  const semCodigo = lista.filter((r) => r && typeof r === 'object' && !numeroDoCodigo(r.codigo));
  if (!semCodigo.length) return 0;
  // Sem data de criação vai para o fim, em vez de disputar com quem tem: data
  // ausente ordenada como '' viraria o registro mais antigo de todos.
  const quando = (r) => String(r.criadoEm || r.dataAssinatura || r.quando || '￿');
  semCodigo.sort((a, b) => quando(a).localeCompare(quando(b)));
  let proximo = maiorCodigo(lista) + 1;
  for (const r of semCodigo) r.codigo = formatarCodigo(tipo, proximo++);
  return semCodigo.length;
}

/** O código de um registro, ou '' quando ainda não tem. */
export const codigoDe = (r) => (r && typeof r.codigo === 'string' && numeroDoCodigo(r.codigo)) ? r.codigo : '';
