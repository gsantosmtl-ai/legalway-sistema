// Armazenamento compartilhado: o "localStorage" de todas as telas, agora no servidor.
// Cada chave guarda um bloco JSON com versão; salvar por cima de uma versão antiga dispara a mesclagem.
import { Router } from 'express';
import { anotar } from './guardiao.js';
import { randomBytes } from 'node:crypto';
import { pool, query } from './db.js';
import { exigirLogin } from './auth.js';
import { mesclar } from './mesclar.js';
import { extrairArquivos } from './arquivos.js';
import { avisarCanal } from './chat.js';
import { podeLer, podeGravar, chavesVisiveis } from './permissoes.js';
import { limparValor } from './sanitizar.js';
import { registrarDiferencas } from './auditoria.js';

const HIST_MAX = 30;                       // versões guardadas por chave
const RE_CHAVE = /^[a-zA-Z0-9._:-]{1,120}$/;
let notificar = () => {};                  // ligado ao WebSocket em index.js
export const aoMudar = (fn) => { notificar = fn; };

const paraJson = (texto) => { try { return JSON.parse(texto); } catch { return texto; } };
const formato = (r) => r ? { chave: r.chave, valor: JSON.stringify(r.valor), versao: r.versao, atualizadoEm: r.atualizado_em } : null;

export async function ler(chave) {
  const { rows } = await query('SELECT * FROM armazenamento WHERE chave = $1', [chave]);
  return rows[0] || null;
}

// Grava com controle de versão. `versaoBase` = versão que a pessoa leu (null = não sabe / força).
// Primeira gravação de uma chave: começa depois da maior versão que o
// histórico ainda tiver, não no 1.
// O que fazer com uma gravação, dado o que a aba leu e o que o banco tem.
//
//   substituir — a aba está em dia (ou não declarou base): grava o que mandou
//   mesclar    — outra pessoa salvou no meio: dá para juntar as duas pontas
//   recusar    — a base já saiu do histórico: NÃO dá para saber o que ela mudou
//
// O terceiro caso era tratado como "mescla de duas vias, meus itens vencem", e
// foi o que apagou 3.509 anexos duas vezes em 24/10/2026.
export function comoGravar(versaoBase, versaoAtual, temBaseNoHistorico) {
  if (versaoBase == null) return 'substituir';
  if (Number(versaoBase) === Number(versaoAtual)) return 'substituir';
  return temBaseNoHistorico ? 'mesclar' : 'recusar';
}

export function versaoDepoisDoHistorico(maiorDoHistorico) {
  const n = Number(maiorDoHistorico);
  return (Number.isFinite(n) && n > 0 ? n : 0) + 1;
}

async function proximaVersaoDoHistorico(client, chave) {
  const { rows } = await client.query('SELECT max(versao) AS v FROM armazenamento_hist WHERE chave = $1', [chave]);
  return versaoDepoisDoHistorico(rows[0] && rows[0].v);
}

export async function gravar(chave, valorNovo, versaoBase, quem, transformar, origem) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM armazenamento WHERE chave = $1 FOR UPDATE', [chave]);
    const atual = rows[0];
    let valor = valorNovo;
    if (transformar) valor = await transformar(valor, atual ? atual.valor : null);
    let mesclado = false;
    if (atual && versaoBase != null && versaoBase !== atual.versao) {
      const hist = await client.query('SELECT valor FROM armazenamento_hist WHERE chave = $1 AND versao = $2', [chave, versaoBase]);
      const base = hist.rows[0] ? hist.rows[0].valor : null;
      if (comoGravar(versaoBase, atual.versao, base !== null) === 'mesclar') { valor = mesclar(base, atual.valor, valor); mesclado = true; }
      else {
        // Base antiga demais: ela já saiu do histórico e NÃO dá para mesclar.
        //
        // Aqui existia `mesclar(atual, atual, meu)` — mescla de duas vias, em
        // que "meus itens vencem". Parece inofensivo e é o contrário: com a
        // base igual ao atual, TUDO que a aba velha tem passa por alteração
        // minha e sobrescreve o servidor, e tudo que ela não tem conta como
        // apagado por mim.
        //
        // Foi isso que aconteceu duas vezes em 24/10/2026. Uma aba de
        // Documentação aberta desde a manhã, segurando 201 fichas vazias,
        // gravou por cima de 260 cheias: os 3.509 anexos sumiram e 59 fichas
        // foram apagadas. A trava de redução em massa não pegou porque a perda
        // foi de 22,7%, abaixo dos 30% — e ela conta registros, não vê que os
        // 201 que sobraram ficaram ocos.
        //
        // Sem base não há como saber o que a pessoa mudou de propósito. Então
        // a gravação é recusada e ela recarrega a tela. Perder o trabalho de
        // uma aba é ruim; apagar o trabalho do escritório inteiro é pior.
        const erro = new Error(
          'Esta aba está aberta há tempo demais: a versão que ela leu já saiu do histórico, '
          + 'e gravar agora apagaria o que outras pessoas fizeram desde então. '
          + 'Recarregue a página e refaça esta alteração.');
        erro.codigo = 'base-antiga';
        erro.versaoBase = versaoBase;
        erro.versaoAtual = atual.versao;
        throw erro;
      }
    }
    // A versão nova não pode ser escolhida olhando só para `armazenamento`.
    // Quando uma chave some de lá — recuperação, limpeza, importação — o
    // histórico dela continua: aí "primeira gravação" calculava versão 1 e
    // batia de frente com a versão 1 que o histórico ainda guardava. A chave
    // ficava impossível de gravar, com 500 a cada tentativa, para sempre.
    //
    // Foi assim que a tela do Financeiro ficou em branco na bateria de testes:
    // legalway-contas-bancarias-v1 não existia mais, o histórico sim, e o 500
    // de criar a chave derrubava o carregamento inteiro da tela.
    const versao = atual ? atual.versao + 1 : await proximaVersaoDoHistorico(client, chave);
    await client.query(
      `INSERT INTO armazenamento (chave, valor, versao, atualizado_em, atualizado_por) VALUES ($1,$2,$3,now(),$4)
       ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, versao = EXCLUDED.versao, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
      [chave, JSON.stringify(valor), versao, quem || null]
    );
    await client.query('INSERT INTO armazenamento_hist (chave, versao, valor) VALUES ($1,$2,$3)', [chave, versao, JSON.stringify(valor)]);
    await client.query('DELETE FROM armazenamento_hist WHERE chave = $1 AND versao <= $2', [chave, versao - HIST_MAX]);
    await client.query('COMMIT');
    notificar({ tipo: 'storage', chave, versao, por: quem || null, origem: origem || null });
    registrarDiferencas(chave, atual ? atual.valor : null, valor, quem).catch(e => console.error('[auditoria]', e.message));
    return { chave, valor: JSON.stringify(valor), versao, mesclado };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}

export const rotasArmazenamento = Router();
rotasArmazenamento.use(exigirLogin);

rotasArmazenamento.get('/storage', async (req, res, next) => {
  try {
    const prefixo = String(req.query.prefixo || '');
    const { rows } = await query('SELECT chave, versao, atualizado_em FROM armazenamento WHERE chave LIKE $1 ORDER BY chave', [prefixo + '%']);
    const visiveis = new Set(chavesVisiveis(req.usuario, rows.map(r => r.chave)));
    res.json({ chaves: rows.filter(r => visiveis.has(r.chave)).map(r => ({ chave: r.chave, versao: r.versao, atualizadoEm: r.atualizado_em })) });
  } catch (e) { next(e); }
});

// Várias chaves de uma vez (as telas pré-carregam tudo que vão ler numa chamada só). Ignora o que não pode ver.
rotasArmazenamento.get('/storage-lote', async (req, res, next) => {
  try {
    const chaves = String(req.query.chaves || '').split(',').map(c => c.trim()).filter(c => RE_CHAVE.test(c)).slice(0, 40);
    const permitidas = chaves.filter(c => podeLer(req.usuario, c));
    const itens = {};
    if (permitidas.length) {
      const { rows } = await query('SELECT chave, valor, versao FROM armazenamento WHERE chave = ANY($1)', [permitidas]);
      for (const r of rows) itens[r.chave] = { valor: JSON.stringify(r.valor), versao: r.versao };
      for (const c of permitidas) if (!itens[c]) itens[c] = null; // existe permissão mas não há dados
    }
    res.json({ itens });
  } catch (e) { next(e); }
});

rotasArmazenamento.get('/storage/:chave', async (req, res, next) => {
  try {
    if (!RE_CHAVE.test(req.params.chave)) return res.status(400).json({ erro: 'Chave inválida.' });
    if (!podeLer(req.usuario, req.params.chave)) return res.status(403).json({ erro: 'Sem permissão pra ver esses dados.' });
    const r = await ler(req.params.chave);
    if (!r) return res.status(404).json({ erro: 'Sem dados.' });
    res.json(formato(r));
  } catch (e) { next(e); }
});

// Trava contra apagão: uma gravação que remove muita coisa de uma vez (erro humano, tela com bug ou
// alguém de má-fé) é recusada. Quem quiser mesmo fazer isso manda `confirmarReducao: true`, e fica
// registrado na auditoria. O histórico (armazenamento_hist) continua permitindo voltar atrás.
const LIMITE_REDUCAO = 0.3; // recusa se sumir mais de 30% dos registros de uma vez
async function reducaoPerigosa(chave, novo) {
  if (!Array.isArray(novo)) return null;
  const atual = await ler(chave);
  const antes = Array.isArray(atual?.valor) ? atual.valor.length : 0;
  if (antes < 3) return null;   // lista muito pequena não entra na regra (senão atrapalha o uso normal)
  const sumiram = antes - novo.length;
  if (sumiram <= 0) return null;
  const proporcao = sumiram / antes;
  if (proporcao <= LIMITE_REDUCAO) return null;
  return { antes, depois: novo.length, sumiram, pct: Math.round(proporcao * 100) };
}

rotasArmazenamento.put('/storage/:chave', async (req, res, next) => {
  try {
    const chave = req.params.chave;
    if (!RE_CHAVE.test(chave)) return res.status(400).json({ erro: 'Chave inválida.' });
    if (typeof req.body?.valor !== 'string') return res.status(400).json({ erro: 'Valor precisa ser texto (JSON).' });
    if (!podeGravar(req.usuario, chave)) { anotar('sem-permissao', req, 'tentou gravar em ' + chave); return res.status(403).json({ erro: 'Sem permissão pra alterar esses dados.' }); }
    const valorNovo = limparValor(paraJson(req.body.valor));
    const risco = await reducaoPerigosa(chave, valorNovo);
    if (risco && !req.body.confirmarReducao) {
      anotar('apagar-em-massa', req, `${chave}: ${risco.sumiram} de ${risco.antes} registros (${risco.pct}%)`);
      return res.status(409).json({
        erro: `Essa gravação apagaria ${risco.sumiram} de ${risco.antes} registros (${risco.pct}%). Por segurança, o servidor não fez a alteração. Recarregue a tela e tente de novo; se for mesmo pra apagar, confirme a operação.`,
        reducao: risco,
      });
    }
    if (risco) {
      await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
        [req.usuario.nome, chave, null, 'removido', `Redução confirmada: de ${risco.antes} para ${risco.depois} registros`]).catch(() => {});
    }
    const versaoBase = req.body.versaoBase == null ? null : Number(req.body.versaoBase);
    let r;
    try {
      r = await gravar(chave, valorNovo, versaoBase, req.usuario.nome, (v) => extrairArquivos(v, req.usuario.nome), String(req.body.origem || '').slice(0, 40));
    } catch (e) {
      // Aba velha demais para mesclar: resposta clara, e fica registrado — foi
      // assim que 3.509 anexos sumiram duas vezes antes desta trava existir.
      if (e && e.codigo === 'base-antiga') {
        anotar('base-antiga', req, `${chave}: a aba leu a versão ${e.versaoBase}, o servidor está na ${e.versaoAtual}`);
        return res.status(409).json({ erro: e.message, baseAntiga: { versaoBase: e.versaoBase, versaoAtual: e.versaoAtual } });
      }
      throw e;
    }
    res.json(r);
  } catch (e) { next(e); }
});

// ---------- recuperar o que foi apagado por engano ----------
// Toda gravação vira uma versão em `armazenamento_hist` (as 30 últimas de cada
// chave). Até aqui só a mesclagem usava isso, e quem apagava uma ficha sem
// querer não tinha nenhum caminho de volta dentro do sistema — restaurar o
// backup inteiro troca o módulo todo e leva junto o trabalho de todo mundo
// desde então. Estas três rotas fazem o contrário: leem uma versão antiga e
// devolvem um registro só, pelo id, sem tocar em mais nada.

rotasArmazenamento.get('/storage/:chave/versoes', async (req, res, next) => {
  try {
    const chave = req.params.chave;
    if (!RE_CHAVE.test(chave)) return res.status(400).json({ erro: 'Chave inválida.' });
    if (!podeLer(req.usuario, chave)) return res.status(403).json({ erro: 'Sem permissão pra ver esses dados.' });
    const atual = await ler(chave);
    const { rows } = await query(
      'SELECT versao, salvo_em, jsonb_typeof(valor) AS tipo, CASE WHEN jsonb_typeof(valor) = $2 THEN jsonb_array_length(valor) ELSE NULL END AS itens' +
      ' FROM armazenamento_hist WHERE chave = $1 ORDER BY versao DESC', [chave, 'array']);
    res.json({
      chave,
      versaoAtual: atual ? atual.versao : 0,
      atualizadoEm: atual ? atual.atualizado_em : null,
      atualizadoPor: atual ? atual.atualizado_por : null,
      versoes: rows.map(r => ({ versao: r.versao, quando: r.salvo_em, itens: r.itens })),
    });
  } catch (e) { next(e); }
});

rotasArmazenamento.get('/storage/:chave/versoes/:versao', async (req, res, next) => {
  try {
    const chave = req.params.chave;
    const versao = Number(req.params.versao);
    if (!RE_CHAVE.test(chave) || !Number.isInteger(versao)) return res.status(400).json({ erro: 'Chave ou versão inválida.' });
    if (!podeLer(req.usuario, chave)) return res.status(403).json({ erro: 'Sem permissão pra ver esses dados.' });
    const { rows } = await query('SELECT valor FROM armazenamento_hist WHERE chave = $1 AND versao = $2', [chave, versao]);
    if (!rows[0]) return res.status(404).json({ erro: 'Essa versão já saiu do histórico (ficam as 30 últimas).' });
    res.json({ chave, versao, valor: JSON.stringify(rows[0].valor) });
  } catch (e) { next(e); }
});

// Acrescenta os registros recuperados à lista de hoje. SÓ acrescenta: nada do
// que está lá agora é alterado ou removido, e um id que já voltou (ou que nunca
// chegou a sumir) não entra duas vezes. Uma recuperação que apaga alguma coisa
// é pior do que não ter recuperação nenhuma.
export function devolverItens(atual, voltam) {
  const lista = Array.isArray(atual) ? atual.slice() : [];
  const existem = new Set(lista.map(x => x && String(x.id)));
  const devolvidos = [];
  for (const item of voltam) {
    const id = String(item.id);
    if (existem.has(id)) continue;
    existem.add(id);
    devolvidos.push(item);
  }
  return { lista: lista.concat(devolvidos), devolvidos };
}

// A lista do que sumiu: registros que existem em alguma versão guardada e não
// existem mais hoje. A conta é feita no banco porque trazer as 30 versões
// inteiras para o navegador são dezenas de MB — aqui volta só o resumo de cada
// um, com a versão mais recente em que ele ainda estava.
rotasArmazenamento.get('/storage/:chave/apagados', async (req, res, next) => {
  try {
    const chave = req.params.chave;
    if (!RE_CHAVE.test(chave)) return res.status(400).json({ erro: 'Chave inválida.' });
    if (!podeLer(req.usuario, chave)) return res.status(403).json({ erro: 'Sem permissão pra ver esses dados.' });
    const { rows } = await query(`
      SELECT DISTINCT ON (e->>'id')
             e->>'id'                                           AS id,
             h.versao                                           AS versao,
             h.salvo_em                                         AS quando,
             coalesce(e->>'clienteNome', e->>'nome', e->>'titulo', e->>'cliente', e->>'id') AS nome,
             CASE WHEN jsonb_typeof(e->'checklist') = 'array' THEN jsonb_array_length(e->'checklist') END AS documentos,
             CASE WHEN jsonb_typeof(e->'anexos')    = 'array' THEN jsonb_array_length(e->'anexos')    END AS anexos
        FROM armazenamento_hist h, jsonb_array_elements(h.valor) e
       WHERE h.chave = $1
         AND jsonb_typeof(h.valor) = 'array'
         AND jsonb_typeof(e) = 'object'
         AND e->>'id' IS NOT NULL
         AND NOT EXISTS (
               SELECT 1 FROM armazenamento a, jsonb_array_elements(a.valor) c
                WHERE a.chave = $1 AND jsonb_typeof(a.valor) = 'array' AND c->>'id' = e->>'id')
       ORDER BY e->>'id', h.versao DESC
       LIMIT 400`, [chave]);
    rows.sort((a, b) => b.versao - a.versao);   // o que sumiu por último aparece primeiro
    res.json({ chave, apagados: rows });
  } catch (e) { next(e); }
});

// O que ENTROU no bloco a partir de uma data, sem trazer o bloco.
//
// Existe porque a pergunta "a automação criou alguma coisa agora?" não tinha
// resposta barata: a lista de versões calcula o tamanho de cada uma das trinta
// versões guardadas, o que obriga o Postgres a descomprimir trinta cópias de um
// bloco grande — é leitura desse tipo que já derrubou o container. Aqui a
// consulta toca só a versão atual e a filtragem acontece no SQL; volta uma
// lista curta, não o bloco.
rotasArmazenamento.get('/storage/:chave/novos', async (req, res, next) => {
  try {
    const chave = req.params.chave;
    if (!RE_CHAVE.test(chave)) return res.status(400).json({ erro: 'Chave inválida.' });
    if (!podeLer(req.usuario, chave)) return res.status(403).json({ erro: 'Sem permissão pra ver esses dados.' });
    const desde = String(req.query.desde || '').slice(0, 30);
    if (!/^\d{4}-\d{2}-\d{2}/.test(desde)) return res.status(400).json({ erro: 'Informe ?desde=AAAA-MM-DD.' });
    const { rows } = await query(`
      SELECT e->>'id'                                            AS id,
             coalesce(e->>'clienteNome', e->>'nome', e->>'cliente') AS nome,
             e->>'descricao'    AS descricao,
             e->>'contratoId'   AS contrato,
             e->>'valor'        AS valor,
             e->>'vencimento'   AS vencimento,
             e->>'criadoEm'     AS criado_em
        FROM armazenamento a, jsonb_array_elements(a.valor) e
       WHERE a.chave = $1
         AND jsonb_typeof(a.valor) = 'array'
         AND jsonb_typeof(e) = 'object'
         AND e->>'criadoEm' >= $2
       ORDER BY e->>'criadoEm'
       LIMIT 500`, [chave, desde]);
    res.json({ chave, desde, total: rows.length, novos: rows });
  } catch (e) { next(e); }
});

// Devolve à lista de hoje os registros que existiam numa versão anterior e não
// existem mais. Só acrescenta: nada do que está lá agora é alterado ou removido,
// e um id que já voltou não entra duas vezes.
rotasArmazenamento.post('/storage/:chave/recuperar', async (req, res, next) => {
  try {
    const chave = req.params.chave;
    if (!RE_CHAVE.test(chave)) return res.status(400).json({ erro: 'Chave inválida.' });
    if (!podeGravar(req.usuario, chave)) { anotar('sem-permissao', req, 'tentou recuperar em ' + chave); return res.status(403).json({ erro: 'Sem permissão pra alterar esses dados.' }); }
    const versao = Number(req.body?.versao);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 500) : [];
    if (!Number.isInteger(versao) || !ids.length) return res.status(400).json({ erro: 'Diga a versão e o que recuperar.' });
    const { rows } = await query('SELECT valor FROM armazenamento_hist WHERE chave = $1 AND versao = $2', [chave, versao]);
    if (!rows[0]) return res.status(404).json({ erro: 'Essa versão já saiu do histórico (ficam as 30 últimas).' });
    const antigo = rows[0].valor;
    if (!Array.isArray(antigo)) return res.status(400).json({ erro: 'Esse módulo não é uma lista de registros — recupere pelo backup.' });
    const pedidos = new Set(ids);
    const voltam = antigo.filter(x => x && x.id !== undefined && pedidos.has(String(x.id)));
    if (!voltam.length) return res.status(404).json({ erro: 'Não achei esses registros nessa versão.' });

    let devolvidos = [];
    const r = await gravar(chave, null, null, req.usuario.nome + ' (recuperação)', (_, atual) => {
      const feito = devolverItens(atual, voltam);
      devolvidos = feito.devolvidos;
      return feito.lista;
    }, 'recuperação');
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, chave, devolvidos.map(x => String(x.id)).join(',').slice(0, 200), 'adicionado',
       `Recuperados da versão ${versao}: ${devolvidos.length} registro(s)`]).catch(() => {});
    res.json({ versao: r.versao, devolvidos: devolvidos.length, jaEstavam: voltam.length - devolvidos.length });
  } catch (e) { next(e); }
});

rotasArmazenamento.delete('/storage/:chave', async (req, res, next) => {
  try {
    if (!req.usuario.acesso_total) return res.status(403).json({ erro: 'Só quem tem acesso total pode apagar um módulo inteiro.' });
    if (!podeGravar(req.usuario, req.params.chave)) return res.status(403).json({ erro: 'Sem permissão pra apagar esses dados.' });
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)', [req.usuario.nome, req.params.chave, null, 'removido', 'Bloco inteiro apagado']).catch(() => {});
    await query('DELETE FROM armazenamento WHERE chave = $1', [req.params.chave]);
    await query('DELETE FROM armazenamento_hist WHERE chave = $1', [req.params.chave]);
    notificar({ tipo: 'storage', chave: req.params.chave, versao: 0, por: req.usuario.nome });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Importação do que existe no navegador de alguém: une por id com o que já está no servidor (o servidor vence em conflito)
rotasArmazenamento.post('/storage/importar', async (req, res, next) => {
  try {
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    const resultado = [];
    for (const it of itens) {
      if (!RE_CHAVE.test(String(it.chave || '')) || typeof it.valor !== 'string') continue;
      if (!podeGravar(req.usuario, it.chave)) { resultado.push({ chave: it.chave, erro: 'sem permissão' }); continue; }
      const novo = limparValor(paraJson(it.valor));
      const r = await gravar(it.chave, novo, null, req.usuario.nome + ' (importação)', async (v, atual) => {
        const v2 = await extrairArquivos(v, req.usuario.nome);
        // já existe no servidor: entra só o que o servidor não tem (por id); o resto fica como está
        return atual == null ? v2 : unirPorId(atual, v2);
      });
      resultado.push({ chave: it.chave, versao: r.versao });
    }
    res.json({ importados: resultado });
  } catch (e) { next(e); }
});

function unirPorId(atual, novo) {
  if (Array.isArray(atual) && Array.isArray(novo)) {
    const ids = new Set(atual.map(x => x && String(x.id)));
    return atual.concat(novo.filter(x => x && x.id !== undefined && !ids.has(String(x.id))));
  }
  if (atual && novo && typeof atual === 'object' && typeof novo === 'object' && !Array.isArray(atual)) return { ...novo, ...atual };
  return atual; // valores simples: mantém o do servidor
}

// ---------- acesso público por token (cliente assinando, prestador no portal) ----------
export const rotasPublico = Router();

const CHAVE_PROCESSOS = 'legalway-processos-documentacao-v1';
const CHAVE_PAGAR = 'legalway-contas-pagar-v1';
const CHAVE_PRESTADORES = 'legalway-prestadores-externos-v1';

async function lerToken(t) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(t || ''))) return null;
  const { rows } = await query('SELECT * FROM tokens_publicos WHERE token = $1 AND expira_em > now()', [t]);
  return rows[0] || null;
}

// Emitir token (só logado). tipo 'assinatura' -> {contratoId}; tipo 'portal' -> {processoId}
async function tokenPara(tipo, ref, quem) {
  const dados = tipo === 'assinatura' ? { contratoId: String(ref) } : { processoId: String(ref) };
  // reaproveita um token válido do mesmo alvo (o link enviado antes continua funcionando)
  const existe = await query(`SELECT token FROM tokens_publicos WHERE tipo = $1 AND dados = $2 AND expira_em > now() + interval '3 days' LIMIT 1`, [tipo, JSON.stringify(dados)]);
  if (existe.rows[0]) return existe.rows[0].token;
  const token = randomBytes(24).toString('base64url');
  await query(`INSERT INTO tokens_publicos (token, tipo, dados, expira_em, criado_por) VALUES ($1,$2,$3, now() + interval '30 days', $4)`,
    [token, tipo, JSON.stringify(dados), quem]);
  return token;
}

rotasPublico.post('/publico/token', exigirLogin, async (req, res, next) => {
  try {
    const { tipo, ref } = req.body || {};
    if (!['assinatura', 'portal'].includes(tipo) || !ref) return res.status(400).json({ erro: 'Tipo ou referência inválidos.' });
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, tipo === 'portal' ? 'legalway-processos-documentacao-v1' : 'legalway-contratos-v1', String(ref), 'alterado', `Link público (${tipo}) gerado`]).catch(() => {});
    res.json({ token: await tokenPara(tipo, ref, req.usuario.nome) });
  } catch (e) { next(e); }
});

// Vários de uma vez (a tela de Documentação pega os tokens de todos os processos ao carregar)
rotasPublico.post('/publico/tokens', exigirLogin, async (req, res, next) => {
  try {
    const { tipo, refs } = req.body || {};
    if (!['assinatura', 'portal'].includes(tipo) || !Array.isArray(refs)) return res.status(400).json({ erro: 'Parâmetros inválidos.' });
    const tokens = {};
    for (const ref of refs.slice(0, 500)) tokens[String(ref)] = await tokenPara(tipo, ref, req.usuario.nome);
    res.json({ tokens });
  } catch (e) { next(e); }
});

// A página pública usa o MESMO window.storage, mas cada token só enxerga a sua fatia
// Revogar os links públicos de um processo/contrato (quando o link vazou ou o prestador saiu)
rotasPublico.post('/publico/revogar', exigirLogin, async (req, res, next) => {
  try {
    const { tipo, ref } = req.body || {};
    if (!['assinatura', 'portal'].includes(tipo) || !ref) return res.status(400).json({ erro: 'Tipo ou referência inválidos.' });
    const dados = tipo === 'assinatura' ? { contratoId: String(ref) } : { processoId: String(ref) };
    const r = await query('DELETE FROM tokens_publicos WHERE tipo = $1 AND dados = $2', [tipo, JSON.stringify(dados)]);
    await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
      [req.usuario.nome, tipo === 'portal' ? 'legalway-processos-documentacao-v1' : 'legalway-contratos-v1', String(ref), 'removido', `Links públicos (${tipo}) revogados`]).catch(() => {});
    res.json({ ok: true, revogados: r.rowCount });
  } catch (e) { next(e); }
});

rotasPublico.get('/publico/storage/:chave', async (req, res, next) => {
  try {
    const tk = await lerToken(req.query.t);
    if (!tk) return res.status(401).json({ erro: 'Link inválido ou expirado. Peça um novo.' });
    const chave = req.params.chave;
    const r = await ler(chave);
    const valor = r ? r.valor : null;
    if (tk.tipo === 'portal') {
      const { processoId } = tk.dados;
      if (chave === CHAVE_PROCESSOS) return res.json({ chave, valor: JSON.stringify((valor || []).filter(p => p && p.id === processoId)), versao: r?.versao || 0 });
      if (chave === CHAVE_PAGAR) return res.json({ chave, valor: JSON.stringify((valor || []).filter(c => c && c.processoId === processoId)), versao: r?.versao || 0 });
      if (chave === CHAVE_PRESTADORES) return res.json({ chave, valor: JSON.stringify((valor || []).map(p => ({ id: p.id, nome: p.nome, tipo: p.tipo, valor: p.valor, valorPadrao: p.valorPadrao }))), versao: r?.versao || 0 });
    }
    return res.status(403).json({ erro: 'Sem acesso a esses dados.' });
  } catch (e) { next(e); }
});

rotasPublico.put('/publico/storage/:chave', async (req, res, next) => {
  try {
    const tk = await lerToken(req.query.t);
    if (!tk) return res.status(401).json({ erro: 'Link inválido ou expirado. Peça um novo.' });
    const chave = req.params.chave;
    if (typeof req.body?.valor !== 'string') return res.status(400).json({ erro: 'Valor inválido.' });
    const novo = limparValor(paraJson(req.body.valor));
    const quem = 'público:' + tk.tipo;
    if (tk.tipo === 'assinatura' && chave === 'legalway-contrato-assinado-' + tk.dados.contratoId) {
      const r = await gravar(chave, novo, null, quem, (v) => extrairArquivos(v, quem, 'contrato-assinado.pdf'));
      await query('DELETE FROM tokens_publicos WHERE token = $1', [tk.token]); // assinou: link não serve mais
      const nome = (novo && typeof novo === 'object' && novo.nome) ? String(novo.nome) : 'Cliente';
      avisarCanal('vendas', `📝 ${nome} acabou de assinar o contrato. Já está em Contratos como "Assinado", com o PDF anexado e as parcelas no Financeiro.`).catch(() => {});
      return res.json(r);
    }
    if (tk.tipo === 'portal' && (chave === CHAVE_PROCESSOS || chave === CHAVE_PAGAR)) {
      const { processoId } = tk.dados;
      // o portal manda só a fatia dele; aplicamos item a item no bloco completo
      const permitido = (item) => chave === CHAVE_PROCESSOS ? item.id === processoId : item.processoId === processoId;
      const itens = (Array.isArray(novo) ? novo : []).filter(x => x && x.id !== undefined && permitido(x));
      const r = await gravar(chave, itens, null, quem, async (fatia, atual) => {
        const fatia2 = await extrairArquivos(fatia, quem);
        const lista = Array.isArray(atual) ? atual.slice() : [];
        for (const item of fatia2) {
          const i = lista.findIndex(x => x && String(x.id) === String(item.id));
          if (i >= 0) lista[i] = item; else lista.push(item);
        }
        return lista;
      });
      return res.json({ chave, versao: r.versao });
    }
    return res.status(403).json({ erro: 'Sem acesso a esses dados.' });
  } catch (e) { next(e); }
});
