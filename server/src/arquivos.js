// Arquivos (uploads). Os blocos JSON chegam com arquivos embutidos em base64 ("data:...");
// extraímos pra tabela `arquivos` e deixamos no lugar um link /api/arquivos/<id>.
import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { buscarSessao } from './auth.js';
import { query } from './db.js';
import { tipoDeArquivoPermitido } from './protecao.js';

const LIMITE_EXTRACAO = 2048;            // strings data: menores que isso ficam inline (ícones, testes)
const TAMANHO_MAX = 40 * 1024 * 1024;    // 40 MB por arquivo
const RE_DATA = /^data:([^;,]+)?(;[^,]*)?;base64,/;

export const ehLinkArquivo = (s) => typeof s === 'string' && s.startsWith('/api/arquivos/');

export async function salvarDataUri(dataUri, nome, criadoPor) {
  const m = RE_DATA.exec(dataUri);
  if (!m) return null;
  const tipo = (m[1] || 'application/octet-stream').toLowerCase();
  // páginas executáveis (html, svg, js, xml) não entram: mesmo servidas em sandbox, não têm por que existir aqui
  if (!tipoDeArquivoPermitido(tipo)) throw Object.assign(new Error(`Tipo de arquivo não aceito (${tipo}). Envie imagem, PDF, documento do Office, texto ou ZIP.`), { status: 415 });
  const conteudo = Buffer.from(dataUri.slice(m[0].length), 'base64');
  if (conteudo.length > TAMANHO_MAX) throw Object.assign(new Error('Arquivo maior que 40 MB.'), { status: 413 });
  const id = randomBytes(16).toString('hex');
  await query(
    'INSERT INTO arquivos (id, nome, tipo, tamanho, conteudo, criado_por) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, nome || null, tipo, conteudo.length, conteudo, criadoPor || null]
  );
  return '/api/arquivos/' + id;
}

// Percorre qualquer JSON e troca data URIs grandes por links. Devolve o valor transformado.
export async function extrairArquivos(valor, criadoPor, nomeSugerido) {
  if (typeof valor === 'string') {
    if (valor.length > LIMITE_EXTRACAO && RE_DATA.test(valor)) return salvarDataUri(valor, nomeSugerido, criadoPor);
    return valor;
  }
  if (Array.isArray(valor)) {
    const out = [];
    for (const v of valor) out.push(await extrairArquivos(v, criadoPor, nomeSugerido));
    return out;
  }
  if (valor && typeof valor === 'object') {
    const out = {};
    // tenta usar um nome de arquivo que esteja no mesmo objeto (nomeArquivo, nome...)
    const nome = valor.nomeArquivo || valor.nome_arquivo || (typeof valor.nome === 'string' && valor.nome.includes('.') ? valor.nome : null) || nomeSugerido;
    for (const [k, v] of Object.entries(valor)) out[k] = await extrairArquivos(v, criadoPor, nome);
    return out;
  }
  return valor;
}

export const rotasArquivos = Router();

// Quem pode baixar um arquivo. Antes bastava ter o link: o id de 32 hex era a única chave, e um
// link, uma vez criado, valia pra sempre — pro funcionário que saiu, pro cliente que encerrou o caso,
// pra quem recebesse o link encaminhado. Como o conteúdo é passaporte, certidão e documento de
// imigração, agora é preciso ter uma porta: sessão da equipe, sessão do cliente dono do processo,
// ou o token do link temporário do prestador. O id aleatório segue como segunda camada.
async function podeBaixar(req, id) {
  // 1) alguém da equipe
  try { const u = await buscarSessao(req); if (u && !u.trocar_senha) return 'equipe'; } catch { /* segue */ }

  // 2) cliente do portal — só o que estiver dentro do processo dele
  try {
    const token = req.cookies?.lw_cliente;
    if (token) {
      const h = createHash('sha256').update(token).digest('hex');
      const { rows } = await query(
        `SELECT c.processo_id FROM sessoes_portal s JOIN portal_clientes c ON c.id = s.cliente_id
          WHERE s.token_hash = $1 AND s.expira_em > now() AND c.ativo = true`, [h]);
      if (rows[0] && await arquivoEstaNoProcesso(id, rows[0].processo_id)) return 'cliente';
    }
  } catch { /* segue */ }

  // 3) link temporário (prestador de tradução / avaliação) — vale enquanto o token valer
  const t = String(req.query.t || '');
  if (/^[A-Za-z0-9_-]{20,64}$/.test(t)) {
    try {
      const { rows } = await query('SELECT tipo, dados FROM tokens_publicos WHERE token = $1 AND expira_em > now()', [t]);
      const tk = rows[0];
      if (tk?.tipo === 'portal' && tk.dados?.processoId && await arquivoDoPacoteDeTraducao(id, tk.dados.processoId)) return 'prestador';
      if (tk?.tipo === 'assinatura' && tk.dados?.contratoId) {
        const a = await query('SELECT 1 FROM assinaturas WHERE contrato_id = $1 AND (arquivo_final = $2 OR assinatura_png = $2)', [tk.dados.contratoId, id]);
        if (a.rows[0]) return 'assinatura';
      }
    } catch { /* segue */ }
  }
  return null;
}

// Carrega um processo da Documentação pelo id.
async function lerProcesso(processoId) {
  if (!processoId) return null;
  const { rows } = await query(`SELECT valor FROM armazenamento WHERE chave = 'legalway-processos-documentacao-v1'`);
  if (!rows[0]) return null;
  let lista = rows[0].valor;
  if (typeof lista === 'string') lista = JSON.parse(lista);
  if (typeof lista === 'string') lista = JSON.parse(lista);
  return (Array.isArray(lista) ? lista : []).find(x => x && x.id === processoId) || null;
}

// O arquivo pertence mesmo a esse processo? (evita que um link valha pra qualquer arquivo do sistema)
async function arquivoEstaNoProcesso(id, processoId) {
  const p = await lerProcesso(processoId);
  return p ? JSON.stringify(p).includes(id) : false;
}

// Prestador só baixa o que foi mesmo encaminhado pra tradução, e nunca um documento marcado como
// "não precisa de tradução" — nem que o endereço do link seja montado à mão com outros nomes.
async function arquivoDoPacoteDeTraducao(id, processoId) {
  const p = await lerProcesso(processoId);
  if (!p) return false;
  const enviados = Array.isArray(p.traducao?.documentos) ? p.traducao.documentos : [];
  if (!enviados.length) return false;
  return (p.checklist || []).some(d =>
    enviados.includes(d.nome) &&
    d.precisaTraducao !== false &&
    typeof d.arquivo === 'string' && d.arquivo.includes(id)
  );
}

// Download por id, só pra quem tem porta (veja podeBaixar). Servido de forma que nunca execute como página.
rotasArquivos.get('/arquivos/:id', async (req, res, next) => {
  try {
    if (!/^[0-9a-f]{32}$/.test(req.params.id)) return res.status(404).end();
    const quem = await podeBaixar(req, req.params.id);
    if (!quem) return res.status(401).json({ erro: 'Este arquivo só abre pra quem está logado no sistema, pro cliente dono do processo ou por um link temporário válido.' });
    const { rows } = await query('SELECT nome, tipo, tamanho, conteudo FROM arquivos WHERE id = $1', [req.params.id]);
    const a = rows[0];
    if (!a) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    const inline = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(a.tipo);
    const nome = (a.nome || 'arquivo').replace(/[^\w.\-() ]+/g, '_');
    res.set({
      'Content-Type': a.tipo,
      'Content-Length': a.tamanho,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${nome}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(a.conteudo);
  } catch (e) { next(e); }
});

// Limpeza: arquivos que não aparecem mais em nenhum bloco (nem no histórico recente) e têm mais de 1 dia
export async function limparArquivosOrfaos() {
  const { rowCount } = await query(`
    DELETE FROM arquivos a
    WHERE a.criado_em < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM armazenamento m WHERE m.valor::text LIKE '%' || a.id || '%')
      AND NOT EXISTS (SELECT 1 FROM armazenamento_hist h WHERE h.valor::text LIKE '%' || a.id || '%')
      AND NOT EXISTS (SELECT 1 FROM chat_mensagens c WHERE c.arquivo_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM assinaturas s WHERE s.arquivo_final = a.id OR s.assinatura_png = a.id)`);
  if (rowCount) console.log(`[arquivos] ${rowCount} arquivo(s) órfão(s) removido(s)`);
  return rowCount;
}
