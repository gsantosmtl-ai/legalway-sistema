// A atualização do Bling, rodada fora da tela.
//
// Faz o mesmo que a tela "Bling": lê o Bling, compara com o sistema, e traz
// para cá o que o Bling sabe e o sistema não sabe nada em contrário.
//
// O QUE ELE APLICA
//   · parcela paga no Bling e em aberto aqui  → marca como paga
//   · vencimento remarcado no Bling, parcela AINDA EM ABERTO → remarca
//
// O QUE ELE NUNCA APLICA
//   · nada do balde "revisar": são os casos em que os dois lados afirmam
//     coisas diferentes (pago aqui e aberto lá, valores que não batem).
//     Escolher sozinho seria apagar o trabalho de alguém.
//   · CANCELAMENTO DE CONTRATO. O Bling pode dizer que um contrato foi
//     cancelado, e isso é informação verdadeira — mas cancelar contrato real
//     em lote, sem ninguém olhar, é o tipo de coisa que não se desfaz com um
//     clique. Ele LISTA e para aí.
//
// Imprime tudo o que viu ANTES de gravar, para a lista ficar no terminal
// mesmo que alguém feche a tela depois.

const { buscarBling } = await import('file:///app/server/src/sinc-rotas.js');
const { divergenciasDoBling } = await import('file:///app/server/src/sincronizacao.js');
const { ler, gravar } = await import('file:///app/server/src/armazenamento.js');

const K_FIN = 'legalway-financeiro-v1';
const K_CONT = 'legalway-contratos-v1';
const QUEM = 'atualização do Bling';
const agora = () => new Date().toISOString();
const usd = (v) => 'US$ ' + Number(v || 0).toFixed(2);

const oauth = await ler('legalway-bling-oauth-v1');
if (!oauth || !oauth.valor || !oauth.valor.refreshToken) {
  console.log('\nA ligação com o Bling AINDA NÃO FOI AUTORIZADA — não há o que atualizar.');
  console.log('Abra o sistema, vá no menu em "Bling" e clique em "Autorizar o Bling agora".');
  console.log('É uma vez só. Depois disso, rode este comando de novo.\n');
  process.exit(0);
}
console.log(`Ligação com o Bling autorizada em ${String(oauth.valor.autorizadoEm || '').slice(0, 10)}`
  + `${oauth.valor.por ? ' por ' + oauth.valor.por : ''}.`);

// Seis meses: cobre outubro inteiro e o que veio antes dele.
const desde = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
console.log(`Lendo o Bling desde ${desde.split('-').reverse().join('/')}…`);
const bruto = await buscarBling(desde);
const porPedido = new Map(bruto.pedidos.map((p) => [p.idPedido, p.numero]));
const contas = bruto.contas.map((c) => ({ ...c, pedido: porPedido.get(c.idOrigem) || '' })).filter((c) => c.pedido);
console.log(`Bling: ${bruto.pedidos.length} pedido(s), ${contas.length} conta(s) a receber.`);

const fin = await ler(K_FIN);
const cont = await ler(K_CONT);
const financeiro = fin ? fin.valor : [];
const contratos = cont ? cont.valor : [];

const d = divergenciasDoBling({ pedidos: bruto.pedidos, contas, contratos, financeiro });

const pagas = d.aplicavel.filter((x) => x.tipo === 'parcela.paga');
const vencs = d.aplicavel.filter((x) => x.tipo === 'parcela.vencimento');
const cancel = d.aplicavel.filter((x) => x.tipo === 'contrato.cancelado');

console.log(`\n===== PAGAMENTOS QUE FALTAM AQUI (${pagas.length}) =====`);
for (const x of pagas) console.log(`  ${x.cliente} · ${x.descricao} · ${usd(x.pagoNoBling)} · aqui está "${x.aqui}"`);
console.log(`  TOTAL: ${usd(pagas.reduce((s, x) => s + (Number(x.pagoNoBling) || 0), 0))}`);

console.log(`\n===== VENCIMENTOS REMARCADOS (${vencs.length}) =====`);
for (const x of vencs) console.log(`  ${x.cliente} · ${x.descricao} · ${x.aqui} → ${x.noBling}`);

console.log(`\n===== CONTRATOS CANCELADOS NO BLING (${cancel.length}) — NÃO VOU MEXER =====`);
for (const x of cancel) console.log(`  ${x.cliente} · pedido ${x.pedido} · aqui está "${x.aqui}"`);
if (cancel.length) console.log('  (cancelar contrato real em lote precisa de gente olhando; me diga e eu faço)');

console.log(`\n===== PRECISAM DE VOCÊ (${d.revisar.length}) — NÃO VOU MEXER =====`);
for (const x of d.revisar) console.log(`  ${x.cliente} · ${x.descricao} · aqui "${x.aqui}" / no Bling "${x.noBling}" — ${x.porque}`);

// ---------------------------------------------------------------- gravar
const porId = new Map(financeiro.map((x) => [x && x.id, x]));
let baixas = 0, dinheiro = 0, remarcadas = 0;

for (const x of pagas) {
  const f = porId.get(x.parcelaId);
  if (!f || f.status === 'Pago') continue;
  f.status = 'Pago';
  f.valorRecebido = x.pagoNoBling;
  f.dataRecebimento = f.dataRecebimento || new Date().toISOString().slice(0, 10);
  f.observacao = [f.observacao, `Baixa trazida do Bling em ${new Date().toISOString().slice(0, 10)}`]
    .filter(Boolean).join(' · ');
  baixas++; dinheiro += Number(x.pagoNoBling) || 0;
}
for (const x of vencs) {
  const f = porId.get(x.parcelaId);
  // Parcela já paga não tem vencimento remarcado: seria reescrever história.
  if (!f || f.status === 'Pago' || Number(f.valorRecebido || 0) > 0) continue;
  f.vencimentoAntigo = f.vencimentoAntigo || f.vencimento;
  f.vencimento = x.noBling;
  remarcadas++;
}

if (baixas || remarcadas) {
  await gravar(K_FIN, financeiro, fin ? fin.versao : null, QUEM, undefined, 'sincronização');
  console.log(`\n✓ GRAVADO: ${baixas} baixa(s) somando ${usd(dinheiro)}, ${remarcadas} vencimento(s) remarcado(s).`);
} else {
  console.log('\nNada a gravar — o financeiro já estava igual ao Bling.');
}
console.log(`Ficaram ${d.revisar.length} caso(s) para revisão e ${cancel.length} cancelamento(s) para decidir.\n`);
process.exit(0);
