// Portal do cliente: o cliente entra com e-mail e senha (temporária na primeira vez) e vê só o
// processo dele — etapa, checklist com o que falta, status no USCIS e parcelas. Também anexa os
// documentos por ali, e cada envio vira histórico no processo + aviso no chat da equipe.
// O que o cliente pode ver é regra do escritório (Configurações → Regras → Portal do cliente).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { query } from './db.js';
import { ler, gravar } from './armazenamento.js';
import { salvarDataUri, arquivosDoItem } from './arquivos.js';
import { anotar } from './guardiao.js';
import { travado, errou, acertou } from './tentativas.js';
import { problemaNaSenha } from './senhas.js';
import { avisarCanal, avisarPessoa } from './chat.js';
import { obterRegras } from './regras.js';
import { exigirLogin } from './auth.js';
import { podeGravar } from './permissoes.js';
import { formularioPorId } from './formularios.js';
import { limparTexto } from './sanitizar.js';

const COOKIE = 'lw_cliente';
const K_PROCESSOS = 'legalway-processos-documentacao-v1';
const K_FINANCEIRO = 'legalway-financeiro-v1';
// Biblioteca de modelos por NOME de documento. "Mas eu enviei os modelos, e não
// é somente para o Visto T, outras também": o exemplo de carta pessoal é o mesmo
// em todo serviço que pede carta pessoal. Anexar um por serviço daria trabalho
// repetido; anexar dentro de cada processo multiplicaria o PDF 264 vezes no
// banco e em todo backup. Então o arquivo mora uma vez, e o processo o encontra
// pelo nome do documento.
const K_MODELOS = 'legalway-modelos-documentos-v1';
// O checklist do SERVIÇO. O processo nasce com uma cópia dele, e a cópia
// envelhece: marcar um documento como interno no serviço não chegava aos 264
// processos que já existiam. Ela marcou no Visto T, abriu o portal e os
// formulários continuavam lá.
//
// Em vez de reescrever 3.754 itens a cada mudança — o que dá uma gravação de
// 2 MB e uma chance de falhar pela metade —, o portal passa a CONSULTAR o
// serviço na hora de montar a tela. O que o processo tem ganha do serviço (foi
// alguém decidindo para aquele cliente); o que o processo não tem, o serviço
// responde.
const K_CHECKLISTS = 'legalway-checklists-v1';
const chaveDoNome = (n) => String(n || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// O mesmo nome sem o que está entre parênteses. O checklist do serviço diz
// "FORM LINK (REGISTRO DE DADOS DO CLIENTE)" e o processo, criado antes, diz
// só "FORM LINK" — é o MESMO documento, com a descrição acrescentada depois.
// Sem isto, ligar o formulário no serviço não alcançava esses processos.
const chaveSemDescricao = (n) => chaveDoNome(n).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
const DIAS_SESSAO = 30;
const hashToken = (t) => createHash('sha256').update(t).digest('hex');
const uid = (p) => p + Date.now().toString(36) + randomBytes(3).toString('hex');

// senha temporária fácil de ditar por telefone (sem caracteres ambíguos)
export function senhaTemporaria() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ', num = '23456789';
  const pega = (s, n) => Array.from({ length: n }, () => s[randomBytes(1)[0] % s.length]).join('');
  return `${pega(abc, 4)}-${pega(num, 4)}`;
}

// O limite de tentativas do portal usa o mesmo contador do sistema (tentativas.js), que fica no
// banco e vale pra todas as cópias do servidor ao mesmo tempo.

async function criarSessao(res, cliente, req) {
  const token = randomBytes(32).toString('hex');
  await query(
    `INSERT INTO sessoes_portal (token_hash, cliente_id, expira_em, ip) VALUES ($1,$2, now() + ($3||' days')::interval, $4)`,
    [hashToken(token), cliente.id, String(DIAS_SESSAO), req.ip]
  );
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: !!req.secure, path: '/', maxAge: DIAS_SESSAO * 864e5 });
}

async function clienteDaSessao(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const { rows } = await query(
    `SELECT c.* FROM sessoes_portal s JOIN portal_clientes c ON c.id = s.cliente_id
     WHERE s.token_hash = $1 AND s.expira_em > now() AND c.ativo = true`, [hashToken(token)]
  );
  if (!rows[0]) return null;
  query(`UPDATE sessoes_portal SET ultimo_acesso = now() WHERE token_hash = $1 AND ultimo_acesso < now() - interval '1 minute'`, [hashToken(token)]).catch(() => {});
  query(`UPDATE portal_clientes SET ultimo_acesso = now() WHERE id = $1 AND (ultimo_acesso IS NULL OR ultimo_acesso < now() - interval '5 minutes')`, [rows[0].id]).catch(() => {});
  return rows[0];
}
async function exigirCliente(req, res, next) {
  try {
    const c = await clienteDaSessao(req);
    if (!c) return res.status(401).json({ erro: 'Sessão expirada. Entre de novo.' });
    req.cliente = c; next();
  } catch (e) { next(e); }
}

async function bloco(chave, padrao = []) { const r = await ler(chave); return { valor: r ? r.valor : padrao, versao: r ? r.versao : null }; }

// Etapas que o cliente vê (linguagem simples), a partir do status interno do processo
const ETAPAS_CLIENTE = [
  { chave: 'documentos', nome: 'Reunindo documentos', quando: ['Aguardando boas-vindas', 'Documentos solicitados', 'Recebendo documentos'] },
  { chave: 'revisao', nome: 'Em revisão pelo escritório', quando: ['Documentação completa', 'Aguardando autorização financeira', 'Liberado para protocolo'] },
  { chave: 'protocolado', nome: 'Protocolado no USCIS', quando: ['Protocolado'] },
  { chave: 'acompanhamento', nome: 'Acompanhamento', quando: ['Em acompanhamento'] },
  { chave: 'finalizado', nome: 'Processo concluído', quando: ['Documento finalizado'] },
];

// Os modelos da biblioteca, indexados pelo nome do documento. Só é lida aqui, no
// momento de montar a tela do cliente — o arquivo em si nunca entra no processo.
// O que o serviço diz sobre cada documento, por nome. Só o que pode envelhecer
// na cópia do processo: se é interno, a orientação e o formulário.
async function servicoPorNome(servico) {
  try {
    const { valor } = await bloco(K_CHECKLISTS);
    const lista = Array.isArray(valor) ? valor : [];
    const alvo = String(servico || '').trim().toLowerCase();
    const ck = lista.find(c => c && String(c.servico || '').trim().toLowerCase() === alvo);
    if (!ck) return new Map();
    const mapa = new Map();
    const guardar = (k, v) => { if (k && !mapa.has(k)) mapa.set(k, v); };
    const itens = [...(ck.documentos || []), ...(ck.documentosDependente || [])].filter(d => d && d.nome);
    // Primeiro o nome inteiro: ele é o que vale quando existe dos dois lados.
    for (const d of itens) guardar(chaveDoNome(d.nome), { interno: !!d.interno, dica: d.dica || '', formularioId: d.formularioId || '' });
    // Depois a versão sem a descrição entre parênteses, como segunda chance.
    for (const d of itens) guardar(chaveSemDescricao(d.nome), { interno: !!d.interno, dica: d.dica || '', formularioId: d.formularioId || '' });
    return mapa;
  } catch { return new Map(); }
}

// O documento do processo visto já com o que o serviço completa. Tudo que
// decide o que o cliente pode fazer precisa enxergar a mesma coisa que a tela
// dele enxerga — senão ele vê "Preencher formulário" e o botão responde 404.
async function docDoCliente(p, indice) {
  const doc = (p.checklist || [])[indice];
  if (!doc) return null;
  const mapa = await servicoPorNome(p.servico);
  const doServico = mapa.get(chaveDoNome(doc.nome)) || mapa.get(chaveSemDescricao(doc.nome)) || {};
  return {
    doc,
    interno: !!(doc.interno || doServico.interno),
    formularioId: doc.formularioId || doServico.formularioId || '',
  };
}

async function modelosPorNome() {
  try {
    const { valor } = await bloco(K_MODELOS);
    const lista = Array.isArray(valor) ? valor : [];
    return new Map(lista
      .filter(m => m && m.nome && m.arquivo && m.arquivo.url)
      .map(m => [chaveDoNome(m.nome), { nome: m.arquivo.nome || 'modelo', url: m.arquivo.url }]));
  } catch { return new Map(); }
}

function visaoDoProcesso(p, R, contas, modelos, doServico) {
  // O serviço completa o que a cópia do processo não tem.
  const noServico = (nome) => (doServico && (doServico.get(chaveDoNome(nome)) || doServico.get(chaveSemDescricao(nome)))) || null;
  const P = R.portal || {};
  const etapaAtual = ETAPAS_CLIENTE.findIndex(e => e.quando.includes(p.status));
  // Formulário é trabalho do escritório: o cliente não tem o que anexar num I-914 ou
  // num G-1145. Mostrar isso no portal faz ele achar que está devendo documento e ligar
  // para perguntar o que fazer. O índice original é preservado, porque é por ele que o
  // envio do cliente encontra o item certo no checklist interno.
  const checklist = (p.checklist || [])
    .map((d, i) => ({ d, i }))
    // Interno é interno: marcado no processo OU no checklist do serviço.
    .filter(({ d }) => !(d.interno || (noServico(d.nome) || {}).interno))
    .map(({ d, i }) => ({
    indice: i, nome: d.nome,
    dica: d.dica || (noServico(d.nome) || {}).dica || '',
    status: d.status || 'Não solicitado',
    // De quem é este documento: o titular ou cada dependente. A tela agrupa por
    // isto — "Passaporte" três vezes seguidas não diz a ninguém de quem é cada um.
    grupo: d.grupo || '',
    // Documento que vai para tradução: o cliente escolhe se o escritório traduz ou
    // se ele providencia por fora. Quem não escolheu ainda vem como null — a tela
    // mostra a pergunta, e não uma resposta que ele nunca deu.
    // Item que é formulário: o cliente preenche dentro do sistema, não anexa arquivo.
    formularioId: d.formularioId || (noServico(d.nome) || {}).formularioId || '',
    // Exemplo pronto para o cliente usar de base. Vai junto porque "manda a carta de
    // testemunha" sem mostrar como é uma carta de testemunha trava qualquer pessoa.
    // O modelo do próprio item vem primeiro: se alguém anexou algo específico
    // naquele processo, é esse que vale. Sem ele, cai na biblioteca.
    modelo: d.modelo && d.modelo.url
      ? { nome: d.modelo.nome || 'modelo', url: d.modelo.url }
      : (modelos && modelos.get(chaveDoNome(d.nome))) || null,
    traduz: d.precisaTraducao !== false,
    traducaoPeloCliente: d.traducaoPeloCliente === undefined ? null : !!d.traducaoPeloCliente,
    // Todos os anexos deste item. Um documento pode precisar de dois arquivos —
    // frente e verso — e antes o segundo substituía o primeiro.
    arquivos: arquivosDoItem(d).map(a => ({ nome: a.nome, url: a.url })),
    temArquivo: arquivosDoItem(d).length > 0,
    arquivoNome: (arquivosDoItem(d)[0] || {}).nome || null,
    podeEnviar: ['Não solicitado', 'Solicitado', 'Incorreto', 'Recebido'].includes(d.status || 'Não solicitado'),
  }));
  // A tradução é UMA pergunta, não uma por documento. Perguntar quinze vezes a
  // mesma coisa — foi o que ela viu no portal — faz o cliente desistir na
  // terceira. A resposta vale para todos os documentos que precisam.
  const precisamTraducao = checklist.filter(d => d.traduz);
  const escolhas = new Set(precisamTraducao.map(d => d.traducaoPeloCliente));
  const traducao = {
    precisa: precisamTraducao.length > 0,
    quantos: precisamTraducao.length,
    documentos: precisamTraducao.map(d => d.nome),
    // Só é "respondida" quando todos concordam. Processo antigo, com respostas
    // diferentes por documento, volta a perguntar uma vez — e a resposta nova
    // vale para todos.
    peloCliente: escolhas.size === 1 ? [...escolhas][0] : null,
  };
  const visao = {
    nome: p.clienteNome, servico: p.servico, responsavel: p.responsavel || '',
    traducao,
    etapas: ETAPAS_CLIENTE.map((e, i) => ({ nome: e.nome, feita: etapaAtual >= 0 && i < etapaAtual, atual: i === etapaAtual })),
    statusInterno: p.status,
    checklist,
    resumo: {
      total: checklist.length,
      aprovados: checklist.filter(d => d.status === 'Aprovado').length,
      pendentes: checklist.filter(d => !d.temArquivo && d.status !== 'Aprovado').length,
      refazer: checklist.filter(d => d.status === 'Incorreto').length,
    },
  };
  if (P.mostrarUscis !== false && p.protocolo) {
    visao.protocolo = { numero: p.protocolo.numero || '', data: p.protocolo.data || '', recibo: p.protocolo.recibo || '' };
    if (p.uscis && p.uscis.status) visao.uscis = { status: p.uscis.status, descricao: p.uscis.descricao || '', atualizadoEm: p.uscis.atualizadoEm || '', consultadoEm: p.uscis.consultadoEm || '', historico: (p.uscis.historico || []).slice(0, 10) };
  }
  visao.avisos = (p.avisosCliente || []).slice(0, 10).map(a => ({ titulo: a.titulo, texto: a.texto, quando: a.quando, tipo: a.tipo }));
  if (P.mostrarFinanceiro !== false) {
    const minhas = contas.filter(c => (p.contratoId && c.contratoId === p.contratoId) || (!p.contratoId && c.clienteNome === p.clienteNome));
    visao.pagamentos = {
      parcelas: minhas.map(c => ({ descricao: c.descricao, vencimento: c.vencimento, valor: Number(c.valor || 0), status: c.status, recebidoEm: c.dataRecebimento || null })).sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || '')),
      pago: minhas.reduce((s, c) => s + Number(c.valorRecebido || 0), 0),
      total: minhas.reduce((s, c) => s + Number(c.valor || 0), 0),
    };
  }
  return visao;
}

export const rotasPortalCliente = Router();

// ---- rotas do cliente (sem login do sistema) ----
rotasPortalCliente.post('/portal/login', async (req, res, next) => {
  try {
    // O login é o telefone ou o e-mail. Muita gente do escritório não usa e-mail:
    // exigir e-mail deixava o portal inacessível para quem mais precisa dele.
    const digitado = String(req.body?.login ?? req.body?.email ?? '').trim();
    const senha = String(req.body?.senha || '');
    if (!digitado || !senha) return res.status(400).json({ erro: 'Preencha o telefone (ou e-mail) e a senha.' });
    // A terceira chave conta por ORIGEM, sem o login dentro. Sem ela, alguém varreria
    // 00001, 00002, 00003… e nenhum contador dispararia, porque os dois primeiros só
    // contam erros do MESMO login. Com número em sequência isso deixa de ser teórico.
    const chaves = [`portal:${digitado.toLowerCase()}`, `portal-ip:${req.ip}|${digitado.toLowerCase()}`, { chave: `portal-origem:${req.ip}`, max: 30 }];
    if (await travado(chaves)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.' });

    const digitos = soDigitos(digitado);
    let rows = [];
    // O número do cliente tem até 6 dígitos; telefone tem 8 ou mais. A fronteira
    // separa os dois sem o cliente precisar dizer qual está usando.
    if (digitos && digitos.length <= 6 && !digitado.includes('@')) {
      rows = (await query('SELECT * FROM portal_clientes WHERE numero = $1', [Number(digitos)])).rows;
    }
    if (!rows.length && digitos.length >= 8 && !digitado.includes('@')) {
      // Casa pelo FINAL do número: o cadastro pode ter o código do país e o cliente
      // digitar sem, ou o contrário. Exigir os dois iguais reprovaria quem acertou.
      rows = (await query(
        'SELECT * FROM portal_clientes WHERE telefone = $1 OR telefone LIKE $2 OR $1 LIKE \'%\' || telefone',
        [digitos, '%' + digitos])).rows;
    }
    if (!rows.length) {
      rows = (await query('SELECT * FROM portal_clientes WHERE email = $1', [digitado.toLowerCase()])).rows;
    }
    if (rows.length > 1) {
      // Número repetido entre clientes: o sistema não tem como saber qual processo
      // abrir, e escolher um seria mostrar o processo de outra pessoa.
      anotar('login-errado', req, 'portal, telefone atende a mais de um cliente: ' + digitos);
      return res.status(409).json({ erro: 'Esse telefone está em mais de um cadastro. Entre com o seu e-mail, ou fale com o escritório.' });
    }
    const c = rows[0];
    const ok = c && c.ativo && await bcrypt.compare(senha, c.senha_hash);
    if (!ok) {
      await errou(chaves);
      anotar(await travado(chaves) ? 'portal-forca-bruta' : 'login-errado', req, 'portal, login tentado: ' + digitado);
      return res.status(401).json({ erro: 'Telefone (ou e-mail) e senha não conferem.' });
    }
    await acertou(chaves);
    await criarSessao(res, c, req);
    res.json({ ok: true, nome: c.nome, trocarSenha: c.trocar_senha });
  } catch (e) { next(e); }
});

rotasPortalCliente.post('/portal/logout', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) await query('DELETE FROM sessoes_portal WHERE token_hash = $1', [hashToken(token)]).catch(() => {});
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

rotasPortalCliente.post('/portal/senha', exigirCliente, async (req, res, next) => {
  try {
    const atual = String(req.body?.senhaAtual || ''), nova = String(req.body?.senhaNova || '');
    const ruim = problemaNaSenha(nova, { nome: req.cliente.nome, email: req.cliente.email });
    if (ruim) return res.status(400).json({ erro: ruim });
    if (!(await bcrypt.compare(atual, req.cliente.senha_hash))) return res.status(401).json({ erro: 'Senha atual incorreta.' });
    if (atual === nova) return res.status(400).json({ erro: 'A senha nova precisa ser diferente da atual.' });
    await query('UPDATE portal_clientes SET senha_hash = $1, trocar_senha = false WHERE id = $2', [await bcrypt.hash(nova, 12), req.cliente.id]);
    await query('DELETE FROM sessoes_portal WHERE cliente_id = $1 AND token_hash <> $2', [req.cliente.id, hashToken(req.cookies[COOKIE])]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rotasPortalCliente.get('/portal/eu', exigirCliente, async (req, res, next) => {
  try {
    const R = await obterRegras();
    if (R.portal && R.portal.ativo === false) return res.status(403).json({ erro: 'O portal está desativado no momento. Fale com o escritório.' });
    const { valor: processos } = await bloco(K_PROCESSOS);
    const p = processos.find(x => x.id === req.cliente.processo_id);
    if (!p) return res.status(404).json({ erro: 'Não encontramos seu processo. Fale com o escritório.' });
    const { valor: contas } = await bloco(K_FINANCEIRO);
    res.json({
      cliente: { nome: req.cliente.nome, email: req.cliente.email, trocarSenha: req.cliente.trocar_senha },
      empresa: R.empresa, portal: { ...(R.portal || {}) },
      processo: visaoDoProcesso(p, R, contas, await modelosPorNome(), await servicoPorNome(p.servico)),
    });
  } catch (e) { next(e); }
});

rotasPortalCliente.post('/portal/documento', exigirCliente, async (req, res, next) => {
  try {
    const R = await obterRegras();
    if (R.portal && (R.portal.ativo === false || R.portal.permitirEnvio === false)) return res.status(403).json({ erro: 'O envio de documentos está desativado. Fale com o escritório.' });
    const indice = Number(req.body?.indice);
    const nomeArquivo = String(req.body?.nome || 'documento').slice(0, 120);
    const dataUri = String(req.body?.arquivo || '');
    if (!dataUri.startsWith('data:')) return res.status(400).json({ erro: 'Arquivo inválido.' });
    const { valor: processos, versao } = await bloco(K_PROCESSOS);
    const p = processos.find(x => x.id === req.cliente.processo_id);
    if (!p) return res.status(404).json({ erro: 'Processo não encontrado.' });
    const doc = (p.checklist || [])[indice];
    if (!doc) return res.status(400).json({ erro: 'Documento não encontrado no seu checklist.' });
    // O item interno não aparece no portal, mas o índice viaja no pedido: sem esta
    // linha, bastaria mudar o número para anexar num formulário do escritório.
    // Olha o serviço também, pelo mesmo motivo da tela: marcar como interno no
    // checklist do serviço vale para os processos que já existem.
    const visto = await docDoCliente(p, indice);
    if (!visto || visto.interno) return res.status(400).json({ erro: 'Documento não encontrado no seu checklist.' });
    if (doc.status === 'Aprovado') return res.status(409).json({ erro: 'Esse documento já foi aprovado pelo escritório.' });
    const link = await salvarDataUri(dataUri, nomeArquivo, 'portal:' + req.cliente.email);
    if (!link) return res.status(400).json({ erro: 'Não foi possível ler o arquivo.' });
    // Acrescenta, não substitui. O cliente que manda a frente e depois o verso
    // não pode perder a frente — era o que acontecia.
    const anexo = { nome: nomeArquivo, url: link, enviadoEm: new Date().toISOString(), enviadoPor: 'cliente' };
    doc.arquivos = Array.isArray(doc.arquivos) ? doc.arquivos : [];
    if (doc.arquivo) { doc.arquivos.unshift(doc.arquivo); doc.arquivo = null; }   // o que já existia vira o primeiro da lista
    doc.arquivos.push(anexo);
    doc.status = 'Recebido';
    p.historico = p.historico || [];
    p.historico.push({ quando: new Date().toISOString(), texto: `Cliente enviou pelo portal: ${doc.nome} (${nomeArquivo})` });
    // O cliente começou a mandar: o cartão sai de "Documentos solicitados" e
    // vai para "Recebendo documentos". Antes ficava parado, e o quadro dizia
    // que ninguém tinha mandado nada enquanto os arquivos chegavam.
    if (p.status === 'Documentos solicitados' || p.status === 'Aguardando boas-vindas') {
      const antes = p.status;
      p.status = 'Recebendo documentos';
      p.historico.push({ quando: new Date().toISOString(),
        texto: `Movido de "${antes}" para "Recebendo documentos" — o cliente começou a enviar.` });
    }
    if (p.semRetorno) { p.semRetorno = false; p.semRetornoDesde = null; }
    await gravar(K_PROCESSOS, processos, versao, 'portal do cliente');
    const aviso = `📎 ${p.clienteNome} enviou "${doc.nome}" pelo portal do cliente. Veja em Documentação → Checklist.`;
    avisarCanal('documentacao', aviso).catch(() => {});
    if (p.responsavel) avisarPessoa(p.responsavel, aviso).catch(() => {});
    res.json({ ok: true, status: doc.status });
  } catch (e) {
    if (e.status === 413 || e.status === 415) return res.status(e.status).json({ erro: e.message });
    next(e);
  }
});

// O cliente escolhe quem traduz: o escritório ou ele mesmo. Dizer "eu traduzo" tira o
// documento do pacote da tradutora — e isso é dinheiro, então a escolha fica registrada
// no histórico com o nome de quem decidiu e vira aviso para a equipe.
// A escolha da tradução é do PROCESSO, não de cada documento: uma pergunta, uma
// resposta, e ela vale para tudo que precisa de tradução. Continua gravada em
// cada documento porque é de lá que o pacote da tradutora é montado.
rotasPortalCliente.post('/portal/traducao', exigirCliente, async (req, res, next) => {
  try {
    const peloCliente = !!req.body?.peloCliente;
    const { valor: processos, versao } = await bloco(K_PROCESSOS);
    const p = processos.find(x => x.id === req.cliente.processo_id);
    if (!p) return res.status(404).json({ erro: 'Processo não encontrado.' });

    const doServico = await servicoPorNome(p.servico);
    const ehInterno = (d) => !!(d.interno || (doServico.get(chaveDoNome(d.nome)) || doServico.get(chaveSemDescricao(d.nome)) || {}).interno);
    const alvo = (p.checklist || []).filter(d => d && !ehInterno(d) && d.precisaTraducao !== false);
    if (!alvo.length) return res.status(409).json({ erro: 'Nenhum documento seu precisa de tradução.' });
    const jaEra = alvo.every(d => d.traducaoPeloCliente === peloCliente) && p.traducaoPeloCliente === peloCliente;
    if (jaEra) return res.json({ ok: true, peloCliente });

    for (const d of alvo) d.traducaoPeloCliente = peloCliente;
    p.traducaoPeloCliente = peloCliente;
    p.historico = p.historico || [];
    p.historico.push({ quando: new Date().toISOString(),
      texto: peloCliente
        ? `Cliente escolheu providenciar a tradução por conta (${alvo.length} documento(s))`
        : `Cliente pediu que o escritório traduza (${alvo.length} documento(s))` });
    await gravar(K_PROCESSOS, processos, versao, 'portal do cliente');

    const aviso = peloCliente
      ? `🌐 ${p.clienteNome} vai providenciar a tradução por conta — os ${alvo.length} documentos não entram no pacote da tradutora.`
      : `🌐 ${p.clienteNome} pediu que o escritório cuide da tradução (${alvo.length} documento(s)).`;
    avisarCanal('documentacao', aviso).catch(() => {});
    if (p.responsavel) avisarPessoa(p.responsavel, aviso).catch(() => {});
    res.json({ ok: true, peloCliente });
  } catch (e) { next(e); }
});

// ---- formulário preenchido dentro do sistema ----
// As respostas moram no processo, junto do documento a que pertencem. Salvar é
// incremental: são 63 campos e ninguém preenche de uma sentada — perder o que já
// escreveu seria motivo para não voltar.
const campoValido = (campos, id) => campos.some(c => c.id === id && c.tipo !== 'titulo');

rotasPortalCliente.get('/portal/formulario/:indice', exigirCliente, async (req, res, next) => {
  try {
    const indice = Number(req.params.indice);
    const { valor: processos } = await bloco(K_PROCESSOS);
    const p = processos.find(x => x.id === req.cliente.processo_id);
    const doc = p && (p.checklist || [])[indice];
    const visto = p ? await docDoCliente(p, indice) : null;
    if (!visto || visto.interno || !visto.formularioId) return res.status(404).json({ erro: 'Formulário não encontrado.' });
    const f = formularioPorId(visto.formularioId);
    if (!f) return res.status(404).json({ erro: 'Formulário não encontrado.' });
    res.json({ nome: f.nome, campos: f.campos, respostas: doc.respostas || {},
      enviadoEm: doc.formularioEnviadoEm || null, status: doc.status || 'Não solicitado' });
  } catch (e) { next(e); }
});

rotasPortalCliente.post('/portal/formulario/:indice', exigirCliente, async (req, res, next) => {
  try {
    const indice = Number(req.params.indice);
    const respostas = req.body?.respostas;
    const enviar = !!req.body?.enviar;
    if (!respostas || typeof respostas !== 'object') return res.status(400).json({ erro: 'Respostas inválidas.' });
    const { valor: processos, versao } = await bloco(K_PROCESSOS);
    const p = processos.find(x => x.id === req.cliente.processo_id);
    const doc = p && (p.checklist || [])[indice];
    const visto = p ? await docDoCliente(p, indice) : null;
    if (!visto || visto.interno || !visto.formularioId) return res.status(404).json({ erro: 'Formulário não encontrado.' });
    if (doc.status === 'Aprovado') return res.status(409).json({ erro: 'Esse formulário já foi conferido pelo escritório.' });
    const f = formularioPorId(visto.formularioId);
    if (!f) return res.status(404).json({ erro: 'Formulário não encontrado.' });

    // Só entram campos que existem no formulário: o corpo do pedido vem do navegador
    // e não pode escrever o que quiser dentro do processo.
    doc.respostas = doc.respostas || {};
    for (const [k, v] of Object.entries(respostas)) {
      if (campoValido(f.campos, k)) doc.respostas[k] = String(v == null ? '' : v).slice(0, 2000);
    }
    doc.formularioSalvoEm = new Date().toISOString();

    if (enviar) {
      const faltando = f.campos.filter(c => c.obrigatorio && c.tipo !== 'titulo' && !String(doc.respostas[c.id] || '').trim());
      if (faltando.length) return res.status(400).json({ erro: 'Faltou preencher: ' + faltando.map(c => c.rotulo).join(', ') });
      doc.status = 'Recebido';
      doc.formularioEnviadoEm = new Date().toISOString();
      p.historico = p.historico || [];
      p.historico.push({ quando: new Date().toISOString(), texto: `Cliente preencheu e enviou o formulário: ${doc.nome}` });
      if (p.semRetorno) { p.semRetorno = false; p.semRetornoDesde = null; }
    }
    await gravar(K_PROCESSOS, processos, versao, 'portal do cliente');
    if (enviar) {
      const aviso = `📝 ${p.clienteNome} enviou o formulário "${doc.nome}". Confira em Documentação → Checklist.`;
      avisarCanal('documentacao', aviso).catch(() => {});
      if (p.responsavel) avisarPessoa(p.responsavel, aviso).catch(() => {});
    }
    res.json({ ok: true, enviado: enviar, status: doc.status });
  } catch (e) { next(e); }
});

// ---- rotas da equipe (gerenciar o acesso do cliente) ----
const podeGerenciar = (req) => podeGravar(req.usuario, K_PROCESSOS);

rotasPortalCliente.get('/portal-acessos/:processoId', exigirLogin, async (req, res, next) => {
  try {
    if (!podeGerenciar(req)) return res.status(403).json({ erro: 'Sem permissão em Documentação.' });
    const { rows } = await query('SELECT id, nome, email, ativo, trocar_senha, criado_em, ultimo_acesso FROM portal_clientes WHERE processo_id = $1', [String(req.params.processoId)]);
    res.json({ acesso: rows[0] || null });
  } catch (e) { next(e); }
});

// Cria (ou renova) o acesso de um processo e devolve a senha em claro — a única
// vez que ela existe fora do hash. Usado pela tela e pelo aviso automático que
// manda as credenciais no WhatsApp: como o hash é irreversível, não há como
// "consultar a senha depois" — quem avisa tem de ser quem cria.
//
// RENOVAR DERRUBA O ACESSO ATUAL: troca a senha e encerra as sessões. Por isso
// quem chama sozinho (automação) só chama para quem ainda não tem acesso.
// Só dígitos: o cliente digita (68) 9288-4130, 68 9288 4130 ou +55 68 9288-4130 e o
// sistema entende os três. Guardar formatado faria o login depender de ele lembrar
// exatamente como alguém digitou o número no cadastro.
export const soDigitos = (t) => String(t || '').replace(/\D/g, '');

export async function criarAcessoDoProcesso(processoId, nome, email, quem, telefone) {
  const limpo = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpo)) return { ok: false, motivo: 'e-mail inválido' };
  const outro = await query('SELECT id FROM portal_clientes WHERE email = $1 AND processo_id <> $2', [limpo, processoId]);
  if (outro.rows[0]) return { ok: false, motivo: 'e-mail já usado por outro cliente no portal' };
  // O telefone é o login principal, mas não pode impedir o acesso de existir: se o
  // número já é de outro cliente (família que compartilha celular), o acesso nasce
  // só com e-mail em vez de falhar.
  let tel = soDigitos(telefone);
  if (tel.length < 8) tel = '';
  if (tel) {
    const dono = await query('SELECT id FROM portal_clientes WHERE telefone = $1 AND processo_id <> $2', [tel, processoId]);
    if (dono.rows[0]) tel = '';
  }
  const senha = senhaTemporaria();
  const hash = await bcrypt.hash(senha, 12);
  const { rows } = await query('SELECT id, numero FROM portal_clientes WHERE processo_id = $1', [processoId]);
  // O número é do cliente, não do acesso: renovar a senha não pode trocar o número que
  // ele já anotou. Só nasce um novo quando o cliente ainda não tinha.
  let numero = rows[0] && rows[0].numero;
  if (!numero) {
    const prox = await query('SELECT coalesce(max(numero), 0) + 1 AS n FROM portal_clientes');
    numero = prox.rows[0].n;
  }
  if (rows[0]) {
    await query('UPDATE portal_clientes SET nome=$1, email=$2, senha_hash=$3, telefone=$4, numero=$5, trocar_senha=true, ativo=true WHERE id=$6', [nome || 'Cliente', limpo, hash, tel || null, numero, rows[0].id]);
    await query('DELETE FROM sessoes_portal WHERE cliente_id = $1', [rows[0].id]);
  } else {
    await query('INSERT INTO portal_clientes (id, processo_id, nome, email, telefone, numero, senha_hash, criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [uid('pc'), processoId, nome || 'Cliente', limpo, tel || null, numero, hash, quem || 'Sistema']);
  }
  await query('INSERT INTO auditoria (quem, chave, item_id, acao, resumo) VALUES ($1,$2,$3,$4,$5)',
    [quem || 'Sistema', K_PROCESSOS, processoId, 'alterado', `Acesso do cliente ao portal criado/renovado (${limpo})`]).catch(() => {});
  // `login` é o que vai na mensagem para o cliente: o telefone quando existe, senão
  // o e-mail. Mandar o e-mail para quem não usa e-mail é o problema que isto resolve.
  // O login que vai na mensagem é o NÚMERO: é o único que todo cliente tem, que não
  // depende de formato e que ele consegue ditar por telefone sem errar.
  const numeroTexto = String(numero).padStart(5, '0');
  return { ok: true, email: limpo, telefone: tel, numero: numeroTexto, login: numeroTexto, senha };
}

/** Processos que já têm acesso ao portal — para a automação não renovar o de ninguém. */
export async function processosComAcesso() {
  try {
    const { rows } = await query('SELECT processo_id FROM portal_clientes');
    return new Set(rows.map(r => String(r.processo_id)));
  } catch { return new Set(); }
}

rotasPortalCliente.post('/portal-acessos/:processoId', exigirLogin, async (req, res, next) => {
  try {
    if (!podeGerenciar(req)) return res.status(403).json({ erro: 'Sem permissão em Documentação.' });
    const processoId = String(req.params.processoId);
    const email = String(limparTexto(req.body?.email || '')).trim().toLowerCase();
    const nome = String(limparTexto(req.body?.nome || '')).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
    // O telefone vem do próprio processo: é por ele que o cliente vai entrar, e ninguém
    // deveria precisar redigitar o que o sistema já sabe.
    const { valor: processos } = await bloco(K_PROCESSOS);
    const proc = processos.find(x => String(x.id) === processoId);
    const r = await criarAcessoDoProcesso(processoId, nome, email, req.usuario.nome, proc && proc.telefone);
    if (!r.ok) return res.status(r.motivo.includes('já usado') ? 409 : 400).json({ erro: 'Esse ' + r.motivo + '.' });
    res.status(201).json({ ok: true, email: r.email, login: r.login, numero: r.numero, telefone: r.telefone, senhaTemporaria: r.senha });
  } catch (e) { next(e); }
});

rotasPortalCliente.post('/portal-acessos/:processoId/ativo', exigirLogin, async (req, res, next) => {
  try {
    if (!podeGerenciar(req)) return res.status(403).json({ erro: 'Sem permissão em Documentação.' });
    const ativo = !!req.body?.ativo;
    await query('UPDATE portal_clientes SET ativo = $1 WHERE processo_id = $2', [ativo, String(req.params.processoId)]);
    if (!ativo) await query('DELETE FROM sessoes_portal WHERE cliente_id IN (SELECT id FROM portal_clientes WHERE processo_id = $1)', [String(req.params.processoId)]);
    res.json({ ok: true, ativo });
  } catch (e) { next(e); }
});
