// O id de um registro novo.
//
// O gerador antigo era `p + Date.now() + Math.floor(Math.random() * 1000)`, e
// ele COLIDE. Duas razões, as duas reais:
//
//  1. Mesmo milissegundo, mesmo sorteio. São 1.000 valores possíveis, e as
//     automações criam doze parcelas de uma vez: pelo problema do aniversário,
//     com algumas dezenas de registros no mesmo ms a chance deixa de ser
//     remota. Na cópia local havia 39 pares de parcelas com id repetido, de
//     CLIENTES DIFERENTES.
//
//  2. Sem separador e com comprimento variável, "...07" + "66" dá o mesmo
//     texto que "...076" + "6". Dois instantes distintos, um id só.
//
// Por que isso é o pior defeito possível aqui: a mescla do servidor casa os
// registros por id. Dois com o mesmo id e um apaga o outro em silêncio — sem
// erro, sem aviso, sem nada no histórico. Não existe chave primária no JSON
// para impedir.
//
// Agora são 12 caracteres de acaso vindos de crypto, mais o instante em base
// 36 para os ids nascerem ordenáveis por data.

import { randomBytes } from 'node:crypto';

export function novoId(prefixo = '') {
  return String(prefixo) + Date.now().toString(36) + '-' + randomBytes(6).toString('hex');
}
