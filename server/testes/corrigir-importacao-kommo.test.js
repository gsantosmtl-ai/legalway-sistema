// "O Renato está falando que os sem contato não estão no funil dele."
//
// Estava certo, e os números mostram:
//
//            Lead Assumido no funil     "Sem contato" no SDR
//   Adriano           154                        16
//   Renato              1                       126
//
// No Kommo os leads do Renato saíram na etapa "Sem Contato" (genérica), não
// "Sem Contato - Renato". A regra genérica manda para a fila do SDR, e o nome
// dele ficou só em `vendedorOriginal`. Os do Adriano saíram como "Adriano -
// Sem Contato" e foram para o funil. Mesma intenção, dois nomes de etapa, dois
// destinos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sdr = readFileSync(new URL('../../docs/sdr.html', import.meta.url), 'utf8');
const imp = readFileSync(new URL('../../ferramentas/importar-kommo.mjs', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const i = sdr.indexOf(assinatura);
  assert.notEqual(i, -1, 'não achei ' + assinatura);
  let n = 0;
  for (let k = sdr.indexOf('{', i); k < sdr.length; k++) {
    if (sdr[k] === '{') n++;
    else if (sdr[k] === '}') { n--; if (n === 0) return sdr.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham');
}

// -------------------------------------------------- o mapeamento dela
test('o importador tem o mapeamento que ela ditou, etapa por etapa', () => {
  const esperado = [
    [/'Sem Contato':\s*\{ destino: 'sdr'/, 'Sem contato genérico → SDR'],
    [/'ENVIADOS SDR':\s*\{ destino: 'sdr'/, 'Enviado ao SDR → SDR'],
    [/'Adriano - EB1 - EB2':.*etapa: 'Reunião agendada',\s*vendedor: 'Adriano', servico: 'EB2-NIW'/, 'Adriano EB1/EB2'],
    [/'Adriano - Sem Contato':.*etapa: 'Lead Assumido',\s*vendedor: 'Adriano'/, 'Adriano sem contato'],
    [/'Adriano':\s*\{ destino: 'funil', etapa: 'Contato realizado',\s*vendedor: 'Adriano' \}/, 'Adriano em contato'],
    [/'Adriano Proposta':.*etapa: 'Negociação\/Fechamento',\s*vendedor: 'Adriano'/, 'Adriano proposta'],
    [/'Lost adriano':\s*\{ destino: 'sdr'/, 'Lost Adriano → SDR'],
    [/'Sem Contato - Renato':.*etapa: 'Lead Assumido',\s*vendedor: 'Renato'/, 'sem contato Renato → funil dele'],
    [/'Contato ok - Renato':.*etapa: 'Contato realizado',\s*vendedor: 'Renato'/, 'contato ok Renato'],
    [/'Proposta - Renato':.*etapa: 'Negociação\/Fechamento',\s*vendedor: 'Renato'/, 'proposta Renato'],
    [/'EB - Renato':.*etapa: 'Reunião agendada',\s*vendedor: 'Renato'/, 'EB Renato'],
    [/'Repasse - Renato':\s*\{ destino: 'sdr'/, 'repasse Renato → SDR'],
    [/'Lost Renato':\s*\{ destino: 'sdr'/, 'lost Renato → SDR'],
  ];
  for (const [re, oque] of esperado) assert.match(imp, re, 'falta no mapeamento: ' + oque);
});

// --------------------------------------------- quem volta para o funil
function escolher(leads) {
  const ctx = { leads };
  vm.createContext(ctx);
  vm.runInContext(corpoDe('function paraDevolverAoFunil()'), ctx);
  return ctx.paraDevolverAoFunil();
}
const lead = (x) => ({ id: 'l' + Math.random(), nome: 'X', status: 'fila', motivo: 'Sem contato', vendedorOriginal: 'Renato', ...x });

test('volta ao funil quem tem vendedor identificado', () => {
  assert.equal(escolher([lead()]).length, 1);
  assert.equal(escolher([lead({ vendedorOriginal: 'Adriano' })]).length, 1, 'vale para os dois vendedores');
});

test('sem vendedor, continua no SDR — não há a quem devolver', () => {
  assert.equal(escolher([lead({ vendedorOriginal: '' })]).length, 0);
  assert.equal(escolher([lead({ vendedorOriginal: '(sem vendedor no Kommo)' })]).length, 0,
    'o importador grava esse texto quando o Kommo não tinha responsável');
});

test('só "Sem contato" — perdido e repasse ficam no SDR, que é o lugar deles', () => {
  for (const motivo of ['Perdido', 'Repasse', 'Já estava na fila do SDR']) {
    assert.equal(escolher([lead({ motivo })]).length, 0, motivo + ' não pode voltar');
  }
  assert.equal(escolher([lead({ motivo: '  SEM CONTATO ' })]).length, 1, 'espaço e maiúscula não mudam nada');
});

test('lead já recuperado ou encerrado não é mexido', () => {
  assert.equal(escolher([lead({ status: 'recuperado' })]).length, 0);
  assert.equal(escolher([lead({ status: 'encerrado' })]).length, 0);
  assert.equal(escolher([lead({ status: 'em_contato' })]).length, 1, 'em contato ainda é da fila');
});

// ------------------------------------------------------- a aplicação
test('não cria duplicata de quem já está no funil — só acerta o dono', () => {
  const corpo = corpoDe('async function aplicarCorrecaoKommo(botao, fundo)');
  assert.match(corpo, /const existente = funil\.find\(f=> f && mesmoTel\(f\.telefone, l\.telefone\)\)/);
  assert.match(corpo, /if\(existente\.vendedor !== dono\)\{/);
  assert.match(corpo, /x\.length>=8 && y\.length>=8 && x\.slice\(-10\)===y\.slice\(-10\)/,
    'telefone comparado pelos dígitos: "+1 407…" e "407…" são a mesma pessoa');
});

test('o lead entra em "Lead Assumido", com o histórico de onde veio', () => {
  const corpo = corpoDe('async function aplicarCorrecaoKommo(botao, fundo)');
  assert.match(corpo, /etapa: 'Lead Assumido'/);
  assert.match(corpo, /vendedor: dono/);
  assert.match(corpo, /\.\.\.\(Array\.isArray\(l\.historico\) \? l\.historico : \[\]\)/,
    'o que o SDR já tinha anotado não se perde');
  assert.match(corpo, /tinha ido para a fila do SDR por engano/);
});

test('se a segunda gravação falhar, ela sabe o que fazer', () => {
  // São dois blocos: o funil e a fila do SDR. Falhar no meio deixa o lead nos
  // dois lugares, e dizer só "erro" faria ela rodar de novo e duplicar.
  const corpo = corpoDe('async function aplicarCorrecaoKommo(botao, fundo)');
  assert.match(corpo, /const e1 = await saveFunil\(\);/);
  assert.match(corpo, /const e2 = await saveLeads\(\);/);
  assert.match(corpo, /entraram no funil, mas NÃO consegui tirá-los da fila do SDR/);
  assert.match(corpo, /Recarregue e rode de novo/);
});

test('a tela explica o que aconteceu antes de deixar clicar', () => {
  const corpo = corpoDe('function abrirCorrecaoKommo()');
  assert.match(corpo, /parte dos leads saiu na etapa <b>"Sem Contato"<\/b> sem o nome do vendedor junto/);
  assert.match(corpo, /lead\(s\) voltam para o funil/);
  assert.match(corpo, /continua no SDR<\/b> — não há a quem devolver/);
  assert.match(corpo, /não vira duplicata/);
  assert.match(corpo, /Nada a corrigir/, 'rodar duas vezes não pode assustar');
});
