// Arquivos (uploads). Os blocos JSON chegam com arquivos embutidos em base64 ("data:...");
// extraímos pra tabela `arquivos` e deixamos no lugar um link /api/arquivos/<id>.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
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

// Download por id. O id de 32 hex aleatórios é a chave de acesso (links só existem dentro do sistema
// e nos links enviados a cliente/prestador). Servido de forma que nunca execute como página.
rotasArquivos.get('/arquivos/:id', async (req, res, next) => {
  try {
    if (!/^[0-9a-f]{32}$/.test(req.params.id)) return res.status(404).end();
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
