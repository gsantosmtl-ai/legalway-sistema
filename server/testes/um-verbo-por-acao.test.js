// "184 rótulos de botão diferentes, e só 8% aparecem em mais de uma tela."
//
// O pior caso estava dentro de UMA tela: no Financeiro conviviam "Editar
// vencimento" (em massa) e "Alterar vencimento" (na linha) — mesma ação, duas
// palavras. Quem aprendeu "Editar" procurava "Editar" e não achava.
//
// O padrão agora:
//   Alterar  — mudar algo que já existe
//   Adicionar — acrescentar a uma lista
//   Remover  — tirar de uma lista, dá para pôr de volta
//   Excluir  — apagar de vez
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../../docs/', import.meta.url);
const TELAS = readdirSync(DIR).filter(a => a.endsWith('.html'));

function rotulosDeBotao(html) {
  const fora = [];
  for (const m of html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)) {
    const cru = m[1].replace(/<[^>]+>/g, '').trim();
    // Rótulo que COMEÇA com variável tem a primeira palavra decidida em tempo
    // de execução ("Esconder"/"Ver"): a caixa dele não dá para conferir aqui.
    if (/^\$\{/.test(cru)) continue;
    const t = cru.replace(/\$\{[^}]*\}/g, '…').trim();
    if (t && t.length <= 46) fora.push(t);
  }
  return fora;
}

test('nenhum botão diz "Editar" — o verbo é Alterar', () => {
  const erros = [];
  for (const arq of TELAS) {
    for (const t of rotulosDeBotao(readFileSync(new URL(arq, DIR), 'utf8'))) {
      if (/^editar\b/i.test(t)) erros.push(`${arq}: "${t}"`);
    }
  }
  assert.deepEqual(erros, [], 'use Alterar');
});

test('nenhum botão diz "Apagar" nem "Deletar"', () => {
  // Três palavras para destruir deixa a pessoa sem saber qual é a definitiva.
  const erros = [];
  for (const arq of TELAS) {
    for (const t of rotulosDeBotao(readFileSync(new URL(arq, DIR), 'utf8'))) {
      if (/^(apagar|deletar)\b/i.test(t)) erros.push(`${arq}: "${t}"`);
    }
  }
  assert.deepEqual(erros, [], 'use Remover (dá para desfazer) ou Excluir (de vez)');
});

test('rótulo de botão começa com maiúscula', () => {
  // "remover" e "Remover" na mesma tela parecem coisas diferentes.
  const erros = [];
  for (const arq of TELAS) {
    for (const t of rotulosDeBotao(readFileSync(new URL(arq, DIR), 'utf8'))) {
      const primeira = t.replace(/^[^\p{L}]+/u, '')[0];
      if (primeira && primeira !== primeira.toUpperCase()) erros.push(`${arq}: "${t}"`);
    }
  }
  assert.deepEqual(erros, []);
});

test('o botão e o título da janela usam a mesma palavra', () => {
  // Clicar em "Alterar vencimento em massa" e cair numa janela chamada
  // "Editar vencimento em massa" faz a pessoa achar que errou o botão.
  const fin = readFileSync(new URL('financeiro.html', DIR), 'utf8');
  assert.match(fin, />Alterar vencimento em massa</);
  assert.match(fin, /<h3>Alterar vencimento em massa<\/h3>/);
  assert.doesNotMatch(fin, /Editar vencimento/);
});
