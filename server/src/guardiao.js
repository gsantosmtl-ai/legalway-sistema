// O Guardião: vigia o sistema sozinho, o tempo todo.
// 1) anota tudo que cheira a invasão (login errado, pedido de outro site, tentativa de virar admin…);
// 2) bloqueia o endereço de quem insiste;
// 3) avisa os administradores no chat e por e-mail quando é grave;
// 4) uma vez por dia faz um autoexame do sistema e dá uma nota de 0 a 100.
// Nada disso depende de serviço de fora — roda no próprio servidor.
import { Router } from 'express';
import { query } from './db.js';
import { exigirLogin, buscarSessao } from './auth.js';
import { avisarPessoa } from './chat.js';
import { enviarEmail, emailConfigurado } from './email.js';

// ---------------- tipos de evento ----------------
// gravidade: 1 aviso (só registra) · 2 atenção (conta pro bloqueio) · 3 grave (avisa na hora)
export const EVENTOS = {
  'login-errado':      { g: 1, peso: 1,  texto: 'Senha errada no login' },
  'forca-bruta':       { g: 2, peso: 6,  texto: 'Muitas senhas erradas seguidas' },
  'portal-forca-bruta':{ g: 2, peso: 6,  texto: 'Muitas senhas erradas no Portal do Cliente' },
  'excesso-pedidos':   { g: 2, peso: 2,  texto: 'Excesso de pedidos vindos do mesmo endereço' },
  'csrf':              { g: 3, peso: 10, texto: 'Pedido de alteração veio de outro site' },
  'arquivo-recusado':  { g: 2, peso: 4,  texto: 'Tentou enviar arquivo de tipo perigoso' },
  'apagar-em-massa':   { g: 3, peso: 8,  texto: 'Tentativa de apagar um bloco inteiro de dados' },
  'virar-admin':       { g: 3, peso: 10, texto: 'Tentou se dar acesso total' },
  'mexer-em-admin':    { g: 3, peso: 10, texto: 'Tentou editar a conta de um administrador' },
  'permissao-propria': { g: 3, peso: 8,  texto: 'Tentou mudar as próprias permissões' },
  'backup-negado':     { g: 3, peso: 8,  texto: 'Tentou baixar o backup sem ser administrador' },
  'sem-permissao':     { g: 1, peso: 1,  texto: 'Tentou abrir algo sem permissão' },
  // Peso ZERO de propósito: aba aberta há tempo demais não é ataque, é gente
  // trabalhando. Ninguém pode ser bloqueado por isso. Fica registrado só para
  // a gente enxergar se volta a acontecer — foi este caso que apagou 3.509
  // anexos duas vezes em 24/10/2026, antes de a gravação passar a ser recusada.
  'base-antiga':       { g: 1, peso: 0,  texto: 'Gravação recusada: a aba leu uma versão que já saiu do histórico' },

  // Webhooks de fora. Estes quatro já eram chamados pelo código e NÃO estavam
  // aqui — `anotar()` ignora tipo fora do catálogo em silêncio, então webhook
  // com assinatura forjada não deixava rastro nenhum.
  //
  // Os do Stripe e da Meta avisam na hora (g:3) mas têm peso ZERO: bloquear o
  // endereço deles por assinatura inválida derrubaria a confirmação de
  // pagamento e a entrada de leads. Se o segredo do app for trocado e as
  // assinaturas começarem a falhar, o remédio não pode ser cortar o provedor.
  // Quem decide é gente, avisada na hora.
  'stripe-assinatura':       { g: 3, peso: 0, texto: 'Webhook do Stripe recusado: assinatura inválida (tentativa de dar baixa em parcela não paga)' },
  'meta-assinatura-invalida':{ g: 3, peso: 0, texto: 'Webhook da Meta recusado: assinatura inválida' },
  'meta-verificacao-invalida':{ g: 2, peso: 0, texto: 'Tentativa de verificar o webhook da Meta com token errado' },
  // Este é de dentro de casa: alguém logado mexendo onde não pode. Aqui o
  // bloqueio faz sentido.
  'waha-negado':             { g: 2, peso: 4, texto: 'Tentou mexer no WhatsApp dos setores sem permissão' },
  // estes são normais, mas ficam registrados porque importam depois
  'admin-criado':      { g: 2, peso: 0,  texto: 'Novo administrador criado' },
  'backup-baixado':    { g: 1, peso: 0,  texto: 'Backup baixado' },
  'link-publico':      { g: 1, peso: 0,  texto: 'Link público gerado' },
  'ip-bloqueado':      { g: 3, peso: 0,  texto: 'Endereço bloqueado automaticamente' },
  // Ligar o aviso no celular é ação normal de quem já está logado. Peso zero:
  // ninguém pode ser bloqueado por isso. Fica registrado porque amarra um
  // aparelho a uma pessoa, e um dia alguém vai perguntar de quem é.
  'push-ligado':       { g: 1, peso: 0,  texto: 'Ligou o aviso de lead no celular' },
  // Apagar arquivo é definitivo. Quem tenta sem permissão fica registrado —
  // o alvo típico aqui é a foto do cartão que o cliente anexa no contrato.
  'arquivo-apagado-negado': { g: 2, peso: 4, texto: 'Tentou apagar arquivo de contrato sem permissão' },
};

const JANELA_MIN = 15;         // olha os últimos 15 minutos
const PESO_PRA_BLOQUEAR = 18;  // soma dos pesos que dispara o bloqueio
const BLOQUEIO_MIN = 30;       // quanto tempo fica bloqueado

const bloqueiosMem = new Map(); // ip -> timestamp (cópia em memória, rápida)
let carregou = false;

export async function carregarBloqueios() {
  try {
    const { rows } = await query('SELECT ip, ate FROM seguranca_bloqueios WHERE ate > now()');
    bloqueiosMem.clear();
    for (const r of rows) bloqueiosMem.set(r.ip, new Date(r.ate).getTime());
    carregou = true;
  } catch { /* tabela ainda não existe na primeira subida */ }
}

// O servidor roda em mais de uma cópia. A lista fica no banco e cada cópia relê de 15 em 15
// segundos, senão um bloqueio feito numa cópia não valeria nas outras.
setInterval(() => { carregarBloqueios().catch(() => {}); }, 15_000).unref?.();

export function ipBloqueado(ip) {
  const ate = bloqueiosMem.get(ip);
  if (!ate) return false;
  if (ate < Date.now()) { bloqueiosMem.delete(ip); return false; }
  return true;
}

// Barreira que entra antes de tudo: quem está bloqueado não passa.
// Exceção importante: quem já está logado com sessão válida continua entrando. O escritório inteiro
// costuma sair pelo mesmo endereço de internet — sem essa exceção, um colega errando a senha
// trancaria todo mundo. Contra quem está logado a defesa é outra: permissão, auditoria e alerta.
export async function barreira(req, res, next) {
  if (!carregou || !ipBloqueado(req.ip)) return next();
  try { if (await buscarSessao(req)) return next(); } catch { /* segue e bloqueia */ }

  // Quem chega pelo navegador recebe uma PÁGINA, não um JSON cru.
  //
  // Até aqui o bloqueio respondia o mesmo objeto para tudo, e quem abria o
  // sistema via `{"erro":"Este endereço foi bloqueado..."}` escrito em letra de
  // máquina numa tela branca: sem saber quanto tempo dura, sem saber por que, e
  // sem nenhum caminho de volta. O login fica atrás desta barreira de
  // propósito — é ele que o bloqueio protege contra força bruta — então a
  // pessoa não tem o que tentar. O mínimo é dizer o que houve e o que fazer.
  const ate = bloqueiosMem.get(req.ip);
  const faltam = ate ? Math.max(1, Math.ceil((ate - Date.now()) / 60000)) : BLOQUEIO_MIN;
  const querHtml = (req.get('accept') || '').includes('text/html');
  if (!querHtml) {
    return res.status(429).json({ erro: `Este endereço está bloqueado por atividade suspeita. Libera em ${faltam} minuto(s).` });
  }
  res.status(429).type('html').send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Acesso bloqueado</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#F7F5F0;font-family:'IBM Plex Sans',-apple-system,system-ui,sans-serif;color:#1B1B1F;padding:20px}
.c{max-width:430px;background:#fff;border:1px solid #E4E1DA;border-radius:14px;padding:26px 28px;
box-shadow:0 10px 30px rgba(0,0,0,.07)}h1{font-size:19px;color:#16204F;margin:0 0 10px}
p{font-size:14px;line-height:1.6;margin:0 0 12px}li{font-size:14px;line-height:1.6;margin-bottom:6px}
b{color:#16204F}.t{display:inline-block;background:#F3E9D2;color:#8A6B12;border-radius:8px;
padding:5px 11px;font-size:13px;font-weight:600;margin-bottom:14px}</style></head><body><div class="c">
<div class="t">Libera em ${faltam} minuto${faltam === 1 ? '' : 's'}</div>
<h1>Este endereço de internet está bloqueado</h1>
<p>O sistema barra um endereço depois de várias tentativas de senha erradas ou de um volume
fora do normal de acessos. É uma proteção contra invasão — não é problema na sua conta.</p>
<p><b>Para entrar agora:</b></p>
<ul>
<li>Use o <b>celular nos dados móveis</b>, com o wi-fi desligado: é outro endereço, e não está bloqueado.</li>
<li>Quem já estiver logado em outro aparelho <b>continua trabalhando normalmente</b> e pode liberar
este endereço em <b>Segurança → Liberar</b>.</li>
<li>Ou espere os ${faltam} minuto${faltam === 1 ? '' : 's'}: o bloqueio cai sozinho.</li>
</ul>
<p style="color:#6B6B75;font-size:12.5px;margin-top:16px">Se isso se repetir sem motivo, o painel de
Segurança mostra quais tentativas somaram o bloqueio, com hora e origem.</p>
</div></body></html>`);
}

// ---------------- registrar um evento ----------------
export async function anotar(tipo, req, detalhe = '') {
  const e = EVENTOS[tipo];
  if (!e) return;
  const ip = req?.ip || null;
  const quem = req?.usuario?.nome || req?.cliente?.nome || null;
  const caminho = req ? `${req.method} ${req.path}` : null;
  try {
    await query('INSERT INTO seguranca_eventos (tipo, gravidade, ip, quem, detalhe, caminho) VALUES ($1,$2,$3,$4,$5,$6)',
      [tipo, e.g, ip, quem, String(detalhe || '').slice(0, 400), caminho]);
  } catch { return; } // nunca deixar a vigilância derrubar um pedido do usuário
  if (e.g >= 3) avisarAdministradores(tipo, quem, ip, detalhe).catch(() => {});
  if (e.peso > 0 && ip) conferirBloqueio(ip).catch(() => {});
}

async function conferirBloqueio(ip) {
  if (ipBloqueado(ip)) return;
  const { rows } = await query(
    `SELECT tipo FROM seguranca_eventos WHERE ip = $1 AND quando > now() - interval '${JANELA_MIN} minutes'`, [ip]);
  const soma = rows.reduce((t, r) => t + (EVENTOS[r.tipo]?.peso || 0), 0);
  if (soma < PESO_PRA_BLOQUEAR) return;
  const ate = new Date(Date.now() + BLOQUEIO_MIN * 60_000);
  await query(`INSERT INTO seguranca_bloqueios (ip, ate, motivo) VALUES ($1,$2,$3)
               ON CONFLICT (ip) DO UPDATE SET ate = EXCLUDED.ate, motivo = EXCLUDED.motivo`,
    [ip, ate, `${rows.length} eventos suspeitos em ${JANELA_MIN} minutos`]);
  bloqueiosMem.set(ip, ate.getTime());
  await query('INSERT INTO seguranca_eventos (tipo, gravidade, ip, detalhe) VALUES ($1,3,$2,$3)',
    ['ip-bloqueado', ip, `bloqueado por ${BLOQUEIO_MIN} minutos`]);
  avisarAdministradores('ip-bloqueado', null, ip, `bloqueado por ${BLOQUEIO_MIN} minutos`).catch(() => {});
}

// ---------------- avisar quem manda ----------------
const ultimoAviso = new Map(); // tipo+ip -> quando (pra não encher o chat com o mesmo aviso)
async function avisarAdministradores(tipo, quem, ip, detalhe) {
  const chave = tipo + '|' + ip;
  if (Date.now() - (ultimoAviso.get(chave) || 0) < 10 * 60_000) return;
  ultimoAviso.set(chave, Date.now());
  const e = EVENTOS[tipo];
  const texto = `🛡️ *Alerta de segurança* — ${e.texto}.` +
    (quem ? `\nQuem estava logado: ${quem}` : '') +
    (ip ? `\nEndereço: ${ip}` : '') +
    (detalhe ? `\nDetalhe: ${detalhe}` : '') +
    `\nQuando: ${new Date().toLocaleString('pt-BR')}` +
    `\n\nO sistema já bloqueou a ação. Veja o painel em Configurações → Segurança.`;
  const { rows } = await query('SELECT nome FROM usuarios WHERE ativo = true AND acesso_total = true');
  for (const a of rows) await avisarPessoa(a.nome, texto).catch(() => {});
  if (emailConfigurado() && e.g >= 3) {
    const emails = (process.env.EMAIL_SEGURANCA || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const para of emails) {
      await enviarEmail({ para, assunto: `Alerta de segurança: ${e.texto}`, texto }).catch(() => {});
    }
  }
}

// ---------------- autoexame diário ----------------
// Confere sozinho o que costuma ficar frouxo com o tempo. Cada item vale pontos.
const SENHAS_FRACAS = ['123456', 'legalway', 'legalway2025', 'legalway2026', 'mudar123', 'senha123', '12345678'];

export async function autoexame() {
  const itens = [];
  const ok = (t, d) => itens.push({ estado: 'ok', titulo: t, detalhe: d });
  const atencao = (t, d, comoResolver) => itens.push({ estado: 'atencao', titulo: t, detalhe: d, comoResolver });
  const grave = (t, d, comoResolver) => itens.push({ estado: 'grave', titulo: t, detalhe: d, comoResolver });

  // 1) gente que ainda não trocou a senha padrão
  const { rows: us } = await query('SELECT nome, usuario, trocar_senha, acesso_total, ativo FROM usuarios WHERE ativo = true');
  const pendentes = us.filter(u => u.trocar_senha);
  if (pendentes.length) atencao('Senha padrão ainda não trocada', `${pendentes.length} pessoa(s): ${pendentes.map(u => u.nome).join(', ')}`,
    'Peça pra cada uma entrar no sistema — na primeira entrada o sistema obriga a trocar.');
  else ok('Senhas', 'Todo mundo já trocou a senha inicial.');

  // 2) quantos administradores
  const admins = us.filter(u => u.acesso_total);
  if (admins.length > 4) atencao('Muitos administradores', `${admins.length} pessoas com acesso total: ${admins.map(u => u.nome).join(', ')}`,
    'Acesso total vê e muda tudo, inclusive o backup. Deixe só quem realmente precisa.');
  else ok('Administradores', `${admins.length} pessoa(s) com acesso total.`);

  // 3) contas paradas
  const { rows: paradas } = await query(
    `SELECT u.nome FROM usuarios u WHERE u.ativo = true
       AND NOT EXISTS (SELECT 1 FROM sessoes s WHERE s.usuario_id = u.id AND s.ultimo_acesso > now() - interval '60 days')`);
  if (paradas.length) atencao('Contas paradas há mais de 60 dias', paradas.map(r => r.nome).join(', '),
    'Se a pessoa saiu da empresa, desative a conta em Configurações → Usuários.');
  else ok('Contas ativas', 'Ninguém com acesso parado há muito tempo.');

  // 4) links públicos valendo
  try {
    const { rows: pub } = await query(`SELECT count(*)::int n FROM tokens_publicos WHERE expira_em > now()`);
    if (pub[0]?.n > 10) atencao('Muitos links públicos ativos', `${pub[0].n} links valendo agora`,
      'Link público mostra dados sem pedir senha. Revogue os que não usa mais.');
    else ok('Links públicos', `${pub[0]?.n || 0} link(s) valendo.`);
  } catch { /* tabela pode não existir */ }

  // 5) backup recente
  try {
    const { rows: bk } = await query('SELECT criado_em FROM backups ORDER BY criado_em DESC LIMIT 1');
    const quando = bk[0]?.criado_em ? new Date(bk[0].criado_em) : null;
    const dias = quando ? Math.floor((Date.now() - quando.getTime()) / 86400000) : null;
    if (dias === null) grave('Sem backup', 'O sistema ainda não gravou nenhuma cópia de segurança.', 'Fale comigo — a rotina de backup pode estar desligada.');
    else if (dias > 2) atencao('Backup atrasado', `Última cópia há ${dias} dias.`, 'A rotina roda sozinha a cada 6 horas. Se está atrasado, algo travou.');
    else ok('Backup', `Última cópia ${dias === 0 ? 'hoje' : 'ontem'}.`);
  } catch { /* idem */ }

  // 6) e-mail de alerta configurado
  if (!emailConfigurado()) atencao('E-mail do sistema não configurado', 'Alertas graves só aparecem no chat, não chegam por e-mail.',
    'Preciso cadastrar os dados de envio de e-mail (SMTP) no servidor.');
  else if (!process.env.EMAIL_SEGURANCA) atencao('Ninguém recebe alerta por e-mail', 'O envio está pronto, mas falta dizer pra qual endereço mandar.',
    'Me diga o e-mail que deve receber os alertas de segurança.');
  else ok('Alertas por e-mail', `Vão para ${process.env.EMAIL_SEGURANCA}.`);

  // 7) o que aconteceu nas últimas 24 h
  const { rows: ev } = await query(
    `SELECT gravidade, count(*)::int n FROM seguranca_eventos WHERE quando > now() - interval '24 hours' GROUP BY gravidade`);
  const graves = ev.find(r => r.gravidade === 3)?.n || 0;
  const medios = ev.find(r => r.gravidade === 2)?.n || 0;
  if (graves) grave('Tentativas graves nas últimas 24 h', `${graves} tentativa(s) bloqueada(s).`, 'Abra o painel de Segurança e veja quem e de onde.');
  else if (medios > 20) atencao('Movimento suspeito', `${medios} eventos de atenção nas últimas 24 h.`, 'Normalmente é alguém errando a senha. Confira no painel.');
  else ok('Últimas 24 horas', 'Nada suspeito.');

  // 8) sessões abertas demais
  const { rows: ses } = await query(`SELECT count(*)::int n FROM sessoes WHERE ultimo_acesso > now() - interval '12 hours'`);
  ok('Sessões abertas agora', `${ses[0]?.n || 0}.`);

  // 9) ambiente do USCIS
  if (process.env.USCIS_CLIENT_ID) {
    const amb = process.env.USCIS_AMBIENTE === 'producao' ? 'produção' : 'teste (sandbox)';
    ok('Consulta ao USCIS', `Ligada, ambiente de ${amb}.`);
  }

  const nota = Math.max(0, 100 - itens.filter(i => i.estado === 'grave').length * 25 - itens.filter(i => i.estado === 'atencao').length * 8);
  return { nota, itens };
}

export async function boletimDiario(log) {
  const hoje = new Date().toISOString().slice(0, 10);
  const { rows } = await query('SELECT dia FROM seguranca_boletins WHERE dia = $1', [hoje]);
  if (rows.length) return;
  const { nota, itens } = await autoexame();
  await query('INSERT INTO seguranca_boletins (dia, nota, itens) VALUES ($1,$2,$3) ON CONFLICT (dia) DO UPDATE SET nota = EXCLUDED.nota, itens = EXCLUDED.itens',
    [hoje, nota, JSON.stringify(itens)]);
  const problemas = itens.filter(i => i.estado !== 'ok');
  if (problemas.length) {
    const texto = `🛡️ *Boletim de segurança* — nota ${nota}/100\n\n` +
      problemas.map(i => `${i.estado === 'grave' ? '🔴' : '🟡'} ${i.titulo}: ${i.detalhe}\n   → ${i.comoResolver}`).join('\n') +
      `\n\nPainel completo: Configurações → Segurança.`;
    const { rows: admins } = await query('SELECT nome FROM usuarios WHERE ativo = true AND acesso_total = true');
    for (const a of admins) await avisarPessoa(a.nome, texto).catch(() => {});
  }
  // limpeza: evento com mais de 90 dias não interessa mais
  await query(`DELETE FROM seguranca_eventos WHERE quando < now() - interval '90 days'`);
  await query('DELETE FROM seguranca_bloqueios WHERE ate < now()');
  log?.push(`boletim de segurança do dia (nota ${nota})`);
}

// ---------------- rotas do painel (só administrador) ----------------
export const rotasSeguranca = Router();
// Guard rota a rota (e não no router inteiro): montado em '/api', um `use()` sem caminho barraria
// também as rotas registradas depois desta.
const soSeguranca = [exigirLogin, (req, res, next) => req.usuario?.acesso_total ? next() : res.status(403).json({ erro: 'Só administrador vê o painel de segurança.' })];

rotasSeguranca.get('/seguranca/painel', soSeguranca, async (req, res, next) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    let boletim = (await query('SELECT * FROM seguranca_boletins WHERE dia = $1', [hoje])).rows[0];
    if (!boletim) { const r = await autoexame(); boletim = { dia: hoje, nota: r.nota, itens: r.itens }; }
    const eventos = (await query('SELECT * FROM seguranca_eventos ORDER BY id DESC LIMIT 200')).rows;
    const bloqueios = (await query('SELECT * FROM seguranca_bloqueios WHERE ate > now() ORDER BY ate DESC')).rows;
    const resumo = (await query(
      `SELECT tipo, count(*)::int n FROM seguranca_eventos WHERE quando > now() - interval '7 days' GROUP BY tipo ORDER BY n DESC`)).rows;
    res.json({ boletim, eventos, bloqueios, resumo, rotulos: Object.fromEntries(Object.entries(EVENTOS).map(([k, v]) => [k, v.texto])) });
  } catch (e) { next(e); }
});

rotasSeguranca.post('/seguranca/conferir', soSeguranca, async (req, res, next) => {
  try {
    const r = await autoexame();
    const hoje = new Date().toISOString().slice(0, 10);
    await query('INSERT INTO seguranca_boletins (dia, nota, itens) VALUES ($1,$2,$3) ON CONFLICT (dia) DO UPDATE SET nota = EXCLUDED.nota, itens = EXCLUDED.itens, criado_em = now()',
      [hoje, r.nota, JSON.stringify(r.itens)]);
    res.json(r);
  } catch (e) { next(e); }
});

rotasSeguranca.post('/seguranca/liberar', soSeguranca, async (req, res, next) => {
  try {
    const ip = String(req.body?.ip || '');
    await query('DELETE FROM seguranca_bloqueios WHERE ip = $1', [ip]);
    bloqueiosMem.delete(ip);
    await query('INSERT INTO seguranca_eventos (tipo, gravidade, ip, quem, detalhe) VALUES ($1,1,$2,$3,$4)',
      ['ip-bloqueado', ip, req.usuario.nome, 'liberado manualmente']);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
