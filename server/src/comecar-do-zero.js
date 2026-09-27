// "Começar do zero": tira os dados de demonstração e deixa o sistema pronto pro escritório usar
// de verdade. Todo escritório que instala o sistema precisa disso uma vez.
//
// O que ESVAZIA: leads, funil, SDR, agenda, contratos, clientes, contas a receber e a pagar,
// processos da documentação, tarefas, marcos e os acessos de portal de cliente.
// O que MANTÉM: dados da empresa, regras, usuários e senhas, serviços, checklists por serviço,
// modelos de contrato, templates de mensagem, contas bancárias, categorias e prestadores.
//
// Antes de esvaziar, guarda uma cópia de segurança completa — dá pra voltar tudo por ela.
// Cada bloco esvaziado também vira uma versão no histórico, então nada se perde de verdade.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { exigirLogin } from './auth.js';
import { gravar } from './armazenamento.js';
import { backupAgora } from './backup.js';

const ESVAZIAR = [
  'legalway-leads-v1', 'legalway-funil-v1', 'legalway-sdr-v1', 'legalway-agenda-v1',
  'legalway-contratos-v1', 'legalway-clientes-v1', 'legalway-financeiro-v1', 'legalway-contas-pagar-v1',
  'legalway-processos-documentacao-v1', 'legalway-tarefas-v1', 'legalway-doc-marcos-v1',
  'legalway-notif-autorizacoes-vistas-v1', 'legalway-avisos-enviados-v1',
];

const uid = (p) => p + Date.now() + Math.floor(Math.random() * 1000);

function leadDeExemplo(servico) {
  const agora = new Date().toISOString();
  return {
    id: uid('ld'),
    nome: 'Ana Demonstração',
    telefone: '+1 407 555 0100',
    email: 'ana.demonstracao@exemplo.com',
    servico: servico || 'EB-2 NIW',
    campanha: 'Primeiro passeio pelo sistema',
    origens: ['formulario'],
    entrada: agora,
    responsavel: null,
    historico: [{ tipo: 'Formulário', quando: agora, texto: 'Preencheu o formulário do site — lead de exemplo pra percorrer o caminho completo' }],
  };
}

export const rotasComecarDoZero = Router();
// Guard rota a rota: o router é montado em '/api' e um `use()` sem caminho pegaria tudo que vier depois.

// Mostra o que existe hoje, pra pessoa ver o tamanho do estrago antes de confirmar.
rotasComecarDoZero.get('/comecar-do-zero/previa', exigirLogin, async (req, res, next) => {
  try {
    if (!req.usuario.acesso_total) return res.status(403).json({ erro: 'Só quem tem acesso total vê isso.' });
    const { rows } = await query('SELECT chave, valor FROM armazenamento WHERE chave = ANY($1)', [ESVAZIAR]);
    const conta = (v) => { let x = typeof v === 'string' ? JSON.parse(v) : v; if (typeof x === 'string') x = JSON.parse(x); return Array.isArray(x) ? x.length : 0; };
    const modulos = rows.map(r => ({ chave: r.chave, registros: conta(r.valor) })).filter(m => m.registros > 0);
    const portal = await query('SELECT count(*)::int n FROM portal_clientes');
    res.json({ modulos, total: modulos.reduce((s, m) => s + m.registros, 0), acessosPortal: portal.rows[0].n });
  } catch (e) { next(e); }
});

rotasComecarDoZero.post('/comecar-do-zero', exigirLogin, async (req, res, next) => {
  try {
    if (!req.usuario.acesso_total) return res.status(403).json({ erro: 'Só quem tem acesso total pode limpar o sistema.' });
    const senha = String(req.body?.senha || '');
    if (!(await bcrypt.compare(senha, req.usuario.senha_hash))) return res.status(401).json({ erro: 'Senha incorreta.' });

    // 1) rede de proteção primeiro: se algo der errado, volta por aqui
    const copia = await backupAgora('antes de começar do zero');

    // 2) esvazia os módulos do dia a dia
    const zerados = [];
    for (const chave of ESVAZIAR) {
      await gravar(chave, [], null, req.usuario.nome, null, 'começar do zero');
      zerados.push(chave);
    }

    // 3) acesso de cliente ao portal não faz sentido sem o processo dele
    const portal = await query('DELETE FROM portal_clientes RETURNING id');
    await query('DELETE FROM sessoes_portal');

    // 4) um lead de exemplo, quando pedido
    let lead = null;
    if (req.body?.comLeadDeExemplo) {
      lead = leadDeExemplo(req.body?.servico);
      await gravar('legalway-leads-v1', [lead], null, req.usuario.nome, null, 'começar do zero');
    }

    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, 'confirmacao', null, 'removido',
       `Começar do zero: ${zerados.length} módulos esvaziados, ${portal.rowCount} acesso(s) de portal removidos, backup ${copia.id} guardado antes${lead ? ', 1 lead de exemplo criado' : ''}`]);

    res.json({ ok: true, modulosZerados: zerados.length, acessosPortalRemovidos: portal.rowCount, backupId: copia.id, lead });
  } catch (e) { next(e); }
});
