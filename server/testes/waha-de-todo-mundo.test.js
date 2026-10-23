// "Importante dentro do sistema ter o WAHA de todo mundo: Documentos,
// Financeiro, Comercial (primeira mensagem lead), Renato (follow up),
// Adriano (follow up)."
//
// Cinco números, não três. E os dois últimos não são setores: são pessoas. O
// follow-up de um lead tem que sair do número do vendedor que está na conversa
// — o cliente respondeu ao Renato; se a cobrança chega por um número do
// escritório, o fio se quebra e a resposta vira "quem é você?".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { sessaoDoSetor, sessaoDoVendedor, remetentes } = await import('../src/waha.js');

const avisos = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

const REGRAS = {
  setores: { lista: [
    { key: 'documentos', nome: 'Documentação', sessao: 'documentos', numero: '+14071110001' },
    { key: 'financeiro', nome: 'Financeiro', sessao: 'financeiro', numero: '+14071110002' },
    { key: 'comercial', nome: 'Comercial', sessao: 'comercial', numero: '+14071110003' },
  ]},
  agenda: { disponibilidade: [
    { vendedor: 'Renato', numero: '+14072220001', sessao: 'renato' },
    { vendedor: 'Renato', numero: '+14072220001', sessao: 'renato' },   // segunda faixa do mesmo
    { vendedor: 'Adriano', numero: '+14072220002', sessao: 'adriano' },
    { vendedor: 'Bruno', numero: '+14072220003', sessao: '' },          // sem número próprio
  ]},
};

test('os cinco remetentes aparecem, sem repetir', () => {
  const r = remetentes(REGRAS);
  assert.equal(JSON.stringify(r.map(x => x.sessao)),
    '["documentos","financeiro","comercial","renato","adriano"]');
  assert.equal(r.filter(x => x.tipo === 'setor').length, 3);
  assert.equal(r.filter(x => x.tipo === 'vendedor').length, 2);
  assert.equal(r.find(x => x.sessao === 'renato').nome, 'Renato');
  assert.ok(!r.some(x => x.nome === 'Bruno'), 'quem não tem sessão não é remetente');
});

test('acha a sessão do vendedor pelo nome, sem tropeçar em acento ou caixa', () => {
  assert.equal(sessaoDoVendedor(REGRAS, 'Renato'), 'renato');
  assert.equal(sessaoDoVendedor(REGRAS, 'renato'), 'renato');
  assert.equal(sessaoDoVendedor(REGRAS, '  ADRIANO '), 'adriano');
  assert.equal(sessaoDoVendedor(REGRAS, 'Bruno'), '', 'sem sessão própria devolve vazio, para cair no setor');
  assert.equal(sessaoDoVendedor(REGRAS, ''), '');
  assert.equal(sessaoDoVendedor(REGRAS, 'Ninguém'), '');
  assert.equal(sessaoDoVendedor({}, 'Renato'), '', 'sem regras não explode');
});

test('os setores continuam funcionando como antes', () => {
  assert.equal(sessaoDoSetor(REGRAS, 'documentos'), 'documentos');
  assert.equal(sessaoDoSetor(REGRAS, 'financeiro'), 'financeiro');
  assert.equal(sessaoDoSetor(REGRAS, 'inexistente'), '');
});

test('lead E reunião saem pelo número do vendedor; o resto, pelo setor', () => {
  // "Reunião chegando também pelo número pessoal dos vendedores, se foi eles
  // mesmo que cadastraram a reunião. Comercial será usado para o primeiro
  // contato apresentando o escritório, e para o SDR."
  assert.match(avisos, /const DO_VENDEDOR = new Set\(\['lead', 'agenda'\]\);/,
    'a agenda entra junto: "{vendedor} vai te ligar" saindo de outro número é a mesma quebra');
  assert.match(avisos, /const sessaoPara = \(c\) => \(DO_VENDEDOR\.has\(gat\.sobre\)\s*\?\s*sessaoDoVendedor\(R, c && c\.alvo && c\.alvo\.vendedor\) : ''\) \|\| sessaoDoSetorDoAviso/,
    'a escolha é por candidato: cada lead e cada reunião têm o seu vendedor');
  assert.match(avisos, /const deQuem = sessaoPara\(c\);/);
  assert.match(avisos, /await enviarWaha\(deQuem, c\.telefone, texto\)/,
    'e é essa sessão que manda — não a do aviso');
  assert.match(avisos, /envia = podeWaha && \(!!sessao \|\| DO_VENDEDOR\.has\(gat\.sobre\)\)/,
    'não pode ser barrado só porque o setor comercial não tem número');
  // O gatilho da agenda carrega o vendedor no próprio evento — é dele que a
  // sessão é resolvida.
  const i = avisos.indexOf('reuniaoChegando: {');
  assert.match(avisos.slice(i, i + 1600), /vendedor: ev\.vendedor \|\| ''/);
});

test('o primeiro contato e o SDR continuam saindo pelo Comercial', () => {
  // São os dois casos em que o lead ainda não tem dono: quem fala é o
  // escritório, não uma pessoa.
  const i = avisos.indexOf('const DO_VENDEDOR');
  assert.match(avisos.slice(i - 900, i + 200), /o Comercial é a voz do escritório no primeiro\s*\n\s*\/\/ contato e no SDR, onde ninguém ainda tem dono/,
    'o porquê tem que estar escrito: senão alguém "conserta" isso depois');
});

test('a tela pede a sessão de cada vendedor e mostra os dois tipos juntos', () => {
  assert.match(cfg, /\{k:'sessao', label:'Sessão no WhatsApp \(ex: renato\) — o follow-up de lead sai por este número'\}/);
  assert.match(cfg, /const equipe = \(\(regrasAtuais\.agenda \|\| \{\}\)\.disponibilidade\) \|\| \[\]/,
    'o painel de conectar precisa enxergar os vendedores');
  assert.match(cfg, /tipo: 'Vendedor'/);
  assert.match(cfg, /\$\{escR\(st\.tipo \|\| 'Setor'\)\}/, 'na tela dá para ver qual é setor e qual é pessoa');
  assert.match(cfg, /Agenda → Disponibilidade da equipe/,
    'quando não há nenhuma sessão, a tela diz onde preencher as duas coisas');
});

// --------------------------------------------------- a lista por departamento
// "Isso, essa parte é importante deixar separado dessa forma mesmo, aparecer
// por departamento." Uma lista corrida de 12 mensagens obriga a ler o rótulo
// "pelo Financeiro" de cada linha para saber de quem é o quê.
test('mensagem sem motivo não se perde dentro de departamento nenhum', () => {
  const c = corpoDaLista();
  assert.match(c, /const semMotivo = \[\.\.\.avisos\.entries\(\)\]\.filter\(\(\[,a\]\)=> !a\.gatilho\)/);
  assert.match(c, /Mensagens novas, sem motivo · \$\{semMotivo\.length\}/,
    'fica na lista de departamentos, esperando ela escolher o motivo');
});

test('o grupo segue o setor ESCOLHIDO na mensagem, não o sugerido', () => {
  const c = corpoDaLista();
  assert.match(c, /a\.setor \|\| \(g && g\.setorSugerido\)/,
    'quem mudou o setor de uma mensagem vê ela mudar de lugar');
});

test('cada departamento explica o que é dele', () => {
  const c = corpoDaLista();
  assert.match(c, /primeiro contato, apresentação e SDR — onde o lead ainda não tem dono/,
    'é a regra que ela definiu, e precisa estar escrita na tela');
  assert.match(c, /Follow-up e reunião dos leads do \$\{nome\} saem pelo número dele/);
  assert.match(c, /'Tudo que fala do processo do cliente\.'/);
  assert.match(c, /'Tudo que fala de dinheiro\.'/);
});


// --------------------------------------------- os botões de departamento
// "Quero aqui clicar cada departamento: Comercial geral, Comercial Adriano,
// Comercial Renato, Documentos, Financeiro."
//
// Departamento aqui não é só setor — é REMETENTE, o número por onde a mensagem
// sai. Por isso cada vendedor com número é um botão, e por isso a MESMA
// mensagem aparece em mais de um: o follow-up sai pelo número do vendedor dono
// do lead, e pelo Comercial quando ele não tem número.
function corpoDaLista() {
  const i = cfg.indexOf('function pintarListaAvisos(setores)');
  return cfg.slice(i, cfg.indexOf('function umAviso(a, i)', i));
}

test('a tela abre na LISTA de departamentos, para clicar', () => {
  // "Eu quero mensagens automáticas aparecer para clicar e abrir as mensagens
  // desse setor. Exemplo: documentos, clico e abre as mensagens que serão
  // enviadas e as regras."
  const c = corpoDaLista();
  assert.match(c, /if\(!escolhido\)\{/, 'sem departamento escolhido, mostra os departamentos');
  assert.match(c, /Clique num departamento para ver as mensagens que saem por ele e as regras que valem ali/);
  assert.match(c, /data-dept="\$\{escR\(d\.id\)\}"/, 'cada cartão é clicável');
  assert.match(c, /\$\{n\} mensagem\(ns\)/);
  assert.match(c, /on \? on \+ ' ligada\(s\)' : 'nenhuma ligada'/,
    'o cartão diz quantas estão realmente ligadas — não só quantas existem');
});

test('dentro do departamento vêm as REGRAS, não só as mensagens', () => {
  const c = corpoDaLista();
  assert.match(c, /Regras deste departamento/);
  assert.match(c, /regra\('Número do WhatsApp', numero, !numero\)/);
  assert.match(c, /regra\('Sessão no WAHA', sess, !sess\)/);
  assert.match(c, /regra\('Canal de envio'/);
  assert.match(c, /regra\('Envio automático', automatico \? 'Ligado' : 'Desligado — nada sai sozinho', !automatico\)/);
  assert.match(c, /escolhido\.key === 'financeiro' \? regra\('Avisar da cobrança com'/,
    'a antecedência da cobrança só faz sentido no Financeiro');
  assert.match(c, /— não preenchido/, 'regra em branco tem que aparecer como falta, não sumir');
  assert.match(c, /Mensagens que saem por aqui · \$\{itens\.length\}/);
});

test('dá para voltar, e o número do vendedor vem da equipe', () => {
  const c = corpoDaLista();
  assert.match(c, /id="dept-voltar"[^>]*>← Todos os departamentos/);
  assert.match(c, /DEPT_ATIVO = null;\s*\n\s*try\{ localStorage\.removeItem/);
  assert.match(c, /const linhaEquipe = \(\(\(regrasAtuais\|\|\{\}\)\.agenda\|\|\{\}\)\.disponibilidade \|\| \[\]\)/,
    'vendedor não está em setores: o número dele vem da disponibilidade da equipe');
  assert.match(c, /Número, sessão e responsável se mudam em/, 'a tela diz onde se muda a regra');
});

test('os vendedores viram departamento, um por pessoa', () => {
  const c = corpoDaLista();
  assert.match(c, /rotulo:'Comercial ' \+ nome/, '"Comercial Adriano", "Comercial Renato"');
  assert.match(c, /if\(!nome \|\| jaVi\.has\(nome\.toLowerCase\(\)\)\) continue;/,
    'vendedor com duas faixas de horário não pode virar dois cartões');
  assert.match(c, /sem: !String\(l\.sessao\|\|''\)\.trim\(\)/);
  assert.match(c, /estas mensagens saem pelo <b>Comercial geral<\/b>/,
    'sem número próprio, a tela diz por onde sai enquanto isso');
});

test('o setor é rotulado pelo setor, não por quem responde por ele', () => {
  // "Peterson não, Financeiro." Pessoa sai, entra outra, e o departamento
  // continua o mesmo.
  const c = corpoDaLista();
  assert.match(c, /const rotulo = st\.key === 'comercial' \? 'Comercial geral' : \(st\.nome \|\| st\.key\)/);
  assert.ok(!/rotulo.*st\.responsavel/.test(c), 'o nome do responsável não pode virar rótulo de departamento');
});

test('a mesma mensagem aparece em mais de um departamento, quando sai por mais de um número', () => {
  const c = corpoDaLista();
  assert.match(c, /const SOBRE_DO_VENDEDOR = new Set\(\['lead','agenda'\]\)/);
  assert.match(c, /d\.tipo === 'setor' \? setorDoAviso\(a\) === d\.key : vaiPeloVendedor\(a\)/,
    'follow-up e reunião entram em TODOS os vendedores, e também no setor');
  assert.match(c, /São os mesmos textos, listados\s*\n\s*\/\/ onde quem cuida deles vai procurar/);
});

test('o departamento escolhido fica guardado', () => {
  assert.match(cfg, /let DEPT_ATIVO = \(\(\)=>\{ try\{ return localStorage\.getItem\('legalway-dept-avisos'\) \|\| null/,
    'quem cuida do Financeiro abre a tela no Financeiro');
  assert.match(corpoDaLista(), /localStorage\.setItem\('legalway-dept-avisos', DEPT_ATIVO\)/);
  assert.match(corpoDaLista(), /if\(DEPT_ATIVO && !depts\.some\(d=> d\.id === DEPT_ATIVO\)\) DEPT_ATIVO = null/,
    'departamento que deixou de existir volta para a lista, em vez de deixar a tela vazia');
});

test('abrir "os motivos que existem" não some com os botões', () => {
  // A lista dos 12 motivos morava DENTRO da linha dos botões, com
  // `align-items:center`. Aberta, ela esticava a linha e os botões "+ Criar
  // mensagem" e "Salvar mensagens" iam parar no meio vertical de um bloco
  // alto — fora da tela.
  const i = cfg.indexOf('id="btn-novo-aviso"');
  const linha = cfg.slice(cfg.lastIndexOf('<div style="display:flex', i), i + 400);
  assert.ok(!/<details/.test(linha), 'o bloco expansível não pode mais viver na linha dos botões');
  assert.match(cfg, /<!-- Fora da linha dos botões, de propósito\./,
    'o porquê fica escrito, senão alguém junta de novo para "economizar espaço"');
  const d = cfg.indexOf('<details style="margin:0 0 12px;">');
  assert.ok(d > i, 'a lista vem depois dos botões, em bloco próprio');
  assert.match(cfg.slice(d, d + 200), /Os \$\{\(gatilhos\|\|\[\]\)\.length\} motivos que existem/);
});
