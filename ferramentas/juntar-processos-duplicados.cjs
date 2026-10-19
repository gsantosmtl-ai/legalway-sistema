#!/usr/bin/env node
// JUNTA O PROCESSO DO TRELLO COM O QUE A AUTOMAÇÃO CRIOU.
//
//   node ferramentas/juntar-processos-duplicados.cjs --sistema ~/Downloads/backup.json
//   node ferramentas/juntar-processos-duplicados.cjs --sistema ~/Downloads/backup.json --gravar
//
// O QUE ACONTECEU, para não repetir: os cartões do Trello subiram antes dos
// pedidos do Bling. Como o cliente ainda não tinha contrato, o processo nasceu
// solto. Horas depois os contratos entraram, a automação viu "contrato
// assinado sem processo" e criou outro. Mesma pessoa, dois processos.
//
// Na ordem inversa — Bling primeiro — nada disso teria acontecido: o cartão
// teria encontrado o contrato e se ligado sozinho.
//
// A JUNÇÃO: fica o processo do Trello, porque ele tem os anexos e o checklist
// de verdade. Ele recebe o `contratoId` do contrato novo (mais vendedor,
// telefone e e-mail, se estiverem vazios). O processo da automação sai.
//
// SÓ SAI O QUE ESTÁ VAZIO. Se o da automação tiver anexo, documento aprovado,
// protocolo ou qualquer histórico além da linha de criação, ele FICA e o par
// entra no relatório para alguém olhar. Apagar trabalho de gente é pior do que
// conviver com duplicata.

const fs = require('fs');
const path = require('path');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const GRAVAR = process.argv.includes('--gravar');
const K = 'legalway-processos-documentacao-v1';
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const caminho = arg('--sistema', '');
if (!caminho || !fs.existsSync(caminho)) { console.error('Passe o backup com --sistema.'); process.exit(1); }
const S = JSON.parse(fs.readFileSync(caminho, 'utf8'));
const b = (S.armazenamento || []).find(x => x.chave === K);
if (!b) { console.error('Backup sem o bloco ' + K); process.exit(1); }
let orig = b.valor; if (typeof orig === 'string') orig = JSON.parse(orig);
const proc = JSON.parse(JSON.stringify(orig));

// "vazio" = nada que alguém tenha feito depois que nasceu
const temTrabalho = p =>
  (p.anexos || []).length > 0
  || (p.checklist || []).some(d => d.arquivo || (d.status && d.status !== 'Não solicitado'))
  || !!p.protocolo
  || (p.acompanhamentos || []).length > 0
  || !!p.boasVindasEnviada || !!p.autorizacaoSolicitada || !!p.autorizacaoConcedida
  || (p.historico || []).length > 1
  || !!p.responsavel;

// os da automação: nasceram do contrato, sem origemTrello
const doContrato = proc.filter(p => !p.origemTrello && p.contratoId);
const doTrello = proc.filter(p => p.origemTrello && p.origemTrello.cartaoId);

const juntados = [], mantidos = [], semPar = [];
const remover = new Set();

for (const novo of doContrato) {
  const par = doTrello.filter(t => norm(t.clienteNome) === norm(novo.clienteNome) && !t.contratoId);
  if (!par.length) continue;

  // SÓ JUNTA COM SERVIÇO IGUAL. Uma pessoa pode ter dois processos de verdade
  // — a Elisangela tem um FOIA no Trello e um contrato de Visto T. Juntar pelo
  // nome colapsaria dois processos reais num só e apagaria um deles. Quando o
  // serviço difere, ficam os dois e alguém decide.
  const t = par.find(x => norm(x.servico) === norm(novo.servico));
  if (!t) {
    mantidos.push({ cliente: novo.clienteNome,
      motivo: 'serviço diferente — Trello diz "' + (par[0].servico || '?') + '", contrato diz "' + (novo.servico || '?') + '"' });
    continue;
  }

  if (temTrabalho(novo)) {
    mantidos.push({ cliente: novo.clienteNome, motivo: 'o da automação já tem trabalho feito' });
    continue;
  }

  t.contratoId = novo.contratoId;
  if (!t.vendedor && novo.vendedor) t.vendedor = novo.vendedor;
  if (!t.telefone && novo.telefone) t.telefone = novo.telefone;
  if (!t.email && novo.email) t.email = novo.email;
  t.historico = t.historico || [];
  t.historico.push({ quando: new Date().toISOString(),
    texto: 'Ligado ao contrato do Bling. O processo que a automação havia criado para o mesmo cliente foi removido — estava vazio, e este tem o checklist e os anexos.' });
  remover.add(novo.id);
  juntados.push({ cliente: t.clienteNome, servicoTrello: t.servico, servicoContrato: novo.servico,
    anexos: (t.anexos || []).length, checklist: (t.checklist || []).length });
}

for (const t of doTrello) if (!t.contratoId) semPar.push(t.clienteNome);

const resultado = proc.filter(p => !remover.has(p.id));

// ---- relatório ----
const pad = n => String(n).padStart(4);
console.log('');
console.log('JUNTAR PROCESSOS DUPLICADOS' + (GRAVAR ? '' : '   (simulação)'));
console.log('');
console.log('  ' + pad(orig.length) + '  processos antes');
console.log('  ' + pad(juntados.length) + '  pares juntados   ←');
console.log('  ' + pad(remover.size) + '  processos removidos (vazios, da automação)');
console.log('  ' + pad(resultado.length) + '  processos depois');
console.log('');
if (juntados.length) {
  console.log('  O QUE FICA (o do Trello, agora ligado ao contrato)');
  console.log('    ' + 'CLIENTE'.padEnd(30) + 'SERVIÇO'.padEnd(20) + 'ANEXOS  CHECKLIST');
  for (const j of juntados) {
    const aviso = norm(j.servicoTrello) !== norm(j.servicoContrato) ? '  ⚠ serviço difere: contrato diz "' + j.servicoContrato + '"' : '';
    console.log('    ' + j.cliente.slice(0, 28).padEnd(30) + (j.servicoTrello || '?').slice(0, 18).padEnd(20)
      + String(j.anexos).padStart(5) + String(j.checklist).padStart(10) + aviso);
  }
  console.log('');
}
if (mantidos.length) {
  console.log('  NÃO MEXI (ficam os dois, para alguém olhar)');
  for (const m of mantidos) console.log('    · ' + m.cliente + ' — ' + m.motivo);
  console.log('');
}
if (semPar.length) {
  console.log('  ' + pad(semPar.length) + '  processos do Trello que seguem sem contrato (não têm par; nada a fazer aqui)');
  console.log('');
}

// ---- conferência ----
let quebrados = 0, tocados = 0;
const porId = new Map(orig.map(p => [p.id, p]));
for (const p of resultado) {
  const a = porId.get(p.id); if (!a) { quebrados++; continue; }
  const limpa = o => { const c = { ...o }; delete c.contratoId; delete c.vendedor; delete c.telefone; delete c.email; delete c.historico; return c; };
  if (JSON.stringify(limpa(a)) !== JSON.stringify(limpa(p))) quebrados++;
  else if (JSON.stringify(a) !== JSON.stringify(p)) tocados++;
}
console.log('  CONFERÊNCIA');
console.log('    ' + pad(tocados) + '  processos que só ganharam contratoId / contato / histórico');
console.log('    ' + pad(quebrados) + '  com outro campo alterado' + (quebrados ? '   ✗ ERRO' : '   ✓'));
console.log('    ' + pad(resultado.filter(p => (p.anexos || []).length).length) + '  processos com anexo depois (antes: '
  + orig.filter(p => (p.anexos || []).length).length + ')');
console.log('');
if (quebrados) { console.error('  Abortado.'); process.exit(1); }

if (!GRAVAR) { console.log('  Para aplicar:  ... --gravar'); console.log(''); process.exit(0); }

const saida = { formato: 'legalway-backup-v1', geradoEm: new Date().toISOString(),
  geradoPor: 'juntar-processos-duplicados.cjs', armazenamento: [{ chave: K, valor: resultado }] };
const arq = path.join(__dirname, 'planilhas', 'trello-delta', 'juntar-processos.json');
fs.writeFileSync(arq, JSON.stringify(saida));
console.log('  Arquivo: ferramentas/planilhas/trello-delta/juntar-processos.json ('
  + (fs.statSync(arq).size / 1048576).toFixed(1) + ' MB)');
console.log('');
