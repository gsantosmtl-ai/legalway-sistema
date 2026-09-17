// E-mail enviado pelo servidor (cópia do contrato assinado pro cliente, avisos). Usa o e-mail da empresa via SMTP.
// Configuração por variáveis no Railway: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_DE (ex.: "Legal Way Group <contato@legalway.group>").
// Sem configuração, os envios são só registrados no log (nada quebra).
import nodemailer from 'nodemailer';

let transporte = null;
export function emailConfigurado() { return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS); }

function obterTransporte() {
  if (transporte) return transporte;
  if (!emailConfigurado()) return null;
  const porta = Number(process.env.SMTP_PORT) || 587;
  transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: porta, secure: porta === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporte;
}

export async function enviarEmail({ para, assunto, texto, html, anexos }) {
  const t = obterTransporte();
  if (!t) { console.log(`[email] (não configurado) para=${para} assunto="${assunto}"`); return { enviado: false, motivo: 'SMTP não configurado' }; }
  const de = process.env.EMAIL_DE || process.env.SMTP_USER;
  const info = await t.sendMail({ from: de, to: para, subject: assunto, text: texto, html, attachments: anexos });
  console.log(`[email] enviado para ${para}: ${assunto} (${info.messageId})`);
  return { enviado: true, id: info.messageId };
}
