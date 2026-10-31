// 1.908 leads numa página só.
//
// Medido em 31/10/2026 numa bancada de 390x844, com a base real: a Entrada de
// leads desenhava todos os leads de uma vez — 67.933px de altura e 2.062
// alvos de toque. Clientes, 19.476px. Rolar isso num telefone não é
// desconfortável, é impossível: são oitenta telas de rolagem para chegar ao
// fim, e o navegador tem de montar duas mil linhas antes de mostrar a
// primeira.
//
// Agora vem por página. As três coisas que não podem faltar, e que esta
// bateria guarda:
//
//   1. dizer quantos ficaram de fora — lista cortada em silêncio faz a pessoa
//      concluir que o sistema perdeu registro;
//   2. voltar ao começo quando o filtro muda — senão ela filtra, a página
//      continua na posição antiga e a lista aparece vazia sem motivo;
//   3. NÃO voltar ao começo quando ela só assume um lead — perder o lugar
//      depois de cada ação é o tipo de coisa que faz desistir da tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerTela } from './_base.js';

const TELAS_COM_PAGINA = [
  { arq: 'entrada-leads.html', pagina: 'PAGINA', estado: 'mostrando',
    assinatura: 'assinaturaFiltros', botao: 'ver-mais-leads', total: 'leads' },
  { arq: 'clientes.html', pagina: 'PAGINA_CLI', estado: 'mostrandoCli',
    assinatura: 'assinaturaFiltrosCli', botao: 'ver-mais-clientes', total: 'clientes' },
];

for (const t of TELAS_COM_PAGINA) {
  const html = lerTela(t.arq);

  test(`${t.arq} · a página é menor no celular`, () => {
    const i = html.indexOf('const ' + t.pagina + ' =');
    assert.ok(i > 0, 'sumiu o tamanho de página');
    const linha = html.slice(i, html.indexOf('\n', i));
    assert.match(linha, /lw-celular/, 'o tamanho precisa depender do aparelho');
    const nums = [...linha.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));
    assert.equal(nums.length, 2, 'esperava dois números: o do celular e o do computador');
    assert.ok(nums[0] < nums[1], 'a página do celular tem de ser a menor — veio ' + nums.join(' e '));
    assert.ok(nums[0] >= 20 && nums[0] <= 100,
      'entre 20 e 100: abaixo disso ela toca "mostrar mais" o tempo todo, acima volta o rolo — veio ' + nums[0]);
  });

  test(`${t.arq} · a lista cortada diz quantos ficaram de fora`, () => {
    assert.match(html, new RegExp('id="' + t.botao + '"'), 'falta o botão de mostrar mais');
    const i = html.indexOf('id="' + t.botao + '"');
    const trecho = html.slice(i - 400, i + 400);
    assert.match(trecho, /faltam \$\{/, 'o botão tem de dizer quantos faltam');
    assert.match(trecho, /length > visiveis\.length/,
      'o botão só aparece quando sobrou gente — botão que não faz nada é ruído');
    // e o contador de cima também conta a verdade
    assert.match(html, /Mostrando \$\{visiveis\.length\} d[oa]s \$\{/,
      'o rótulo de cima precisa dizer quantos estão à vista, não quantos existem');
  });

  test(`${t.arq} · trocar de filtro volta ao começo, agir não`, () => {
    const i = html.indexOf('const assinatura = [');
    assert.ok(i > 0, 'sumiu a assinatura dos filtros');
    const linha = html.slice(i, html.indexOf(';', i));
    const reset = html.indexOf(t.assinatura + ' = assinatura');
    assert.ok(reset > i, 'a assinatura precisa ser guardada quando muda');
    const corte = html.indexOf('.slice(0, ' + t.estado + ')');
    assert.ok(corte > reset,
      'o corte da lista tem de vir DEPOIS da conferência do filtro, senão a primeira '
      + 'tela depois de filtrar ainda sai na posição antiga');

    // Todo filtro que a tela usa tem de estar na assinatura. Esquecer um é um
    // bug silencioso: a pessoa filtra, a posição não zera, e a lista aparece
    // curta ou vazia sem explicação.
    const usados = [...html.matchAll(/\b(filtro[A-Z]\w*)\b/g)].map((m) => m[1]);
    const unicos = [...new Set(usados)];
    const faltando = unicos.filter((f) => !linha.includes(f));
    assert.deepEqual(faltando, [],
      'filtro fora da assinatura: mudar ele não vai devolver a lista ao começo');
    assert.match(linha, /busca/, 'a busca também é filtro');
  });

  test(`${t.arq} · o total continua visível, inteiro`, () => {
    // Se a tela passar a mostrar só o que está na página como se fosse o
    // total, ela mente sobre o tamanho da operação — e é um número que ela
    // usa para decidir.
    assert.match(html, new RegExp('\\$\\{' + t.total + '\\.length\\} '),
      'o número total de registros tem de continuar aparecendo');
  });
}

test('mostrar mais soma uma página, não recomeça', () => {
  for (const t of TELAS_COM_PAGINA) {
    const html = lerTela(t.arq);
    const i = html.indexOf("getElementById('" + t.botao + "')?.addEventListener");
    assert.ok(i > 0, t.arq + ': o botão não está ligado a nada');
    const linha = html.slice(i, html.indexOf('\n', i));
    assert.match(linha, new RegExp(t.estado + ' \\+= ' + t.pagina + '\\(\\)'),
      t.arq + ': tem de SOMAR uma página; atribuir zeraria o que já estava à vista');
    assert.match(linha, /render\(\)/, t.arq + ': e redesenhar');
  }
});
