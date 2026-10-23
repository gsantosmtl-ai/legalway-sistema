// "Jose Anselmo Ferreira Junior (contrato) e Regines e Junior (Trello) —
// precisamos unificar."
//
// O mesmo caso entrou duas vezes, por caminhos diferentes, e cada ficha ficou
// com metade. No banco dela, no dia:
//
//   Jose Anselmo  — contrato de US$ 6.500, telefone, e-mail, 3 documentos
//   REGINES E JUNIOR — sem contrato, sem telefone, 17 documentos e 9 anexos
//
// "Juntar registros duplicados" não alcança estes: ele casa por nome ou
// telefone, e aqui os nomes são diferentes e uma das fichas não tem telefone.
// Quem diz que são a mesma pessoa é ela.
//
// E o que aconteceu de verdade quando ela clicou: a ficha do José SUMIU e a da
// REGINES ficou intocada. A pergunta de confirmação é uma espera; enquanto ela
// lia, outra tela gravou, o recarregamento trocou o array `processos` por
// objetos novos, e a função seguiu escrevendo nos objetos velhos — órfãos. A
// junção foi parar no lixo e só a remoção foi gravada. Daí os dois testes do
// fim deste arquivo, que rodam a função de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

// Recorta uma função inteira contando chaves — `indexOf('\n}')` para na
// primeira chave de coluna zero, que aqui já não é o fim da função.
function corpoDe(fonte, assinatura) {
  const i = fonte.indexOf(assinatura);
  assert.notEqual(i, -1, 'não achei ' + assinatura);
  let n = 0, j = fonte.indexOf('{', i);
  for (let k = j; k < fonte.length; k++) {
    if (fonte[k] === '{') n++;
    else if (fonte[k] === '}') { n--; if (n === 0) return fonte.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham em ' + assinatura);
}

test('o botão existe na ficha e diz para que serve', () => {
  assert.match(docs, /id="btn-unificar"[^>]*>🔗 Unificar com outro processo<\/button>/);
  assert.match(docs, /um pelo contrato e outro pelo Trello, com nomes diferentes/,
    'quem nunca viu o problema não adivinha o que o botão faz');
  assert.match(docs, /document\.getElementById\('btn-unificar'\)\?\.addEventListener\('click', \(\)=> abrirUnificar\(p\.id\)\)/);
});

test('a escolha é dela, numa lista com busca', () => {
  // Não há regra automática possível: os nomes não se parecem.
  const corpo = corpoDe(docs, 'function abrirUnificar(id)');
  assert.match(corpo, /const outros = processos\.filter\(x=> x\.id !== id\)/, 'não pode unificar consigo mesmo');
  assert.match(corpo, /id="un-busca"/, 'com 266 processos, sem busca não se acha');
  assert.match(corpo, /\$\{escolhido\?'':'disabled'\}/, 'sem escolher, não dá para seguir');
});

test('a lista mostra o que cada ficha tem', () => {
  // É assim que ela confere que está juntando as metades certas.
  const i = docs.indexOf('const resumoDe = (x)=>');
  const corpo = docs.slice(i, docs.indexOf('];', i));
  assert.match(corpo, /documento\(s\)/);
  assert.match(corpo, /anexo\(s\)/);
  assert.match(corpo, /x\.contratoId \? 'com contrato' : 'sem contrato'/);
  assert.match(corpo, /x\.telefone \|\| 'sem telefone'/);
});

test('ela escolhe se é a mesma pessoa ou duas', () => {
  // Nenhuma regra automática acerta isso: "REGINES E JUNIOR" e "Jose Anselmo
  // Ferreira Junior" podem ser a mesma pessoa mal cadastrada ou um casal.
  assert.match(docs, /name="un-como" value="mesma"/);
  assert.match(docs, /name="un-como" value="pessoas"/);
  assert.match(docs, /A mesma pessoa, cadastrada duas vezes\./);
  assert.match(docs, /Duas pessoas do mesmo caso<\/b> — casal, dependente, familiar\./);
  assert.match(docs, /o passaporte de um não substitui o do outro/, 'o risco tem que estar dito na tela');
  assert.match(docs, /id="un-grupo"/, 'e ela nomeia a seção');
  assert.match(docs, /if\(!nomeGrupo && alvo\) nomeGrupo = alvo\.clienteNome \|\| ''/,
    'já vem preenchido com o nome da outra ficha');
});

test('mostra o resultado antes de aplicar, e avisa que dá para voltar', () => {
  const corpo = corpoDe(docs, 'async function unificar(ficaAntes, saiAntes, fundo, como, nomeGrupo)');
  assert.match(corpo, /const ok = await LW\.confirmar\(`Unificar "\$\{saiAntes\.clienteNome\}" em "\$\{ficaAntes\.clienteNome\}"\?`/);
  assert.match(corpo, /\$\{previa\.checklist\.length\} documento\(s\) \(\$\{previa\.vindos\} vieram da outra\)/,
    'os números antes, não depois');
  assert.match(corpo, /dá para voltar/);
  assert.match(corpo, /toast\('NÃO consegui unificar — ' \+ erro\)/,
    'falha de gravação não pode passar por sucesso');
  assert.match(corpo, /await loadAll\(\); render\(\)/,
    'gravação que falhou deixa a tela mentindo: tem que recarregar');
});

// ---------------------------------------------------------------- a junção
// `juntarFichas` é pura: devolve o resultado sem tocar em nenhuma das duas
// fichas. Dá para rodar de verdade.
function carregar() {
  const ctx = {
    temAnexo: (d) => !!(d && (d.arquivo || (Array.isArray(d.arquivos) && d.arquivos.length))),
  };
  vm.createContext(ctx);
  vm.runInContext(corpoDe(docs, 'function juntarFichas(fica, sai, como, nomeGrupo)'), ctx);
  return ctx;
}

test('casal não vira uma pessoa só', () => {
  // "Nesse caso são casal, marido e mulher, fizeram errado." Juntar por nome
  // apagaria o passaporte de um dos dois.
  const { juntarFichas } = carregar();
  const marido = { clienteNome: 'Junior', checklist: [{ nome: 'Passaporte', arquivo: '/a' }] };
  const esposa = { clienteNome: 'Regines', checklist: [{ nome: 'Passaporte', arquivo: '/b' }] };
  const r = juntarFichas(marido, esposa, 'pessoas', 'Regines');
  assert.equal(r.checklist.length, 2, 'os dois passaportes continuam existindo');
  assert.equal(r.vindos, 1);
  assert.equal(r.checklist[1].grupo, 'Regines', 'o que chega ganha a seção da outra pessoa');
  assert.equal(r.checklist[0].grupo, undefined, 'e o de quem fica não é mexido');
  assert.equal(esposa.checklist[0].grupo, undefined, 'a ficha de origem não é alterada');
});

test('mesma pessoa: documento repetido fica com o que tem arquivo', () => {
  const { juntarFichas } = carregar();
  const vazia = { checklist: [{ nome: 'Passaporte' }, { nome: 'Diploma', arquivo: '/d' }] };
  const cheia = { checklist: [{ nome: 'PASSAPÓRTE', arquivo: '/p' }, { nome: 'Diploma' }, { nome: 'Certidão' }] };
  const r = juntarFichas(vazia, cheia, 'mesma', '');
  const porNome = Object.fromEntries(r.checklist.map(d => [d.nome, d.arquivo || null]));
  assert.equal(r.checklist.length, 3, 'acento e maiúscula não podem criar documento duplicado');
  assert.equal(porNome['PASSAPÓRTE'], '/p', 'a linha em branco cede lugar à que tem o arquivo');
  assert.equal(porNome['Diploma'], '/d', 'e o arquivo que já existia não é substituído por uma linha em branco');
  assert.equal(porNome['Certidão'], null, 'documento inédito entra');
});

test('anexos e histórico dos dois se juntam, em ordem', () => {
  const { juntarFichas } = carregar();
  const r = juntarFichas(
    { anexos: [{ id: 1 }], historico: [{ quando: '2025-03-01', texto: 'b' }] },
    { anexos: [{ id: 2 }, { id: 3 }], historico: [{ quando: '2025-01-01', texto: 'a' }] },
    'mesma', '');
  assert.equal(r.anexos.length, 3, 'nenhum anexo pode ficar para trás');
  // JSON.stringify porque o array vem de dentro do vm: deepEqual compara o
  // prototype e dois realms nunca batem.
  assert.equal(JSON.stringify(r.historico.map(h => h.texto)), '["a","b"]', 'histórico fora de ordem não se lê');
});

// ------------------------------------------------- a ficha que sumiu de fato
// Roda `unificar` com o array sendo trocado embaixo dela, exatamente como o
// recarregamento ao vivo faz enquanto a pergunta está na tela.
function palco() {
  const ctx = {
    temAnexo: (d) => !!(d && (d.arquivo || (Array.isArray(d.arquivos) && d.arquivos.length))),
    now: () => new Date('2025-10-23T12:00:00Z'),
    sessao: { nome: 'Tatiane' },
    console,
    render: () => {}, renderDrawer: () => {},
    gravado: null, avisos: [],
    toast: (m) => ctx.avisos.push(m),
    saveProcessos: async () => { ctx.gravado = JSON.parse(JSON.stringify(ctx.processos)); return null; },
    loadAll: async () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(
    corpoDe(docs, 'function juntarFichas(fica, sai, como, nomeGrupo)') + '\n' +
    corpoDe(docs, 'async function unificar(ficaAntes, saiAntes, fundo, como, nomeGrupo)'), ctx);
  return ctx;
}

// Os dados reais do dia, reduzidos ao que importa.
const JOSE = () => ({ id: 'doc1791747916222783', clienteNome: 'Jose Anselmo Ferreira Junior', telefone: '+1407', contratoId: 'cblmv42mzsv90',
  checklist: [{ nome: 'Passaporte', arquivo: '/p' }, { nome: 'Certidão', arquivo: '/c' }, { nome: 'Procuração', arquivo: '/pr' }],
  anexos: Array.from({ length: 10 }, (_, i) => ({ id: 'a' + i })), historico: [] });
const REGINES = () => ({ id: 'doctrmv4fxl8t3', clienteNome: 'REGINES E JUNIOR', telefone: '',
  checklist: Array.from({ length: 17 }, (_, i) => ({ nome: 'Doc ' + i })),
  anexos: Array.from({ length: 9 }, (_, i) => ({ id: 'b' + i })), historico: [] });

test('o caso José + REGINES: nada se perde', async () => {
  const ctx = palco();
  ctx.processos = [REGINES(), JOSE()];
  const fica = ctx.processos[0], sai = ctx.processos[1];
  ctx.LW = { confirmar: async () => true };
  await ctx.unificar(fica, sai, { remove(){} }, 'pessoas', 'Jose Anselmo');

  assert.equal(ctx.gravado.length, 1, 'fica uma ficha só');
  const g = ctx.gravado[0];
  assert.equal(g.id, 'doctrmv4fxl8t3');
  assert.equal(g.checklist.length, 20, '17 da REGINES + os 3 trabalhados do José');
  assert.equal(g.anexos.length, 19, 'os 10 anexos do José não podem sumir');
  assert.equal(g.telefone, '+1407', 'campo vazio de quem fica é preenchido por quem sai');
  assert.equal(g.contratoId, 'cblmv42mzsv90', 'e o contrato de US$ 6.500 vem junto');
  assert.match(g.historico.at(-1).texto, /Unificado com a ficha "Jose Anselmo Ferreira Junior"/,
    'a ficha absorvida some: o nome dela tem que sobrar aqui');
  assert.equal(g.historico.at(-1).quem, 'Tatiane', 'e quem fez');
});

test('a lista trocada durante a pergunta não apaga a ficha absorvida', async () => {
  // Este é o defeito que custou 10 anexos. Enquanto `confirmar` espera, chega
  // um recarregamento e `processos` vira uma cópia nova, com outros objetos.
  const ctx = palco();
  ctx.processos = [REGINES(), JOSE()];
  const ficaVelho = ctx.processos[0], saiVelho = ctx.processos[1];
  ctx.LW = { confirmar: async () => { ctx.processos = [REGINES(), JOSE()]; return true; } };
  await ctx.unificar(ficaVelho, saiVelho, { remove(){} }, 'pessoas', 'Jose Anselmo');

  assert.ok(ctx.gravado, 'tem que ter gravado alguma coisa');
  assert.equal(ctx.gravado.length, 1);
  assert.equal(ctx.gravado[0].anexos.length, 19,
    'os anexos do José foram para a ficha viva, não para um objeto órfão');
  assert.equal(ctx.gravado[0].checklist.length, 20,
    'a junção tem que estar no que foi gravado — senão só a remoção vai para o servidor');
});

test('se a ficha sumiu de vez durante a pergunta, não grava nada', async () => {
  const ctx = palco();
  ctx.processos = [REGINES(), JOSE()];
  const ficaVelho = ctx.processos[0], saiVelho = ctx.processos[1];
  ctx.LW = { confirmar: async () => { ctx.processos = [REGINES()]; return true; } };
  await ctx.unificar(ficaVelho, saiVelho, { remove(){} }, 'pessoas', '');

  assert.equal(ctx.gravado, null, 'não dá para unificar com uma ficha que já não existe');
  assert.match(ctx.avisos.join(' '), /A lista mudou enquanto você confirmava/,
    'e ela precisa saber que nada foi feito');
});

test('a gravação é congelada na hora da chamada', () => {
  // Mesma armadilha, um andar abaixo: se a fila lesse `processos` só quando
  // chegasse a vez dela, um recarregamento no meio do caminho gravaria outra
  // coisa.
  const corpo = corpoDe(docs, 'function saveProcessos()');
  assert.match(corpo, /const corpo = JSON\.stringify\(processos\);/);
  assert.match(corpo, /window\.storage\.set\(PROCESSOS_KEY, corpo, true\)/);
  assert.ok(!/storage\.set\(PROCESSOS_KEY, JSON\.stringify\(processos\)/.test(corpo),
    'não pode serializar lá dentro da fila');
});
