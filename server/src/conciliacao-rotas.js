// A rota da Conciliação de Fluxo.
//
// Separada de conciliacao.js de propósito: aquele arquivo é função pura e não
// pode importar banco, senão os testes precisariam de Postgres para rodar.
//
// A conta é feita AQUI, no servidor, e não na tela. O bloco de fichas tem
// milhares de anexos; mandá-lo inteiro para o navegador é a leitura pesada que
// já derrubou o container. O navegador recebe só o diagnóstico, que é pequeno.
import { Router } from 'express';
import { ler } from './armazenamento.js';
import { exigirLogin } from './auth.js';
import { conciliar } from './conciliacao.js';

export const rotasConciliacao = Router();

const K = {
  contratos: 'legalway-contratos-v1',
  clientes: 'legalway-clientes-v1',
  contas: 'legalway-financeiro-v1',
  processos: 'legalway-processos-documentacao-v1',
  checklists: 'legalway-checklists-v1',
};

// 60 segundos. A varredura passa por todos os contratos e todos os
// lançamentos; com várias pessoas abrindo a tela ao mesmo tempo, refazer a
// conta a cada F5 é desperdício puro — e o diagnóstico não muda de segundo em
// segundo.
const CACHE_MS = 60 * 1000;
let cache = { quando: 0, dados: null };

const lista = async (chave) => {
  const r = await ler(chave);
  return Array.isArray(r && r.valor) ? r.valor : [];
};

export async function diagnosticoAgora() {
  const [contratos, clientes, contas, processos, checklists] = await Promise.all(
    [K.contratos, K.clientes, K.contas, K.processos, K.checklists].map(lista));
  return conciliar({ contratos, clientes, contas, processos, checklists });
}

rotasConciliacao.get('/conciliacao', exigirLogin, async (req, res, next) => {
  try {
    const agora = Date.now();
    if (!cache.dados || agora - cache.quando > CACHE_MS || req.query.recalcular === '1') {
      cache = { quando: agora, dados: await diagnosticoAgora() };
    }
    const d = cache.dados;
    // `resumo=1` para o cartão do Dashboard: devolve só os números, sem a
    // lista de contratos, que é o que pesa na resposta.
    if (req.query.resumo === '1') return res.json({ geradoEm: d.geradoEm, resumo: d.resumo });
    res.json(d);
  } catch (e) { next(e); }
});
