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

// O raio-X de UM contrato, com os lançamentos, os cards e o cliente.
//
// Existe para a tela não precisar baixar os blocos inteiros só para mostrar o
// detalhe de um caso. O de fichas tem milhares de anexos; puxá-lo no navegador
// é a leitura pesada que já derrubou o servidor. Aqui sai só o que é daquele
// contrato, sem anexo nenhum.
rotasConciliacao.get('/conciliacao/contrato/:id', exigirLogin, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const [contratos, clientes, contas, processos] = await Promise.all(
      [K.contratos, K.clientes, K.contas, K.processos].map(lista));
    const c = contratos.find(x => x && x.id === id);
    if (!c) return res.status(404).json({ erro: 'Contrato não encontrado.' });

    const semAcento = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const ls = contas.filter(x => x && x.contratoId === id);
    const fichas = processos.filter(p => p && p.contratoId === id);
    const dono = clientes.filter(x => semAcento(x.nome) === semAcento(c.cliente));

    // O diagnóstico vem do mesmo motor, rodado só para este contrato, para a
    // tela de detalhe nunca discordar do painel.
    const diag = conciliar({ contratos: [c], clientes: dono, contas: ls, processos: fichas,
      checklists: await lista(K.checklists) }).contratos[0] || null;

    res.json({
      contrato: { id: c.id, cliente: c.cliente, valor: c.valor, entrada: c.entrada,
        numParcelas: c.numParcelas, etapa: c.etapa, servico: c.servico, servicos: c.servicos || null,
        dataAssinatura: c.dataAssinatura || null, vendedor: c.vendedor || '',
        historico: (c.historico || []).slice(-12) },
      cliente: dono.map(x => ({ id: x.id, nome: x.nome, telefone: x.telefone || '',
        contratos: (x.contratoIds || []).length, ligadoAEste: (x.contratoIds || []).includes(id) })),
      lancamentos: ls.map(x => ({ id: x.id, descricao: x.descricao, valor: x.valor,
        valorRecebido: x.valorRecebido || 0, status: x.status, vencimento: x.vencimento,
        dataRecebimento: x.dataRecebimento || null })),
      cards: fichas.map(p => ({ id: p.id, servico: p.servico, status: p.status,
        situacao: p.situacao || 'ativo', responsavel: p.responsavel || '',
        documentos: (p.checklist || []).length,
        comArquivo: (p.checklist || []).filter(dd => dd.arquivo || (dd.arquivos || []).length).length,
        anexos: (p.anexos || []).length })),
      diagnostico: diag,
    });
  } catch (e) { next(e); }
});

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
