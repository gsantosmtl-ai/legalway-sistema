// Correções pedidas por ela em 29/10/2026, uma a uma, com rastro.
//
// Roda DENTRO do contêiner e usa o `gravar` do próprio sistema — não escreve
// no banco por fora. Assim mantém o controle de versão, a auditoria e o aviso
// de tempo real que as telas abertas escutam.
//
// Nada é apagado. Toda mudança escreve no histórico do registro dizendo o que
// mudou, de onde para onde, e que foi esta correção.
//
// Rodar duas vezes dá o mesmo resultado que rodar uma: cada passo confere o
// estado antes de mexer e avisa quando já estava feito.

const { ler, gravar } = await import('file:///app/server/src/armazenamento.js');

const QUEM = 'correções de 29/10';
const agora = () => new Date().toISOString();
const K_PROC = 'legalway-processos-documentacao-v1';
const K_CONT = 'legalway-contratos-v1';

const log = [];
const diz = (t) => { log.push(t); console.log(t); };

const bloco = async (chave) => {
  const r = await ler(chave);
  return { valor: r ? r.valor : [], versao: r ? r.versao : null };
};
const hist = (reg, texto) => {
  reg.historico = Array.isArray(reg.historico) ? reg.historico : [];
  reg.historico.push({ quando: agora(), texto });
};

const proc = await bloco(K_PROC);
const cont = await bloco(K_CONT);
const fichas = proc.valor;
const contratos = cont.valor;
let mexeuProc = false, mexeuCont = false;

const porCodigo = (cod) => fichas.find((f) => f && f.codigo === cod);
const porIdContrato = (id) => contratos.find((c) => c && c.id === id);

// ---------------------------------------------------------------- 1
// Claudiano e Wandersom: o contrato foi CANCELADO, mas o card veio do Trello e
// nunca foi ligado a ele. Sem a ligação o card não tem como saber, e continua
// no quadro como se o caso estivesse vivo.
//
// Ligar NÃO cancela o card: ele passa a refletir o contrato, e é a tela que
// decide tirá-lo do quadro. Se o cancelamento tiver sido engano, desfazer é
// mexer no contrato, não aqui.
for (const [cod, idContrato, nome] of [
  ['PC-0197', 'cblmv42mzsva8', 'Claudiano Brustolon Lopes'],
  ['PC-0196', 'cblmv42mzsvap', 'Wandersom Orlando da Costa'],
]) {
  const f = porCodigo(cod);
  const c = porIdContrato(idContrato);
  if (!f) { diz(`· ${cod} (${nome}): ficha não encontrada — nada feito`); continue; }
  if (!c) { diz(`· ${cod}: contrato ${idContrato} não encontrado — nada feito`); continue; }
  if (f.contratoId === idContrato) { diz(`· ${cod}: já estava ligado — nada feito`); continue; }
  if (f.contratoId) { diz(`· ${cod}: JÁ TEM outro contrato (${f.contratoId}) — não mexi, confira à mão`); continue; }
  f.contratoId = idContrato;
  hist(f, `Ficha ligada ao contrato ${c.servico} (${c.etapa}) — estava sem contrato, e por isso o quadro não sabia que o contrato estava ${String(c.etapa).toLowerCase()}.`);
  mexeuProc = true;
  diz(`✓ ${cod} ${nome}: ligada ao contrato ${idContrato} (${c.etapa})`);
}

// ---------------------------------------------------------------- 2
// Celso: o card "Reagendamento de Finger ONLINE" está com o nome do Celso
// AUGUSTO e ligado ao contrato do Celso VIEIRA. Ela disse: o reagendamento é
// do Celso Vieira. Então o que está errado é o NOME — o vínculo já aponta para
// o dono certo.
//
// O nome antigo fica guardado em `nomeAntes`, e o motivo no histórico: se a
// leitura estiver invertida, dá para voltar sem perder nada.
{
  const f = porCodigo('PC-0176');
  const certo = 'Celso Vieira De Andrade';
  if (!f) diz('· PC-0176: ficha não encontrada — nada feito');
  else if (f.clienteNome === certo) diz('· PC-0176: já estava com o nome certo — nada feito');
  else {
    const c = porIdContrato(f.contratoId);
    if (!c) diz(`· PC-0176: não achei o contrato ${f.contratoId} — não mexi`);
    else {
      f.nomeAntes = f.nomeAntes || f.clienteNome;
      hist(f, `Nome corrigido de "${f.clienteNome}" para "${certo}": este reagendamento de biometria é do Celso Vieira, e a ficha já estava ligada ao contrato dele (${c.servico}, pedido ${c.pedidoBling || '—'}). O nome veio do cartão do Trello e era do outro Celso.`);
      f.clienteNome = certo;
      mexeuProc = true;
      diz(`✓ PC-0176: nome corrigido para ${certo}`);
    }
  }
}

// ---------------------------------------------------------------- 4
// Cristina: ela confirmou que só tem F1. O serviço "Extensão de Turista" veio
// escrito assim no pedido 74 do Bling, de abril, e o sistema copiou. O card
// vazio nasceu desse rótulo errado; o card com o trabalho veio do Trello.
{
  const c = contratos.find((x) => x && x.id === 'cblmv42mzsvaa');
  if (!c) diz('· Cristina: contrato não encontrado — nada feito');
  else if (c.servico === 'F1 - Estudante') diz('· Cristina: o contrato já está como F1 — nada feito');
  else {
    hist(c, `Serviço corrigido de "${c.servico}" para "F1 - Estudante". O rótulo errado veio do pedido de venda nº ${c.pedidoBling || '74'} do Bling; a cliente só tem o F1 — confirmado por ela em 29/10/2026. O valor e as parcelas não mudam.`);
    c.servicoAntes = c.servicoAntes || c.servico;
    c.servico = 'F1 - Estudante';
    mexeuCont = true;
    diz(`✓ Cristina: contrato agora é "F1 - Estudante" (US$ ${c.valor} — valor intacto)`);
  }

  // O card de verdade (39 anexos, protocolado, I-539) passa a responder pelo
  // contrato; o card vazio sai do quadro sem ser apagado.
  const real = porCodigo('PC-0186');
  const vazio = porCodigo('PC-0050');
  if (real && !real.contratoId) {
    real.contratoId = 'cblmv42mzsvaa';
    hist(real, 'Ficha ligada ao contrato de Cristina Cotrim Ferraz Zago. É esta que tem o protocolo (I-539, SRC2633550591) e os anexos.');
    mexeuProc = true;
    diz('✓ Cristina PC-0186: ligada ao contrato');
  } else if (real) diz('· Cristina PC-0186: já tinha contrato — nada feito');

  if (vazio && !vazio.situacao) {
    const temArquivo = (vazio.anexos || []).length
      || (vazio.checklist || []).some((d) => d && d.arquivo);
    if (temArquivo) diz('· Cristina PC-0050: tem arquivo — NÃO tirei do quadro, confira à mão');
    else {
      vazio.situacao = 'cancelado';
      vazio.situacaoEm = agora();
      hist(vazio, 'Ficha retirada do quadro: nasceu do rótulo errado do Bling ("Extensão de Turista") e está vazia. O caso de Cristina é o F1, na ficha PC-0186. Nada foi apagado.');
      mexeuProc = true;
      diz('✓ Cristina PC-0050: ficha vazia saiu do quadro (não foi apagada)');
    }
  } else if (vazio) diz('· Cristina PC-0050: já estava fora do quadro — nada feito');
}

// ---------------------------------------------------------------- 5
// Paulo Fernando: o contrato é de DOIS serviços escritos num campo só
// ("WORK PERMIT E SOCIAL + Mudança de Endereço"), e por isso a mudança de
// endereço ficou com uma ficha órfã, vinda do Trello, com os 8 anexos.
//
// Ligar a ficha ao contrato é o passo seguro: um contrato de dois serviços tem
// duas fichas de propósito. Separar o contrato em dois é outra coisa, tem
// ferramenta própria na tela ("Contratos com serviços juntos") e quem aplica é
// gente — não entra aqui.
{
  const f = porCodigo('PC-0172');
  const c = porIdContrato('cblmv42mzswdr');
  if (!f || !c) diz('· Paulo PC-0172: ficha ou contrato não encontrado — nada feito');
  else if (f.contratoId) diz('· Paulo PC-0172: já tinha contrato — nada feito');
  else {
    f.contratoId = c.id;
    hist(f, `Ficha ligada ao contrato "${c.servico}". O contrato tem dois serviços escritos juntos; esta ficha é a da mudança de endereço. A separação do contrato em dois continua pendente, na ferramenta "Contratos com serviços juntos".`);
    mexeuProc = true;
    diz('✓ Paulo PC-0172: ligada ao contrato (a separação dos dois serviços continua pendente)');
  }
}

// ---------------------------------------------------------------- gravar
if (mexeuProc) await gravar(K_PROC, fichas, proc.versao, QUEM, undefined, 'correção');
if (mexeuCont) await gravar(K_CONT, contratos, cont.versao, QUEM, undefined, 'correção');
diz(`\n${mexeuProc || mexeuCont ? 'Gravado.' : 'Nada a gravar.'} ${log.filter((l) => l.startsWith('✓')).length} correção(ões) aplicada(s).`);
process.exit(0);
