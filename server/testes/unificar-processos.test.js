// "Jose Anselmo Ferreira Junior (contrato) e Regines e Junior (Trello) —
// precisamos unificar."
//
// O mesmo caso entrou duas vezes, por caminhos diferentes, e cada ficha ficou
// com metade. No banco dela, hoje:
//
//   Jose Anselmo  — contrato de US$ 6.500, telefone, e-mail, 3 documentos
//   REGINES E JUNIOR — sem contrato, sem telefone, 17 documentos e 9 anexos
//
// "Juntar registros duplicados" não alcança estes: ele casa por nome ou
// telefone, e aqui os nomes são diferentes e uma das fichas não tem telefone.
// Quem diz que são a mesma pessoa é ela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

test('o botão existe na ficha e diz para que serve', () => {
  assert.match(docs, /id="btn-unificar"[^>]*>🔗 Unificar com outro processo<\/button>/);
  assert.match(docs, /um pelo contrato e outro pelo Trello, com nomes diferentes/,
    'quem nunca viu o problema não adivinha o que o botão faz');
  assert.match(docs, /document\.getElementById\('btn-unificar'\)\?\.addEventListener\('click', \(\)=> abrirUnificar\(p\.id\)\)/);
});

test('a escolha é dela, numa lista com busca', () => {
  // Não há regra automática possível: os nomes não se parecem.
  const i = docs.indexOf('function abrirUnificar(id)');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
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

test('casal não vira uma pessoa só', () => {
  // "Nesse caso são casal, marido e mulher, fizeram errado." Juntar por nome
  // apagaria o passaporte de um dos dois: o passaporte da esposa não é o
  // passaporte do marido.
  const i = docs.indexOf('async function unificar(fica, sai, fundo, como, nomeGrupo)');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
  assert.match(corpo, /if\(como === 'pessoas'\)\{/, 'tem que haver o caso das duas pessoas');
  assert.match(corpo, /const chegando = \(sai\.checklist\|\|\[\]\)\.map\(d=> \(\{ \.\.\.d, grupo \}\)\)/,
    'os documentos que chegam ganham a seção da outra pessoa');
  assert.match(corpo, /novoChecklist = \[\.\.\.\(fica\.checklist\|\|\[\]\), \.\.\.chegando\]/,
    'entram inteiros, sem casar por nome');
  assert.ok(!/porNome/.test(corpo.slice(corpo.indexOf("if(como === 'pessoas')"), corpo.indexOf('} else {'))),
    'nada de deduplicar no caminho do casal');
  // É o mesmo `grupo` que o checklist já usa para dependentes, então a tela e o
  // portal mostram separado sem precisar saber de nada novo.
  assert.match(docs, /grupo: 'Dependente ' \+ i|const grupo = \(nomeGrupo/, 'usa o campo de seção que já existe');
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

test('documento repetido: fica o que tem arquivo', () => {
  // O mesmo documento existe nas duas fichas; numa está em branco e na outra
  // alguém já anexou. Ficar com a linha em branco apagaria o trabalho feito.
  const i = docs.indexOf('async function unificar(fica, sai, fundo, como, nomeGrupo)');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
  assert.match(corpo, /if\(!atual\)\{ porNome\.set\(k, d\); vindos\+\+; continue; \}/, 'documento inédito entra');
  assert.match(corpo, /if\(!temAnexo\(atual\) && temAnexo\(d\)\)\{ porNome\.set\(k, d\); vindos\+\+; \}/,
    'repetido só troca quando o que vem tem arquivo e o que está não tem');
  assert.match(corpo, /normalize\('NFD'\)\.replace\(\/\[\\u0300-\\u036f\]\/g,''\)/,
    'acento e maiúscula não podem criar documento duplicado na ficha unificada');
});

test('anexos e histórico dos dois se juntam, em ordem', () => {
  const i = docs.indexOf('async function unificar(fica, sai, fundo, como, nomeGrupo)');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
  assert.match(corpo, /const anexos = \[\.\.\.\(fica\.anexos\|\|\[\]\), \.\.\.\(sai\.anexos\|\|\[\]\)\]/);
  assert.match(corpo, /\.sort\(\(a,b\)=> String\(a\.quando\|\|''\)\.localeCompare\(String\(b\.quando\|\|''\)\)\)/,
    'histórico fora de ordem não se lê');
});

test('campo vazio de quem fica é preenchido por quem sai', () => {
  // A ficha do Trello tem os documentos; a do contrato tem o telefone. Nenhuma
  // das duas sozinha serve.
  const i = docs.indexOf('async function unificar(fica, sai, fundo, como, nomeGrupo)');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
  assert.match(corpo, /for\(const campo of \['telefone','email','responsavel','servico','vendedor','contratoId','protocolo','uscis'\]\)/);
  assert.match(corpo, /if\(!fica\[campo\] && sai\[campo\]\) fica\[campo\] = sai\[campo\];/,
    'nunca sobrescreve o que já está preenchido');
});

test('fica registrado de onde veio', () => {
  const i = docs.indexOf('async function unificar(fica, sai, fundo, como, nomeGrupo)');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
  assert.match(corpo, /Unificado com a ficha "\$\{sai\.clienteNome\}"/, 'a ficha absorvida some: o nome dela tem que sobrar aqui');
  assert.match(corpo, /quem: \(sessao && sessao\.nome\) \|\| ''/, 'e quem fez');
});

test('mostra o resultado antes de aplicar, e avisa que dá para voltar', () => {
  const i = docs.indexOf('async function unificar(fica, sai, fundo, como, nomeGrupo)');
  const corpo = docs.slice(i, docs.indexOf('\n}', i));
  assert.match(corpo, /const ok = await LW\.confirmar\(`Unificar "\$\{sai\.clienteNome\}" em "\$\{fica\.clienteNome\}"\?`/);
  assert.match(corpo, /\$\{novoChecklist\.length\} documento\(s\) \(\$\{vindos\} vieram da outra\)/,
    'os números antes, não depois');
  assert.match(corpo, /dá para voltar/);
  assert.match(corpo, /if\(erro\)\{ toast\('NÃO consegui unificar — ' \+ erro\); return; \}/,
    'falha de gravação não pode passar por sucesso');
});
