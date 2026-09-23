// Primeiro acesso de uma instalação nova (escritório novo): cria o administrador, a marca e os serviços da biblioteca.
// Só funciona enquanto NÃO existe nenhum usuário. Depois disso, a rota se fecha sozinha.
import { Router } from 'express';
import { query } from './db.js';
import { hashSenha, permissoesTotal, exigirLogin } from './auth.js';
import { gravar, ler } from './armazenamento.js';
import { CHAVE_REGRAS, invalidarRegras } from './regras.js';
import { BIBLIOTECA_VISTOS, dicaDoDocumento } from './biblioteca-vistos.js';
import { limparValor } from './sanitizar.js';

export async function precisaInstalar() {
  const { rows } = await query("SELECT count(*)::int AS n FROM usuarios WHERE id <> 'sistema'");
  return rows[0].n === 0;
}

export const rotasInstalacao = Router();

// Diagnóstico de rede: devolve SÓ o endereço e os cabeçalhos do próprio visitante (nada de outra
// pessoa, nada do servidor). Serve pra saber qual cabeçalho o provedor entrega de verdade —
// é isso que define de onde o sistema lê o endereço real de quem chama.
rotasInstalacao.get('/publico/meu-endereco', (req, res) => {
  res.json({
    reqIp: req.ip,
    socket: req.socket?.remoteAddress || null,
    xForwardedFor: req.get('x-forwarded-for') || null,
    xRealIp: req.get('x-real-ip') || null,
    xEnvoyExternalAddress: req.get('x-envoy-external-address') || null,
    cfConnectingIp: req.get('cf-connecting-ip') || null,
    trueClientIp: req.get('true-client-ip') || null,
  });
});

rotasInstalacao.get('/publico/instalacao', async (req, res, next) => {
  try {
    // A lista de vistos só vai junto quando o sistema ainda não foi instalado (a tela de primeiro acesso
    // precisa dela). Depois de instalado não faz sentido entregar o catálogo pra quem não está logado.
    const precisa = await precisaInstalar();
    const biblioteca = precisa ? BIBLIOTECA_VISTOS.map(v => ({ key: v.key, nome: v.nome, categoria: v.categoria, documentos: v.documentos.length })) : [];
    res.json({ precisaInstalar: precisa, biblioteca });
  }
  catch (e) { next(e); }
});

rotasInstalacao.post('/publico/instalacao', async (req, res, next) => {
  try {
    if (!(await precisaInstalar())) return res.status(403).json({ erro: 'Este sistema já foi instalado.' });
    const b = limparValor(req.body || {});
    const emp = b.empresa || {}, adm = b.admin || {};
    const nomeEmpresa = String(emp.nome || '').trim();
    const nomeAdm = String(adm.nome || '').trim(), login = String(adm.usuario || '').trim().toLowerCase(), senha = String(adm.senha || '');
    if (!nomeEmpresa) return res.status(400).json({ erro: 'Informe o nome do escritório.' });
    if (!nomeAdm || !/^[a-z0-9._-]{2,40}$/.test(login)) return res.status(400).json({ erro: 'Informe o nome e um login válido pro administrador.' });
    if (senha.length < 8) return res.status(400).json({ erro: 'A senha do administrador precisa ter pelo menos 8 caracteres.' });
    const vistos = Array.isArray(b.vistos) ? b.vistos.map(String) : [];

    // 1) administrador
    await query(
      `INSERT INTO usuarios (id, nome, usuario, senha_hash, cargo, papel, acesso_total, permissoes, ativo, trocar_senha)
       VALUES ($1,$2,$3,$4,$5,'socio',true,$6,true,false)`,
      ['u1', nomeAdm, login, await hashSenha(senha), String(adm.cargo || 'Administrador'), JSON.stringify(permissoesTotal())]
    );
    // 2) marca (só os campos informados; o resto fica no padrão)
    const regrasAtuais = (await ler(CHAVE_REGRAS))?.valor || {};
    const empresa = { ...(regrasAtuais.empresa || {}) };
    for (const k of ['nome', 'nomeCurto', 'slogan', 'endereco', 'cidade', 'telefone', 'email', 'site', 'fuso', 'moeda']) if (emp[k] !== undefined && emp[k] !== '') empresa[k] = String(emp[k]);
    if (!empresa.nomeCurto) empresa.nomeCurto = nomeEmpresa.split(/\s+/).map(p => p[0]).join('').slice(0, 4).toUpperCase();
    await gravar(CHAVE_REGRAS, { ...regrasAtuais, empresa }, null, 'instalação');
    invalidarRegras();
    // 3) serviços + checklists da biblioteca
    const escolhidos = BIBLIOTECA_VISTOS.filter(v => vistos.includes(v.key));
    if (escolhidos.length) {
      const uid = (p) => p + Date.now() + Math.floor(Math.random() * 1000);
      await gravar('legalway-servicos-v1', escolhidos.map(v => ({ id: uid('sv'), nome: v.nome, template: v.template })), null, 'instalação');
      await gravar('legalway-checklists-v1', escolhidos.map(v => ({ id: uid('ck'), servico: v.nome, documentos: v.documentos.map(nome => ({ nome, dica: dicaDoDocumento(nome) })) })), null, 'instalação');
    }
    res.status(201).json({ ok: true, login });
  } catch (e) { next(e); }
});

// Biblioteca disponível pra quem já está logado (Configurações → Serviços → "Adicionar da biblioteca").
// Exige login: são 20 vistos e quase 300 documentos montados pelo escritório — conteúdo do produto.
rotasInstalacao.get('/biblioteca-vistos', exigirLogin, (req, res) => res.json({ biblioteca: BIBLIOTECA_VISTOS.map(v => ({ ...v, dicas: Object.fromEntries(v.documentos.map(n => [n, dicaDoDocumento(n)])) })) }));
