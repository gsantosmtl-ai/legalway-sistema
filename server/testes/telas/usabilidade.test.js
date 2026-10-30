// BATERIA POR TELA — usabilidade: o que faz a pessoa errar sem perceber.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TELAS, lerTela, scriptsDa, marcacaoDe, semComentarios, rotulosDeBotao } from './_base.js';

// As telas públicas não têm menu, chat nem toast — a régua é outra.
const PUBLICAS = new Set(['login.html', 'portal-cliente.html', 'portal-prestador.html',
  'primeiro-acesso.html', 'verificar.html']);

for (const tela of TELAS) {
  const html = lerTela(tela);
  const js = semComentarios(scriptsDa(html).join('\n'));
  const marcacao = marcacaoDe(html);
  const rotulos = rotulosDeBotao(marcacao);

  test(`${tela} · ação que destrói pede confirmação`, () => {
    // Procura a função que apaga e exige um confirm() dentro dela.
    const semConfirmar = [];
    // Com MAIÚSCULA importando: sem isso, "gerarContaPagarPrestador" casava
    // com "apagar" (o 'a' de "Conta" mais "Pagar") e era acusada à toa.
    const VERBO = /function\s+((?:excluir|remover|apagar|cancelar)\w*|\w*?(?:Excluir|Remover|Apagar|Cancelar)\w*)\s*\(/g;
    for (const m of js.matchAll(VERBO)) {
      const ini = m.index;
      let nivel = 0, fim = js.length;
      for (let k = js.indexOf('{', ini); k < js.length; k++) {
        if (js[k] === '{') nivel++;
        else if (js[k] === '}' && --nivel === 0) { fim = k; break; }
      }
      const corpo = js.slice(ini, fim);
      // só cobra confirmação de quem de fato grava ou chama o servidor
      const mexe = /\bsave|\bgravar|LW\.api\(|fetch\(/i.test(corpo);
      if (mexe && !/confirm\(|confirmar\(|pergunta/i.test(corpo)) semConfirmar.push(m[1]);
    }
    assert.deepEqual([...new Set(semConfirmar)], [],
      'estas funções destroem dado e não perguntam nada antes');
  });

  test(`${tela} · rótulo de botão não usa verbo proibido`, () => {
    // Vocabulário da casa: Alterar (não Editar), Remover (dá para desfazer)
    // ou Excluir (de vez) — nunca Apagar nem Deletar.
    const ruins = rotulos.filter((t) => /^(editar|apagar|deletar)\b/i.test(t));
    assert.deepEqual(ruins, [], 'use Alterar, Remover ou Excluir');
  });

  test(`${tela} · campo de busca explica o que procura`, () => {
    const buscas = [...marcacao.matchAll(/<input\b[^>]*\b(?:id|class)="[^"]*busca[^"]*"[^>]*>/gi)].map((m) => m[0]);
    const mudos = buscas.filter((i) => !/placeholder=|aria-label=/i.test(i));
    assert.deepEqual(mudos.map((x) => x.slice(0, 60)), [],
      'campo de busca sem placeholder: ninguém sabe o que dá para procurar');
  });

  test(`${tela} · link que abre fora leva rel="noopener"`, () => {
    const abertos = [...marcacao.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)].map((m) => m[0]);
    const inseguros = abertos.filter((a) => !/rel="[^"]*noopener/i.test(a));
    assert.deepEqual(inseguros.map((x) => x.slice(0, 70)), [],
      'sem noopener a página aberta pode mexer nesta');
  });

  test(`${tela} · erro não aparece em alert()`, () => {
    if (PUBLICAS.has(tela)) { assert.ok(true, 'tela pública não tem toast'); return; }
    if (!/function toast\(|LW\.toast|\btoast\(/.test(js)) { assert.ok(true, 'esta tela não tem toast'); return; }
    const alertas = [...js.matchAll(/alert\(\s*['"`]([^'"`]{0,60})/g)].map((m) => m[1]);
    assert.deepEqual(alertas, [],
      'esta tela tem toast — alert() trava a tela e some sem deixar rastro');
  });

  test(`${tela} · a tela diz algo quando não há nada para mostrar`, () => {
    if (PUBLICAS.has(tela)) { assert.ok(true, 'não se aplica'); return; }
    const temVazio = /empty|vazio|Nenhum|Nenhuma|nada por aqui|sem resultado/i.test(html);
    assert.ok(temVazio, 'lista vazia sem mensagem parece tela quebrada');
  });
}
