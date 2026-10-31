// Auditoria: as CLASSES de defeito que já morderam, varridas no sistema todo.
//
// Em vez de olhar módulo a módulo, este arquivo vigia os padrões que já
// custaram dado real num dia só:
//
//   A. mexer num objeto depois de um `await` de pergunta — foi o que apagou a
//      ficha do Anselmo Ribeiro, com 10 anexos;
//   B. comparar telefone como TEXTO — foi o que deixou de pagar comissão do
//      SDR e de achar a ficha do cliente.
//
// Os testes falham quando o padrão volta a aparecer, em qualquer tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirDocs = fileURLToPath(new URL('../../docs/', import.meta.url));
const dirSrv = fileURLToPath(new URL('../src/', import.meta.url));
const telas = readdirSync(dirDocs).filter(f => f.endsWith('.html'))
  .map(f => [f, readFileSync(path.join(dirDocs, f), 'utf8')]);
const servidor = readdirSync(dirSrv).filter(f => f.endsWith('.js'))
  .map(f => [f, readFileSync(path.join(dirSrv, f), 'utf8')]);

test('A — nenhuma tela mexe no objeto logo depois de uma pergunta, sem reler', () => {
  const pergunta = /await\s+(LW\.(confirmar|pedirTexto|perguntarDependentes|confirmarComSenha|escolherComTexto)\(|confirm\()/;
  const mutacao = /^\s*[a-zA-Z_$][\w$]*\.(status|situacao|etapa|checklist|anexos|historico|contratoId|valor|clienteNome|responsavel|vendedor|aprovado|arquivo)\s*(=[^=]|\.push)/;
  const relendo = /\.find\(/;
  const suspeitos = [];
  for (const [nome, texto] of telas) {
    const linhas = texto.split('\n');
    for (let i = 0; i < linhas.length; i++) {
      if (!pergunta.test(linhas[i])) continue;
      const janela = linhas.slice(i + 1, i + 15);
      if (janela.some(l => relendo.test(l))) continue;   // releu: está protegido
      const j = janela.findIndex(l => mutacao.test(l));
      if (j >= 0) suspeitos.push(`${nome}:${i + j + 2} → ${janela[j].trim().slice(0, 70)}`);
    }
  }
  assert.deepEqual(suspeitos, [],
    'depois de uma pergunta, a lista pode ter sido trocada: procure o registro de novo pelo id antes de mexer nele');
});

test('B — telefone nunca é comparado como texto', () => {
  // "+1 407 555 0110" e "4075550110" são o mesmo número.
  const ruim = /\.telefone\s*===?\s*[a-zA-Z_$][\w$.]*\.telefone/;
  const suspeitos = [];
  for (const [nome, texto] of [...telas, ...servidor]) {
    texto.split('\n').forEach((l, i) => {
      if (!ruim.test(l)) return;
      if (/fimDoTelefone|mesmoTelefone|fimTel\(|soDig|replace\(\/\\D\//.test(l)) return;
      suspeitos.push(`${nome}:${i + 1} → ${l.trim().slice(0, 70)}`);
    });
  }
  assert.deepEqual(suspeitos, [],
    'use LW.mesmoTelefone (tela) ou comparar os últimos dígitos (servidor)');
});

test('o comparador compartilhado existe e é tolerante ao formato', () => {
  const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
  const i = comum.indexOf('window.LW.fimDoTelefone');
  assert.notEqual(i, -1, 'falta o helper');
  const corpo = comum.slice(i, i + 420);
  assert.match(corpo, /d\.length >= 8 \? d\.slice\(-8\) : ''/, 'oito dígitos do fim');
  assert.match(corpo, /mesmoTelefone = \(a, b\)=>\{ const x = LW\.fimDoTelefone\(a\); return !!x && x === LW\.fimDoTelefone\(b\); \}/,
    'telefone vazio não pode casar com telefone vazio');
});

test('remover anexo relê a ficha e confere a gravação', () => {
  const docs = telas.find(([n]) => n === 'documentos.html')[1];
  const i = docs.indexOf('data-remover-anexo]');
  const corpo = docs.slice(i, i + 1800);
  assert.match(corpo, /const vivo = processos\.find\(x=> x && x\.id === p\.id\)/);
  assert.match(corpo, /itemVivo\.nome !== item\.nome/,
    'o checklist pode ter mudado de ordem: confere que a linha ainda é a mesma');
  assert.match(corpo, /const erro = await saveProcessos\(\);/);
  assert.match(corpo, /NÃO consegui remover/, 'gravação que falha não pode virar "Anexo removido"');
});

// C — TODA GRAVAÇÃO TEM QUE LEVANTAR A FAIXA QUANDO FALHA
//
// O sistema já tinha a rede: `LW.gravar` mostra uma barra vermelha fixa em
// qualquer falha, mesmo quando quem chamou não confere o retorno — e são 134
// chamadas assim, espalhadas. O problema era quem passava por FORA dela.
//
// `saveProcessos` (Documentação) e `saveAgenda` (Entrada de Leads) gravavam
// direto no storage. Das 36 chamadas de `saveProcessos` nessa tela, a maioria
// ignora o retorno: a gravação falhava e não aparecia nada, em lugar nenhum.
test('C — nenhuma função de save escapa da faixa de falha', () => {
  const fora = [];
  for (const [nome, texto] of telas) {
    const re = /(?:async\s+)?function\s+(save[A-Z]\w*)\s*\([^)]*\)\s*\{/g;
    let m;
    while ((m = re.exec(texto))) {
      const fim = texto.indexOf('\n}', m.index);
      const corpo = texto.slice(m.index, fim > 0 ? fim : m.index + 600);
      // Sem os comentários: um comentário que MENCIONA LW.gravar satisfazia o
      // teste e deixava passar a função que não chamava ninguém. Foi assim
      // que o defeito replantado não reprovou na primeira tentativa.
      const codigo = corpo.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (!/storage\.set/.test(codigo)) continue;           // passa por LW.gravar
      if (/LW\.gravar\(|avisarFalhaGravacao\(/.test(codigo)) continue;
      fora.push(`${nome}: ${m[1]}`);
    }
  }
  assert.deepEqual(fora, [],
    'use LW.gravar, ou chame LW.avisarFalhaGravacao no catch');
});

test('a faixa diz a verdade inteira', () => {
  const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');
  const i = comum.indexOf('window.LW.avisarFalhaGravacao');
  const corpo = comum.slice(i, i + 900);
  assert.match(corpo, /position:fixed;bottom:0/, 'fixa na tela: aviso que some não serve');
  assert.match(corpo, /o que está na tela não está no servidor/,
    'tem que dizer que a tela está mentindo, não só que "deu erro"');
  assert.match(corpo, /z-index:10000/, 'acima de qualquer janela');
});
