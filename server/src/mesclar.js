// Mesclagem em 3 vias de blocos JSON: base (o que a pessoa leu), atual (o que está no servidor agora)
// e novo (o que a pessoa quer salvar). Usada quando alguém salva por cima de uma versão já alterada por outro.
// Regra: cada item (identificado por `id`) que EU mudei em relação à base vence; o que eu não toquei fica como está no servidor.

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const temIds = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every(x => x && typeof x === 'object' && x.id !== undefined);
const porId = (arr) => new Map(arr.map(x => [String(x.id), x]));

export function mesclar(base, atual, novo) {
  // listas de itens com id (leads, contratos, tarefas...) — o caso de quase todos os módulos
  if (temIds(atual) && (temIds(novo) || (Array.isArray(novo) && novo.length === 0)) && (temIds(base) || (Array.isArray(base) && base.length === 0))) {
    return mesclarListas(base, atual, novo);
  }
  // objetos simples (configurações, mapas por mês...) — mescla por chave de 1º nível
  if (ehObjeto(base) && ehObjeto(atual) && ehObjeto(novo)) {
    const r = { ...atual };
    for (const k of new Set([...Object.keys(base), ...Object.keys(novo)])) {
      const mudei = !igual(base[k], novo[k]);
      if (mudei) { if (novo[k] === undefined) delete r[k]; else r[k] = novo[k]; }
    }
    return r;
  }
  return novo; // sem estrutura reconhecível: quem salvou por último vence
}

function mesclarListas(base, atual, novo) {
  const mBase = porId(base), mNovo = porId(novo);
  const resultado = [];
  const vistos = new Set();
  // 1) percorre o que está no servidor: mantém, substitui pelo meu se eu mudei, remove se eu apaguei
  for (const item of atual) {
    const id = String(item.id);
    vistos.add(id);
    const naBase = mBase.get(id), noNovo = mNovo.get(id);
    if (noNovo !== undefined) {
      const mudei = naBase === undefined || !igual(naBase, noNovo);
      resultado.push(mudei ? noNovo : item);
    } else if (naBase !== undefined) {
      // eu apaguei; só apaga mesmo se ninguém mexeu nele desde que eu li
      if (!igual(naBase, item)) resultado.push(item);
    } else {
      resultado.push(item); // outro adicionou enquanto eu editava
    }
  }
  // 2) itens que eu adicionei (não estavam no servidor): entram na posição em que eu coloquei
  novo.forEach((item, i) => {
    const id = String(item.id);
    if (vistos.has(id)) return;
    const pos = i < novo.length / 2 ? Math.min(i, resultado.length) : resultado.length;
    resultado.splice(pos, 0, item);
  });
  return resultado;
}

const ehObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v);
