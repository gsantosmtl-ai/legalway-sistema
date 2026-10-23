// "Quero que mostre em processos somente a etapa que ele está, e não as etapas
// que ele percorreu."
//
// A leitura dela estava certa para o que a tela mostrava — e a tela estava
// errada. As três linhas não eram etapas percorridas: eram TRÊS FICHAS
// diferentes, e as três só diziam "Visto T". Sem nome, sem contrato, sem nada
// que as distinguisse.
//
// O caso real: Lucas Moisés e Esdras são irmãos com o mesmo e-mail. Na ficha do
// Lucas apareciam 3 "processos" — uma ficha vazia, a ficha do Lucas, e o
// processo PROTOCOLADO do Esdras, que só estava ali porque ficou preso ao
// contrato do Lucas. Passamos a manhã achando que era o nome que estava errado.
// Era o contrato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
const i = comum.indexOf("${titulo(meusProcessos.length > 1");
const bloco = comum.slice(i, comum.indexOf("${titulo('Extrato", i));
assert.notEqual(i, -1, 'não achei o bloco de Processos da ficha');

test('diz que são fichas separadas, não etapas percorridas', () => {
  assert.match(bloco, /fichas separadas/);
  assert.match(bloco, /não são as etapas por que um processo passou/,
    'a frase tem que estar na tela: foi a leitura natural de quem olhou');
  assert.match(bloco, /meusProcessos\.length > 1/, 'com um processo só, não há o que explicar');
});

test('cada linha diz de QUEM é a ficha', () => {
  // Antes todas diziam só "Visto T". Três linhas iguais parecem uma trilha.
  assert.match(bloco, /\$\{esc\(p\.clienteNome \|\| p\.servico \|\| 'Processo'\)\}/,
    'o nome gravado na ficha é o título da linha');
  assert.ok(!/<b style="font-size:13px;">\$\{esc\(p\.servico\|\|'Processo'\)\}<\/b>/.test(bloco),
    'o serviço sozinho não distingue nada: todos são Visto T');
});

test('ficha no nome de outra pessoa fica marcada', () => {
  // É o sinal que teria economizado a manhã inteira.
  assert.match(bloco, /const doOutro = normal\(p\.clienteNome\) && normal\(p\.clienteNome\) !== normal\(nomeAlvo\)/);
  assert.match(bloco, /Esta ficha está gravada no nome de/);
  assert.match(bloco, /confira se o contrato é da pessoa certa/,
    'o aviso tem que apontar para a causa — o vínculo, não o nome');
  assert.match(bloco, /doOutro \? '#D9A441' : '#E4E1DA'/, 'e tem que saltar aos olhos');
});

test('mostra de qual contrato a ficha veio, e em que situação ele está', () => {
  // O processo protocolado do Esdras estava preso a um contrato CANCELADO.
  // Sem essa linha, não há como ver isso na ficha.
  assert.match(bloco, /veio do contrato de \$\{dinheiro\(ct\.valor\)\} · \$\{esc\(ct\.etapa \|\| 'sem etapa'\)\}/);
  assert.match(bloco, /'sem contrato ligado'/, 'ficha do Trello não tem contrato: isso também precisa aparecer');
});

test('mostra os anexos, que é onde está o trabalho de verdade', () => {
  // "0/20 aprovados" não diz se alguém mexeu na ficha. 17 anexos dizem.
  assert.match(bloco, /const anexos = \(p\.anexos\|\|\[\]\)\.length/);
  assert.match(bloco, /anexos \? ' · ' \+ anexos \+ ' anexo\(s\)' : ''/);
});

test('continua mostrando só a etapa atual de cada ficha', () => {
  // O pedido dela, ao pé da letra: uma pílula por ficha, a etapa de agora.
  assert.match(bloco, /\$\{pilula\(p\.status \|\| 'sem status'/);
  assert.ok(!/historico/.test(bloco), 'nada de listar por onde a ficha passou');
});
