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
test('as mensagens automáticas aparecem agrupadas por departamento', () => {
  const i = cfg.indexOf('function pintarListaAvisos(setores)');
  assert.notEqual(i, -1);
  const corpo = cfg.slice(i, cfg.indexOf('function umAviso(a, i)', i));
  assert.match(corpo, /const ORDEM = \['comercial','documentos','financeiro'\]/,
    'o funil manda na ordem: comercial, documentos, financeiro');
  assert.match(corpo, /const chave = a\.gatilho \? setorDoAviso\(a\) : '__novas'/,
    'mensagem sem motivo ainda não tem departamento — vai para o topo, esperando ela');
  assert.match(corpo, /a\.setor \|\| \(g && g\.setorSugerido\)/,
    'vale o setor escolhido na mensagem; o sugerido é só o padrão');
  assert.match(corpo, /\$\{n\} mensagem\(ns\)/, 'cada grupo diz quantas tem');
});

test('cada departamento explica o que é dele', () => {
  const i = cfg.indexOf('const EXPLICA = {');
  const corpo = cfg.slice(i, i + 800);
  assert.match(corpo, /primeiro contato, apresentação e SDR — onde o lead ainda não tem dono/,
    'é a regra que ela acabou de definir, e precisa estar escrita na tela');
  assert.match(corpo, /a reunião pelo número de quem a marcou/);
  assert.match(corpo, /documentos: 'Tudo que fala do processo do cliente\.'/);
  assert.match(corpo, /financeiro: 'Tudo que fala de dinheiro\.'/);
});
