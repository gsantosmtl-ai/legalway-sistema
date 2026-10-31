// Limpeza dos duplicados que a corrida entre a tela e o servidor deixou para trás.
// A causa foi corrigida (quem cria cliente e parcelas agora é só o servidor), mas os registros
// que já duplicaram continuam no banco — e não dá pra pedir que alguém arrume isso à mão em
// Clientes e Financeiro ao mesmo tempo.
//
// Regras, conservadoras de propósito — na dúvida, NÃO apaga:
// · Cliente: mesmo NOME (ignorando acento e caixa) — e, quando os dois têm telefone, o
//   telefone também tem de bater. Fica o mais antigo, que herda os contratos e o histórico.
//
//   TELEFONE IGUAL NÃO BASTA, e isto custou um susto em 30/10/2026: a régua antiga
//   casava por telefone sozinho, e teria juntado Marcelo Lorenzo Ribalta com Byanka
//   Barros Rivolli, e Simone Andrade Sampaio com Joao Vitor Sampaio de Oliveira.
//   São quatro pessoas, duas famílias, dois celulares compartilhados — e cada uma com
//   contrato próprio. Juntar isso não se desfaz.
//
//   O próprio sistema já sabia disso noutro canto: portal-cliente.js escreve que
//   "se o número já é de outro cliente (família que compartilha celular), o acesso
//   nasce só com e-mail em vez de falhar". A limpeza é que não tinha recebido o recado.
// · Conta a receber: mesmo contrato + mesma descrição + MESMO VENCIMENTO + MESMO VALOR. Fica a
//   que tem baixa (paga) — dinheiro registrado nunca é descartado — ou, se nenhuma tem, a mais
//   antiga. O vencimento e o valor entraram depois do estrago de 30/10/2026: sem eles, as
//   descrições genéricas ("Parcela", "Avulsa") faziam todas as parcelas de um contrato parecerem
//   a mesma, e 143 lançamentos foram apagados — 46 deles já pagos.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { exigirLogin } from './auth.js';
import { ler, gravar } from './armazenamento.js';
import { backupAgora } from './backup.js';

const K_CLIENTES = 'legalway-clientes-v1';
const K_RECEBER = 'legalway-financeiro-v1';

const soDigitos = (t) => String(t || '').replace(/\D/g, '');
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/**
 * A chave de um cliente, para achar o repetido.
 *
 * O NOME manda. O telefone entra como desempate, não como identidade: duas pessoas da
 * mesma família dividem o celular, e isso é comum no público do escritório.
 * Sem nome não há chave — registro sem nome não se junta a ninguém.
 */
const chaveCliente = (c) => {
  const nome = semAcento(c && c.nome);
  if (!nome) return '';
  const tel = soDigitos(c && c.telefone);
  return tel ? `${nome}|${tel}` : `${nome}|`;
};
const texto = (x) => String(x == null ? '' : x).trim();
const dinheiro = (x) => Math.round((Number(x) || 0) * 100);   // centavos, para não comparar float
const quando = (x) => new Date(x.criadoEm || 0).getTime() || 0;

async function bloco(chave) {
  const r = await ler(chave);
  return { valor: Array.isArray(r?.valor) ? r.valor : [], versao: r ? r.versao : null };
}

// Junta os clientes repetidos num só, preservando contratos e histórico
function juntarClientes(clientes) {
  const porChave = new Map();
  for (const c of clientes) {
    const k = chaveCliente(c);
    if (!k) continue;
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k).push(c);
  }
  const removidos = [];
  const resultado = [];
  const mantidos = new Set();
  for (const [, grupo] of porChave) {
    if (grupo.length === 1) { mantidos.add(grupo[0]); continue; }
    grupo.sort((a, b) => quando(a) - quando(b));
    const fica = grupo[0];
    for (const outro of grupo.slice(1)) {
      fica.contratoIds = [...new Set([...(fica.contratoIds || []), ...(outro.contratoIds || [])])];
      fica.historico = [...(fica.historico || []), ...(outro.historico || [])]
        .sort((a, b) => new Date(a.quando || 0) - new Date(b.quando || 0));
      for (const campo of Object.keys(outro)) {          // campo que só o duplicado tinha, aproveita
        if (fica[campo] === undefined || fica[campo] === '' || fica[campo] === null) fica[campo] = outro[campo];
      }
      removidos.push({ nome: outro.nome, id: outro.id });
    }
    fica.historico = (fica.historico || []).concat([{ quando: new Date().toISOString(), texto: `${grupo.length - 1} cadastro(s) duplicado(s) deste cliente foram juntados neste` }]);
    mantidos.add(fica);
  }
  for (const c of clientes) if (mantidos.has(c)) resultado.push(c);
  return { lista: resultado, removidos };
}

// Tira as contas repetidas do mesmo contrato + descrição, preservando o que tem baixa
function juntarContas(contas) {
  const porChave = new Map();
  const semChave = [];
  for (const cr of contas) {
    if (!cr.contratoId || !cr.descricao) { semChave.push(cr); continue; }
    // A CHAVE LEVA VENCIMENTO E VALOR, e isso não é zelo: é o conserto de um
    // estrago real. Em 30/10/2026 esta limpeza apagou 143 lançamentos de uma
    // vez — US$ 43.103,47, sendo 46 já PAGOS, US$ 12.793,60 recebidos.
    //
    // A chave era contrato + descrição, e o comentário supunha descrições
    // distintas como "Parcela 2/5". Nesta base a maioria diz só "Parcela" ou
    // "Avulsa": 80 e 54 dos apagados. Todas as parcelas de um contrato viraram
    // "o mesmo lançamento", e a limpeza manteve uma de cada grupo.
    //
    // Duas contas do mesmo contrato, com a mesma descrição, o mesmo
    // vencimento E o mesmo valor são a mesma coisa. Qualquer coisa a menos
    // que isso é chute com dinheiro de cliente.
    const k = [cr.contratoId, cr.descricao, texto(cr.vencimento), dinheiro(cr.valor)].join('|');
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k).push(cr);
  }
  const removidos = [];
  const mantidas = [];
  for (const [, grupo] of porChave) {
    if (grupo.length === 1) { mantidas.push(grupo[0]); continue; }
    const pagas = grupo.filter(x => x.status === 'Pago' || Number(x.valorRecebido) > 0);
    grupo.sort((a, b) => quando(a) - quando(b));
    const fica = pagas.length ? pagas[0] : grupo[0];
    mantidas.push(fica);
    for (const outro of grupo) {
      if (outro === fica) continue;
      removidos.push({ descricao: outro.descricao, cliente: outro.clienteNome, valor: outro.valor, tinhaBaixa: outro.status === 'Pago' });
    }
  }
  const ordem = new Map(contas.map((c, i) => [c, i]));
  const lista = [...mantidas, ...semChave].sort((a, b) => ordem.get(a) - ordem.get(b));
  return { lista, removidos };
}

export const rotasLimparDuplicados = Router();

// Mostra o que seria removido, sem remover nada
rotasLimparDuplicados.get('/duplicados/previa', exigirLogin, async (req, res, next) => {
  try {
    if (!req.usuario.acesso_total) return res.status(403).json({ erro: 'Só quem tem acesso total vê isso.' });
    const { valor: clientes } = await bloco(K_CLIENTES);
    const { valor: contas } = await bloco(K_RECEBER);
    const c = juntarClientes(clientes);
    const f = juntarContas(contas);
    res.json({
      clientes: { total: clientes.length, duplicados: c.removidos.length, exemplos: c.removidos.slice(0, 8).map(x => x.nome) },
      contas: { total: contas.length, duplicadas: f.removidos.length, exemplos: f.removidos.slice(0, 8).map(x => `${x.cliente} — ${x.descricao}`) },
    });
  } catch (e) { next(e); }
});

rotasLimparDuplicados.post('/duplicados/limpar', exigirLogin, async (req, res, next) => {
  try {
    if (!req.usuario.acesso_total) return res.status(403).json({ erro: 'Só quem tem acesso total pode limpar duplicados.' });
    if (!(await bcrypt.compare(String(req.body?.senha || ''), req.usuario.senha_hash))) return res.status(401).json({ erro: 'Senha incorreta.' });

    const copia = await backupAgora('antes de limpar duplicados');

    const { valor: clientes, versao: vc } = await bloco(K_CLIENTES);
    const { valor: contas, versao: vf } = await bloco(K_RECEBER);
    const c = juntarClientes(clientes);
    const f = juntarContas(contas);

    if (c.removidos.length) await gravar(K_CLIENTES, c.lista, vc, req.usuario.nome, null, 'limpeza de duplicados');
    if (f.removidos.length) await gravar(K_RECEBER, f.lista, vf, req.usuario.nome, null, 'limpeza de duplicados');

    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, 'confirmacao', null, 'removido',
       `Limpeza de duplicados: ${c.removidos.length} cliente(s) e ${f.removidos.length} conta(s) juntados. Backup ${copia.id} guardado antes`]);

    res.json({ ok: true, clientesJuntados: c.removidos.length, contasRemovidas: f.removidos.length, backupId: copia.id });
  } catch (e) { next(e); }
});
