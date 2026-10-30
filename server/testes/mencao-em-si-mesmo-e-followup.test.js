// Reportado pela equipe em 30/10/2026, por áudio: "o Renato fez uma simulação
// num dos clientes dele para fazer um follow-up, botando uma anotação no
// arroba. Isso não está indo para aquele painelzinho dos lembretes dele."
//
// A menção gravou certo. O que barrava era a regra "ninguém se avisa sozinho",
// que faz sentido no chat (seria eco) e não faz no painel de lembretes — onde
// marcar a si mesmo É o jeito de deixar um follow-up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { montarLembretes } = await import('../src/lembretes.js');

const agora = new Date('2026-10-30T20:00:00Z');
const umaFichaCom = (mencoes, quem = 'Renato') => ([{
  id: 'p1', codigo: 'PC-0205', clienteNome: 'Simone Azevedo Santana', servico: 'Visto T',
  historico: [{ tipo: 'Anotação', quando: '2026-10-30T19:45:00Z', quem, mencoes,
    texto: '@Renato Verificar status' }],
}]);

const so = (itens, tipo) => itens.filter((i) => i.tipo === tipo);

test('marcar a si mesmo vira lembrete — é follow-up, não erro', () => {
  const itens = montarLembretes([], [], agora, undefined, umaFichaCom(['Renato']));
  const m = so(itens, 'mencao');
  assert.equal(m.length, 1, 'o follow-up que a pessoa deixou para si sumiu do painel');
  assert.equal(m[0].para, 'Renato');
  assert.match(m[0].titulo, /Seu lembrete/, 'avisar que "Renato marcou você" soa errado para si mesmo');
  assert.match(m[0].link, /documentos\.html/);
});

test('marcar outra pessoa continua funcionando', () => {
  const itens = montarLembretes([], [], agora, undefined, umaFichaCom(['Bruno'], 'Renato'));
  const m = so(itens, 'mencao');
  assert.equal(m.length, 1);
  assert.equal(m[0].para, 'Bruno');
  assert.match(m[0].titulo, /Renato marcou você/);
});

test('"Vitória" e "Vitoria" na mesma anotação não viram dois avisos', () => {
  const itens = montarLembretes([], [], agora, undefined,
    umaFichaCom(['Vitória', 'Vitoria', 'Bruno'], 'Tatiane'));
  const m = so(itens, 'mencao');
  assert.equal(m.length, 2, 'a mesma pessoa escrita com e sem acento gerou dois lembretes');
  assert.deepEqual([...new Set(m.map((x) => x.para.normalize('NFD').replace(/[̀-ͯ]/g, '')))].sort(),
    ['Bruno', 'Vitoria']);
});

test('ficha cancelada não gera lembrete', () => {
  const fichas = umaFichaCom(['Renato']);
  fichas[0].situacao = 'cancelado';
  assert.equal(so(montarLembretes([], [], agora, undefined, fichas), 'mencao').length, 0);
});

test('anotação velha sai do painel depois da janela', () => {
  const tarde = new Date('2026-11-10T20:00:00Z');   // 11 dias depois
  assert.equal(so(montarLembretes([], [], tarde, undefined, umaFichaCom(['Renato'])), 'mencao').length, 0);
});
