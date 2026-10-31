// Porta de entrada de lead, comum a todos os canais automáticos.
//
// Formulário do Facebook e mensagem de WhatsApp caem aqui. O que importa é que
// os dois gravem no MESMO lugar (legalway-leads-v1) e do MESMO jeito que um lead
// digitado — é isso que faz a automação de primeiro contato disparar igual, sem
// nenhum caso especial.
//
// E é aqui que mora a junção: a pessoa que preenche o formulário e logo manda
// WhatsApp é UMA pessoa. Vira um lead com dois canais, não dois leads.
import { ler, gravar } from './armazenamento.js';
import { avisarCanal } from './chat.js';
import { limparValor } from './sanitizar.js';

export const CHAVE_LEADS = 'legalway-leads-v1';
const JANELA_DIAS = Number(process.env.JANELA_LEAD_REPETIDO_DIAS || 90);
const MAX_TEXTO = 1500;   // mensagem longa não pode inchar o histórico do lead

// Dois telefones são a mesma pessoa se os últimos 8 dígitos batem — é o que
// sobrevive a +55, DDD, 9 extra e máscara de formulário.
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
export const fimDoTelefone = (s) => { const d = soDigitos(s); return d.length >= 8 ? d.slice(-8) : ''; };

export function acharRepetido(lista, telefone, email) {
  const tel = fimDoTelefone(telefone);
  const mail = String(email || '').toLowerCase().trim();
  if (!tel && !mail) return null;
  const limite = Date.now() - JANELA_DIAS * 864e5;
  return lista.find(l => {
    if (!l) return false;
    // Lead antigo demais é oportunidade nova, não repetição.
    const quando = new Date(l.entrada || 0).getTime();
    if (quando && quando < limite) return false;
    if (tel && fimDoTelefone(l.telefone) === tel) return true;
    if (mail && String(l.email || '').toLowerCase().trim() === mail) {
      // E-mail de família. Pai, filho e irmão usam o mesmo endereço — o caso
      // Abreu: dois irmãos em familia.abreu@exemplo.com. Se os DOIS têm
      // telefone e os telefones são diferentes, são pessoas diferentes, e
      // juntá-las é pior do que criar um lead a mais: some gente da fila.
      const outroTel = fimDoTelefone(l.telefone);
      if (tel && outroTel && tel !== outroTel) return false;
      return true;
    }
    return false;
  }) || null;
}

const corta = (s) => { const t = String(s || '').trim(); return t.length > MAX_TEXTO ? t.slice(0, MAX_TEXTO) + '…' : t; };

/**
 * Registra um toque de lead vindo de um canal automático.
 * Cria o lead se for gente nova; se já existir, acrescenta o canal e o histórico.
 *
 * @param {object} t
 * @param {string} t.canal      chave da origem ('facebook', 'whatsapp'…)
 * @param {string} t.rotulo     como aparece para a equipe ('Facebook', 'WhatsApp')
 * @param {string} t.chave      id externo, para não gravar o mesmo aviso duas vezes
 * @param {string} t.campoChave onde guardar esse id no lead
 * @param {string} t.texto      o que registrar no histórico
 * @param {object} [t.campos]   campos extras gravados no lead (ex.: janela do WhatsApp)
 * @returns {Promise<{lead:object, novo:boolean}|null>} null = já estava gravado
 */
export async function registrarToque(t) {
  // LIMPAR NA PORTA.
  //
  // O cabeçalho do sanitizar.js diz por quê: "as telas montam a interface com
  // innerHTML sem escapar; um '<script>' num nome de lead rodaria no navegador
  // de todo mundo". A limpeza existia só na ROTA de gravação — e o lead que
  // entra pelo webhook da Meta ou pelo WhatsApp não passa por rota nenhuma:
  // chega aqui e vai direto para o `gravar`.
  //
  // Qualquer pessoa na internet preenche um formulário do Facebook. O nome que
  // ela digita aparece em entrada-leads, no funil, na fila do SDR e na tela
  // inicial — sete telas, todas montadas com innerHTML.
  t = limparValor(t);
  const atual = await ler(CHAVE_LEADS);
  const lista = Array.isArray(atual?.valor) ? atual.valor
    : (atual?.valor ? JSON.parse(atual.valor) : []);
  const versao = atual ? atual.versao : null;
  const agora = new Date().toISOString();

  // O provedor reenvia o aviso quando não recebe 200. Sem esta checagem, uma
  // falha de rede vira lead duplicado.
  if (t.chave && t.campoChave && lista.some(l => l && l[t.campoChave] === String(t.chave))) {
    return null;
  }

  const achado = acharRepetido(lista, t.telefone, t.email);

  if (achado) {
    achado.origens = Array.from(new Set([...(achado.origens || []), t.canal]));
    if (!achado.nome || achado.nome.startsWith('(')) if (t.nome) achado.nome = t.nome;
    if (!achado.telefone && t.telefone) achado.telefone = t.telefone;
    if (!achado.email && t.email) achado.email = t.email;
    if (!achado.servico && t.servico) achado.servico = t.servico;
    if (t.chave && t.campoChave) achado[t.campoChave] = String(t.chave);
    Object.assign(achado, t.campos || {});
    achado.historico = achado.historico || [];
    achado.historico.push({ tipo: 'Sistema', quando: agora, texto: corta(t.texto) });
    await gravar(CHAVE_LEADS, lista, versao, t.rotulo);
    return { lead: achado, novo: false };
  }

  const lead = {
    id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    nome: t.nome || '(sem nome)',
    telefone: t.telefone || '',
    email: t.email || '',
    servico: t.servico || '',
    campanha: t.campanha || '',
    origens: [t.canal],
    entrada: t.quando || agora,
    responsavel: null,
    historico: [{ tipo: 'Sistema', quando: agora, texto: corta(t.texto) }],
  };
  if (t.chave && t.campoChave) lead[t.campoChave] = String(t.chave);
  Object.assign(lead, t.campos || {});

  lista.unshift(lead);
  await gravar(CHAVE_LEADS, lista, versao, t.rotulo);
  return { lead, novo: true };
}

export function avisarVendas(r, rotulo) {
  if (!r) return;
  const { lead, novo } = r;
  const txt = novo
    ? `🆕 Lead do ${rotulo}: ${lead.nome}${lead.servico ? ' — ' + lead.servico : ''}${lead.telefone ? ' · ' + lead.telefone : ''}`
    : `💬 ${lead.nome} voltou pelo ${rotulo}. Juntei no lead que já existia (${(lead.origens || []).join(', ')}).`;
  // A etiqueta leva o id do lead porque o MESMO lead é anunciado por dois
  // caminhos: aqui, quando ele chega, e depois pela automação de primeiro
  // contato. No chat são duas linhas; no celular tem de ser UMA buzina.
  avisarCanal('vendas', txt, { grupo: 'lead-' + lead.id, url: '/entrada-leads.html' }).catch(() => {});
}

/**
 * Grava campos num lead que já existe. Usado quando algo acontece DEPOIS do
 * registro — por exemplo, a resposta automática que só sai após o lead existir.
 * Sem isso a marca se perderia: `registrarToque` já salvou, e mexer no objeto
 * em memória depois não grava nada.
 */
export async function atualizarLead(id, campos, textoHistorico) {
  const atual = await ler(CHAVE_LEADS);
  const lista = Array.isArray(atual?.valor) ? atual.valor
    : (atual?.valor ? JSON.parse(atual.valor) : []);
  const lead = lista.find(l => l && l.id === id);
  if (!lead) return false;
  Object.assign(lead, campos || {});
  if (textoHistorico) {
    lead.historico = lead.historico || [];
    lead.historico.push({ tipo: 'Sistema', quando: new Date().toISOString(), texto: corta(textoHistorico) });
  }
  await gravar(CHAVE_LEADS, lista, atual ? atual.versao : null, 'Sistema');
  return true;
}
