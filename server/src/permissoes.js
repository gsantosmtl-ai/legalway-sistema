// Permissão por módulo, checada no SERVIDOR (antes só a tela escondia).
// Cada chave de dados pertence a um ou mais módulos. Ler exige 'visualizar' (ou mais) em algum deles;
// gravar exige 'editar' em algum deles. Acesso total passa tudo. Chaves "comuns" qualquer pessoa logada lê.
// Onde um módulo grava dados de outro é por causa das automações que ainda rodam na tela (ex.: Contratos
// gera as parcelas no Financeiro); quando as automações forem pro servidor, isso fecha mais.
const MAPA = {
  'legalway-leads-v1':                  { modulos: ['leads', 'funil', 'sdr'] },
  'legalway-funil-v1':                  { modulos: ['funil', 'leads', 'sdr'] },
  'legalway-sdr-v1':                    { modulos: ['sdr', 'funil'] },
  'legalway-meta-sdr-v1':               { modulos: ['sdr'] },
  'legalway-agenda-v1':                 { modulos: ['agenda', 'sdr', 'funil'] },
  'legalway-contratos-v1':              { modulos: ['contratos', 'funil', 'documentos', 'financeiro'] },
  'legalway-clientes-v1':               { modulos: ['clientes', 'contratos', 'documentos'], leitura: ['tarefas', 'agenda', 'financeiro', 'funil', 'sdr', 'processos'] },
  'legalway-financeiro-v1':             { modulos: ['financeiro', 'contratos', 'documentos'] },
  'legalway-contas-pagar-v1':           { modulos: ['financeiro', 'documentos'] },
  'legalway-orcamento-v1':              { modulos: ['financeiro'] },
  'legalway-contas-bancarias-v1':       { modulos: ['financeiro'] },
  'legalway-categorias-financeiro-v1':  { modulos: ['financeiro'] },
  'legalway-processos-documentacao-v1': { modulos: ['documentos', 'processos', 'clientes', 'financeiro'] },
  'legalway-prestadores-externos-v1':   { modulos: ['documentos', 'financeiro'] },
  'legalway-doc-marcos-v1':             { modulos: ['documentos', 'processos'] },
  'legalway-doc-responsaveis-v1':       { modulos: ['documentos', 'processos'] },
  'legalway-marketing-ads-v2':          { modulos: ['marketing'] },
  'legalway-marketing-anuncios-v1':     { modulos: ['marketing'] },
  'legalway-marketing-campmeta-v1':     { modulos: ['marketing'] },
  'legalway-marketing-canais-v1':       { modulos: ['marketing', 'leads'] },
  'legalway-relatorios-gerados-v1':     { modulos: ['relatorios'] },
  'legalway-tarefas-v1':                { modulos: ['tarefas', 'agenda', 'clientes', 'documentos'] },
  'legalway-notificacoes-vendedor-v1':  { modulos: ['funil', 'documentos', 'sdr'] },
  // configurações e cadastros: todo mundo lê; só quem edita Usuários/Contratos muda
  'legalway-servicos-v1':               { modulos: ['contratos', 'usuarios'], leituraLivre: true },
  'legalway-checklists-v1':             { modulos: ['documentos', 'usuarios'], leituraLivre: true },
  'legalway-templates-mensagem-v1':     { modulos: ['documentos', 'funil', 'usuarios'], leituraLivre: true },
  'legalway-config-empresa-v1':         { modulos: ['usuarios'], leituraLivre: true },
  'legalway-meta-mensal-v1':            { modulos: ['usuarios', 'financeiro'], leituraLivre: true },
  'legalway-automacoes-config-v1':      { modulos: ['usuarios'], leituraLivre: true },
  'legalway-notif-autorizacoes-vistas-v1': { modulos: ['financeiro', 'documentos'], leituraLivre: true },
  'legalway-avisos-enviados-v1':        { modulos: ['usuarios'] },
  'legalway-regras-v1':                 { modulos: ['usuarios'], leituraLivre: true },
};
const PREFIXOS = [
  { prefixo: 'confirmacao', modulos: ['usuarios'] },
  { prefixo: 'legalway-contrato-assinado-', modulos: ['contratos'] },
];

function regra(chave) {
  if (MAPA[chave]) return MAPA[chave];
  const p = PREFIXOS.find(x => chave.startsWith(x.prefixo));
  if (p) return p;
  return null; // chave desconhecida: só acesso total (evita "módulo novo" abrir buraco sem querer)
}
const nivel = { nenhum: 0, visualizar: 1, editar: 2 };

// Preferências pessoais (blocos visíveis etc.): só a própria pessoa lê e grava
const RE_PREF = /^legalway-pref-([A-Za-z0-9]+)-v\d+$/;
function ehPrefPropria(usuario, chave) { const m = RE_PREF.exec(chave); return !!m && m[1] === String(usuario.id); }

export function podeLer(usuario, chave) {
  if (ehPrefPropria(usuario, chave)) return true;
  if (RE_PREF.test(chave)) return false;
  if (usuario.acesso_total) return true;
  const r = regra(chave);
  if (!r) return false;
  if (r.leituraLivre) return true;
  return [...r.modulos, ...(r.leitura || [])].some(m => (nivel[usuario.permissoes?.[m]] || 0) >= 1);
}
export function podeGravar(usuario, chave) {
  if (ehPrefPropria(usuario, chave)) return true;
  if (RE_PREF.test(chave)) return false;
  if (usuario.acesso_total) return true;
  const r = regra(chave);
  if (!r) return false;
  return r.modulos.some(m => (nivel[usuario.permissoes?.[m]] || 0) >= 2);
}
export function chavesVisiveis(usuario, chaves) { return chaves.filter(c => podeLer(usuario, c)); }
