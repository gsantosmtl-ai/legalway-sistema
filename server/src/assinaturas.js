// Assinatura eletrônica com pacote de prova (E-SIGN Act / UETA):
// intenção declarada + nome digitado + assinatura desenhada + IP/navegador + hora do servidor + hash do documento e dos termos,
// tudo num registro imutável, com uma página de certificado anexada ao PDF e verificação pública pelo hash.
import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { query } from './db.js';
import { exigirLogin } from './auth.js';
import { salvarDataUri } from './arquivos.js';
import { gravar } from './armazenamento.js';
import { avisarCanal } from './chat.js';
import { enviarEmail, emailConfigurado } from './email.js';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const canonico = (obj) => JSON.stringify(Object.keys(obj).sort().reduce((o, k) => (o[k] = obj[k], o), {}));
const RE_DATA_PDF = /^data:application\/pdf(;[^,]*)?;base64,/;
const RE_DATA_PNG = /^data:image\/png(;[^,]*)?;base64,/;

async function lerToken(t) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(t || ''))) return null;
  const { rows } = await query(`SELECT * FROM tokens_publicos WHERE token = $1 AND expira_em > now() AND tipo = 'assinatura'`, [t]);
  return rows[0] || null;
}

// Página de certificado (inglês, com rótulos curtos) anexada ao fim do PDF do contrato
async function anexarCertificado(pdfBytes, dados, pngBytes, urlVerificacao) {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const pag = doc.addPage([612, 792]); // carta
  const azul = rgb(0.086, 0.125, 0.31), cinza = rgb(0.4, 0.4, 0.45), preto = rgb(0.1, 0.1, 0.12);
  let y = 740;
  const linha = (rotulo, valor, tam = 10) => {
    pag.drawText(rotulo, { x: 54, y, size: 8.5, font: negrito, color: cinza });
    const partes = quebrar(String(valor ?? '—'), fonte, tam, 380);
    partes.forEach((p, i) => pag.drawText(p, { x: 190, y: y - i * (tam + 3), size: tam, font: fonte, color: preto }));
    y -= Math.max(1, partes.length) * (tam + 3) + 8;
  };
  pag.drawText('ELECTRONIC SIGNATURE CERTIFICATE', { x: 54, y, size: 16, font: negrito, color: azul }); y -= 18;
  pag.drawText('Certificado de Assinatura Eletrônica — Legal Way Group', { x: 54, y, size: 10, font: fonte, color: cinza }); y -= 14;
  pag.drawText('This page is part of the signed document and records the evidence of the electronic signature (E-SIGN Act / UETA).', { x: 54, y, size: 8.5, font: fonte, color: cinza }); y -= 26;
  pag.drawLine({ start: { x: 54, y }, end: { x: 558, y }, thickness: 1, color: azul }); y -= 22;

  linha('Certificate ID', dados.id);
  linha('Contract ID', dados.contrato_id);
  linha('Service', dados.servico);
  linha('Signer (typed name)', dados.nome_digitado, 11);
  linha('Name on record', dados.nome_link);
  linha('E-mail', dados.email);
  linha('Phone', dados.telefone);
  linha('Signed at (UTC)', dados.assinado_em.toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
  linha('Signed at (Florida)', dados.assinado_em.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'long' }));
  linha('IP address', dados.ip);
  linha('Device / browser', dados.user_agent, 8);
  y -= 6;
  linha('Consent given', dados.consentimentos.map(c => '• ' + c).join('  '), 8.5);
  y -= 6;
  linha('SHA-256 of contract', dados.hash_contrato, 8);
  linha('SHA-256 of terms', dados.hash_termos, 8);
  linha('Terms recorded', Object.entries(dados.termos).filter(([k]) => !['t', 'contrato_id'].includes(k)).map(([k, v]) => `${k}: ${v}`).join(' · '), 8);
  y -= 4;
  linha('Verify at', urlVerificacao);

  if (pngBytes) {
    try {
      const img = await doc.embedPng(pngBytes);
      const w = 200, h = (img.height / img.width) * w;
      pag.drawText('Signature as drawn', { x: 54, y: y - 4, size: 8.5, font: negrito, color: cinza });
      // o quadro de assinatura do contrato tem tinta clara sobre fundo escuro: reproduz o mesmo fundo
      pag.drawRectangle({ x: 188, y: y - h + 4, width: w + 4, height: h + 4, color: rgb(0.035, 0.082, 0.165), borderColor: cinza, borderWidth: 0.5 });
      pag.drawImage(img, { x: 190, y: y - h + 6, width: w, height: h });
      y -= h + 16;
    } catch {}
  }
  pag.drawText('The hash above identifies the contract exactly as it was signed. Any change to the document produces a different hash.', { x: 54, y: 40, size: 7.5, font: fonte, color: cinza });
  return Buffer.from(await doc.save());
}

function quebrar(texto, fonte, tam, larguraMax) {
  const palavras = texto.split(/\s+/); const linhas = []; let atual = '';
  for (const p of palavras) {
    const tent = atual ? atual + ' ' + p : p;
    if (fonte.widthOfTextAtSize(tent, tam) > larguraMax && atual) { linhas.push(atual); atual = p; }
    else atual = tent;
    while (fonte.widthOfTextAtSize(atual, tam) > larguraMax) { // palavra gigante (hash, user agent): corta
      let i = atual.length; while (i > 1 && fonte.widthOfTextAtSize(atual.slice(0, i), tam) > larguraMax) i--;
      linhas.push(atual.slice(0, i)); atual = atual.slice(i);
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export const rotasAssinaturas = Router();

// Página pública do contrato chama isto ao assinar (no lugar de só gravar a confirmação)
rotasAssinaturas.post('/publico/assinatura', async (req, res, next) => {
  try {
    const tk = await lerToken(req.query.t);
    if (!tk) return res.status(401).json({ erro: 'Link inválido ou expirado. Peça um novo.' });
    const b = req.body || {};
    const contratoId = tk.dados.contratoId;
    const nomeDigitado = String(b.nomeDigitado || '').trim();
    if (nomeDigitado.split(/\s+/).length < 2) return res.status(400).json({ erro: 'Digite seu nome completo.' });
    const consentimentos = Array.isArray(b.consentimentos) ? b.consentimentos.map(String).slice(0, 5) : [];
    if (consentimentos.length < 2) return res.status(400).json({ erro: 'É preciso aceitar os termos e consentir com a assinatura eletrônica.' });
    if (!RE_DATA_PDF.test(String(b.pdf || ''))) return res.status(400).json({ erro: 'PDF do contrato não veio.' });
    const termos = (b.termos && typeof b.termos === 'object') ? b.termos : {};
    delete termos.t;

    const pdfBytes = Buffer.from(String(b.pdf).replace(RE_DATA_PDF, ''), 'base64');
    const pngBytes = RE_DATA_PNG.test(String(b.assinatura || '')) ? Buffer.from(String(b.assinatura).replace(RE_DATA_PNG, ''), 'base64') : null;
    const dados = {
      id: randomBytes(16).toString('hex'), contrato_id: contratoId, token: tk.token,
      nome_digitado: nomeDigitado, nome_link: termos.nome || null, email: termos.email || null, telefone: termos.telefone || null,
      servico: termos.servico || b.servico || null, termos, consentimentos,
      hash_termos: sha256(canonico(termos)), hash_contrato: sha256(pdfBytes),
      ip: req.ip, user_agent: (req.get('user-agent') || '').slice(0, 400), assinado_em: new Date(),
    };
    const base = `${req.protocol}://${req.get('host')}`;
    const finalBytes = await anexarCertificado(pdfBytes, dados, pngBytes, `${base}/verificar.html`);
    const hashFinal = sha256(finalBytes);
    const nomeArq = `contrato-assinado-${(dados.nome_link || nomeDigitado).replace(/[^\w]+/g, '-').toLowerCase()}.pdf`;
    const linkFinal = await salvarDataUri('data:application/pdf;base64,' + finalBytes.toString('base64'), nomeArq, 'assinatura');
    const linkPng = pngBytes ? await salvarDataUri('data:image/png;base64,' + pngBytes.toString('base64'), 'assinatura.png', 'assinatura') : null;

    await query(
      `INSERT INTO assinaturas (id, contrato_id, token, nome_digitado, nome_link, email, telefone, servico, termos, consentimentos,
         hash_termos, hash_contrato, hash_final, arquivo_final, assinatura_png, ip, user_agent, assinado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [dados.id, contratoId, tk.token, nomeDigitado, dados.nome_link, dados.email, dados.telefone, dados.servico, JSON.stringify(termos),
       JSON.stringify(consentimentos), dados.hash_termos, dados.hash_contrato, hashFinal, linkFinal.split('/').pop(), linkPng ? linkPng.split('/').pop() : null,
       dados.ip, dados.user_agent, dados.assinado_em]
    );
    // o painel de Contratos continua lendo esta chave (fluxo existente)
    await gravar('legalway-contrato-assinado-' + contratoId, {
      assinadoEm: dados.assinado_em.toISOString(), nome: dados.nome_link || nomeDigitado, nomeDigitado, pdf: linkFinal,
      certificado: { id: dados.id, hashContrato: dados.hash_contrato, hashFinal, ip: dados.ip },
    }, null, 'público:assinatura');
    await query('DELETE FROM tokens_publicos WHERE token = $1', [tk.token]);
    avisarCanal('vendas', `📝 ${dados.nome_link || nomeDigitado} acabou de assinar o contrato${dados.servico ? ' (' + dados.servico + ')' : ''}. Já está em Contratos como "Assinado", com o PDF + certificado anexados e as parcelas no Financeiro.`).catch(() => {});

    // cópia pro cliente (se o e-mail do servidor estiver configurado)
    let emailCliente = { enviado: false };
    if (dados.email) {
      try {
        emailCliente = await enviarEmail({
          para: dados.email,
          assunto: `Your signed agreement — Legal Way Group`,
          texto: `Hello ${nomeDigitado},\n\nThank you. Your agreement${dados.servico ? ' (' + dados.servico + ')' : ''} was signed electronically on ${dados.assinado_em.toISOString().slice(0, 10)}.\nThe signed PDF, including the signature certificate, is attached. You can verify its authenticity at ${base}/verificar.html.\n\nLegal Way Group`,
          anexos: [{ filename: nomeArq, content: finalBytes, contentType: 'application/pdf' }],
        });
      } catch (e) { console.error('[email] falhou', e.message); }
    }
    res.status(201).json({ ok: true, certificado: { id: dados.id, hashContrato: dados.hash_contrato, hashFinal, assinadoEm: dados.assinado_em }, pdf: linkFinal, emailEnviado: !!emailCliente.enviado, emailConfigurado: emailConfigurado() });
  } catch (e) { next(e); }
});

// Verificação pública: dado o SHA-256 de um PDF, diz se é um contrato assinado no sistema (e por quem, quando)
rotasAssinaturas.get('/publico/verificar', async (req, res, next) => {
  try {
    const hash = String(req.query.hash || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) return res.status(400).json({ erro: 'Hash inválido.' });
    const { rows } = await query(
      `SELECT id, contrato_id, servico, nome_digitado, nome_link, assinado_em, hash_contrato, hash_final,
              (hash_final = $1) AS documento_final FROM assinaturas WHERE hash_final = $1 OR hash_contrato = $1 LIMIT 1`, [hash]);
    if (!rows[0]) return res.json({ encontrado: false });
    const a = rows[0];
    res.json({ encontrado: true, certificadoId: a.id, contratoId: a.contrato_id, servico: a.servico, assinante: a.nome_digitado, nomeRegistro: a.nome_link,
      assinadoEm: a.assinado_em, documentoFinal: a.documento_final, hashContrato: a.hash_contrato, hashFinal: a.hash_final });
  } catch (e) { next(e); }
});

// Equipe (logada): lista de assinaturas de um contrato
rotasAssinaturas.get('/assinaturas/:contratoId', exigirLogin, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, nome_digitado, nome_link, email, telefone, servico, assinado_em, ip, user_agent, hash_contrato, hash_final, arquivo_final, consentimentos FROM assinaturas WHERE contrato_id = $1 ORDER BY assinado_em DESC', [req.params.contratoId]);
    res.json({ assinaturas: rows.map(r => ({ ...r, pdf: '/api/arquivos/' + r.arquivo_final })) });
  } catch (e) { next(e); }
});
