// Primeiro acesso de uma instalação nova (escritório novo): cria o administrador, a marca e os serviços da biblioteca.
// Só funciona enquanto NÃO existe nenhum usuário. Depois disso, a rota se fecha sozinha.
import { Router } from 'express';
import { query } from './db.js';
import { hashSenha, permissoesTotal } from './auth.js';
import { gravar, ler } from './armazenamento.js';
import { CHAVE_REGRAS, invalidarRegras } from './regras.js';
import { BIBLIOTECA_VISTOS } from './biblioteca-vistos.js';
import { limparValor } from './sanitizar.js';

export async function precisaInstalar() {
  const { rows } = await query("SELECT count(*)::int AS n FROM usuarios WHERE id <> 'sistema'");
  return rows[0].n === 0;
}

export const rotasInstalacao = Router();

rotasInstalacao.get('/publico/instalacao', async (req, res, next) => {
  try { res.json({ precisaInstalar: await precisaInstalar(), biblioteca: BIBLIOTECA_VISTOS.map(v => ({ key: v.key, nome: v.nome, categoria: v.categoria, documentos: v.documentos.length })) }); }
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
      await gravar('legalway-checklists-v1', escolhidos.map(v => ({ id: uid('ck'), servico: v.nome, documentos: v.documentos.map(nome => ({ nome })) })), null, 'instalação');
    }
    res.status(201).json({ ok: true, login });
  } catch (e) { next(e); }
});

// Biblioteca disponível pra quem já está logado (Configurações → Serviços → "Adicionar da biblioteca")
rotasInstalacao.get('/biblioteca-vistos', (req, res) => res.json({ biblioteca: BIBLIOTECA_VISTOS }));
