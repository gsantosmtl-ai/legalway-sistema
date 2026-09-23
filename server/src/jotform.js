// Ponte pro Jotform. Existe por um motivo de segurança: a chave da conta Jotform estava escrita
// dentro do modelo de contrato — que é uma página pública — e portanto qualquer pessoa na internet
// conseguia ler a chave e, com ela, baixar os envios de todos os clientes.
// Agora o contrato manda os campos pra cá e o servidor repassa, com a chave guardada no ambiente
// (JOTFORM_API_KEY / JOTFORM_FORM_ID). Sem essas variáveis, o envio é simplesmente pulado.
import { Router } from 'express';
import { query } from './db.js';

const CAMPO_OK = /^submission\[\d{1,3}\]$/;   // só campos de envio, nada de outro parâmetro da API
const MAX_CAMPOS = 60;
const MAX_TAMANHO = 400_000;                  // a assinatura vai em base64; 400 KB é de sobra

export const rotasJotform = Router();

rotasJotform.get('/publico/jotform/ativo', (req, res) => {
  res.json({ ativo: !!(process.env.JOTFORM_API_KEY && process.env.JOTFORM_FORM_ID) });
});

rotasJotform.post('/publico/jotform', async (req, res) => {
  const chave = process.env.JOTFORM_API_KEY, formulario = process.env.JOTFORM_FORM_ID;
  if (!chave || !formulario) return res.json({ enviado: false, motivo: 'Envio ao Jotform não está configurado neste servidor.' });

  // Só aceita de um contrato que existe de verdade: sem isso a rota viraria um canal aberto
  // pra qualquer um encher o formulário dela de lixo.
  const contratoId = String(req.body?.contratoId || '').slice(0, 60);
  if (!contratoId) return res.status(400).json({ erro: 'Contrato não informado.' });
  try {
    const { rows } = await query(
      `SELECT 1 FROM armazenamento WHERE chave = 'legalway-contratos-v1' AND valor::text LIKE '%' || $1 || '%' LIMIT 1`, [contratoId]);
    if (!rows.length) return res.status(404).json({ erro: 'Contrato não encontrado.' });
  } catch { return res.status(503).json({ erro: 'Não foi possível conferir o contrato agora.' }); }

  const campos = req.body?.campos && typeof req.body.campos === 'object' ? req.body.campos : {};
  const nomes = Object.keys(campos).filter(k => CAMPO_OK.test(k)).slice(0, MAX_CAMPOS);
  const corpo = new URLSearchParams();
  for (const n of nomes) corpo.append(n, String(campos[n] ?? '').slice(0, MAX_TAMANHO));
  if (!nomes.length) return res.status(400).json({ erro: 'Nada pra enviar.' });

  try {
    const r = await fetch(`https://api.jotform.com/form/${encodeURIComponent(formulario)}/submissions?apiKey=${encodeURIComponent(chave)}`,
      { method: 'POST', body: corpo, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error('Jotform respondeu ' + r.status);
    res.json({ enviado: true });
  } catch (e) {
    console.error('[jotform] falhou:', e.message);   // a chave nunca vai pro log nem pra resposta
    res.status(502).json({ enviado: false, erro: 'O envio ao Jotform não funcionou agora.' });
  }
});
