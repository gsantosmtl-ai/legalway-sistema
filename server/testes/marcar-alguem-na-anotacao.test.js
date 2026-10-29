// Marcar alguém numa anotação: uma pessoa, um aviso.
//
// Relato dela em 29/10/2026: anexou uma anotação e o sistema deu erro dizendo
// que não subiu para o chat. No histórico ficou escrito:
//
//   avisado(s) no chat: Vitória, Vitoria, Bruno
//
// A mesma pessoa duas vezes. Três defeitos empilhados:
//
//   1. A lista da equipe vem de duas fontes que discordam no acento. O Set
//      compara texto cru, então "Vitória" e "Vitoria" entravam as duas.
//   2. No servidor, `lower()` do Postgres não tira acento: "Vitoria" nunca
//      achava a "Vitória" cadastrada, e essa tentativa falhava.
//   3. A ficha gravava QUEM FOI MARCADO, não quem foi avisado de verdade —
//      então o histórico dizia que avisou alguém que nunca recebeu nada.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(AQUI, '../../docs/documentos.html'), 'utf8');
const chat = readFileSync(join(AQUI, '../src/chat.js'), 'utf8');

function monta(equipe, respons) {
  const pega = (nome) => {
    const i = html.indexOf(`function ${nome}(`);
    assert.ok(i > 0, 'não achei ' + nome);
    let nivel = 0, fim = -1;
    for (let k = html.indexOf('{', i); k < html.length; k++) {
      if (html[k] === '{') nivel++;
      else if (html[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
    }
    return html.slice(i, fim);
  };
  const linhaSemAcento = /const semAcentoMin = [^\n]+/.exec(html);
  assert.ok(linhaSemAcento, 'não achei semAcentoMin');
  const ctx = createContext({ Map, Set, String, Array });
  runInContext(
    `let equipeDoEscritorio = ${JSON.stringify(equipe)};\n` +
    `let responsaveis = ${JSON.stringify(respons)};\n` +
    linhaSemAcento[0] + '\n' + pega('nomesDaEquipe') + '\n' + pega('mencoesNoTexto') +
    '\nglobalThis.API = { nomesDaEquipe, mencoesNoTexto };', ctx);
  return ctx.API;
}

// O caso dela, exatamente.
test('a mesma pessoa com e sem acento vira uma só', () => {
  const { nomesDaEquipe, mencoesNoTexto } = monta(['Vitoria', 'Bruno'], [{ nome: 'Vitória' }, { nome: 'Bruno' }]);
  const nomes = nomesDaEquipe();
  assert.strictEqual(nomes.filter(n => /vit[oó]ria/i.test(n)).length, 1,
    'Vitória e Vitoria voltaram a contar como duas pessoas: ' + nomes.join(', '));
  assert.ok(nomes.includes('Vitória'), 'ficou a grafia sem acento, que não casa com o cadastro');
  const marcados = mencoesNoTexto('@Bruno @Vitória - verificar esse cliente sem informacoes');
  assert.strictEqual(marcados.length, 2, 'marcou gente demais: ' + marcados.join(', '));
});

// A trava não pode juntar pessoas diferentes que só se parecem.
test('nomes parecidos de pessoas diferentes continuam separados', () => {
  const { nomesDaEquipe } = monta(['Celso Vieira', 'Celso Augusto'], []);
  assert.strictEqual(nomesDaEquipe().length, 2);
});

// "@Ana" dentro de "@Ana Paula" já não marcava a Ana; isso tem que continuar.
test('o nome curto dentro do nome longo não é marcado sozinho', () => {
  const { mencoesNoTexto } = monta(['Ana', 'Ana Paula'], []);
  // join, e não deepStrictEqual: o array nasce dentro do vm e tem outro
  // Array.prototype, então a comparação estrita reprova dois arrays iguais.
  assert.strictEqual(mencoesNoTexto('falei com a @Ana Paula hoje').join(','), 'Ana Paula');
});

test('o servidor procura a pessoa sem depender do acento', () => {
  assert.ok(/semAcento\(r\.nome\) === alvo/.test(chat),
    'avisarPessoa voltou a depender de acento para achar quem avisar');
  assert.ok(/const k = semAcento\(nome\);/.test(chat),
    'a rota de menções voltou a tratar "Vitória" e "Vitoria" como duas pessoas');
});

// O histórico tem que dizer a verdade: quem recebeu, e quem NÃO recebeu.
test('a ficha guarda quem foi avisado de verdade', () => {
  const i = html.indexOf('async function salvarAnotacaoDoc(');
  const corpo = html.slice(i, i + 2600);
  assert.ok(/entrada\.mencoes = r\.avisados \|\| \[\]/.test(corpo),
    'a ficha voltou a gravar quem foi marcado em vez de quem foi avisado');
  assert.ok(/entrada\.naoAvisados = r\.naoEncontrados/.test(corpo),
    'quem não foi avisado precisa ficar registrado — senão parece que a pessoa já sabe');
  assert.ok(/NÃO avisado\(s\)/.test(html), 'a ficha não mostra quem ficou sem o aviso');
});
