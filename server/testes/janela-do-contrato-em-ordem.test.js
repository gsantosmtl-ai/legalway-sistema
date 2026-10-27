// A ordem da janela do contrato.
//
// A frase dela: "a tela do contrato pra mim é muito bagunçada, fora de ordem".
// O que havia, de cima para baixo:
//
//   · a tabela com as 16 PARCELAS vinha em terceiro, antes de qualquer dado do
//     cliente. Para ver o telefone ou o valor, rolava-se 16 linhas primeiro.
//   · o sinal vinha antes do valor total do contrato.
//   · o aviso "contrato assinado, dados travados" vinha DEPOIS dos campos
//     travados: a pessoa tentava digitar e só então descobria.
//   · três caixas diziam quase a mesma coisa em lugares diferentes.
//   · "Gerar Contrato PDF" ficava solto, fora da linha de ações.
//   · e a caixa rosa afirmava que processo e checklist "entram quando esses
//     módulos forem construídos" — eles existem e funcionam desde então.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TELA = join(dirname(fileURLToPath(import.meta.url)), '../../docs/contratos.html');
const html = readFileSync(TELA, 'utf8');
const onde = (id) => html.indexOf(`id="${id}"`);

test('o resumo responde antes de qualquer campo', () => {
  assert.ok(onde('dt-resumo') > onde('dt-stage-track'), 'o resumo vem logo depois das etapas');
  assert.ok(onde('dt-resumo') < onde('dt-telefone'), 'e antes do formulário');
});

test('as 16 parcelas não ocupam mais a primeira tela', () => {
  assert.ok(onde('dt-tabela-parcelas') > onde('dt-telefone'),
    'a tabela estava antes dos dados do cliente');
  assert.ok(onde('dt-tabela-parcelas') > onde('dt-pagamento'),
    'ela fica depois de quem a gera: valor, parcelas e forma de pagamento');
  assert.match(html, /<details class="dt-parcelas-bloco">/,
    'recolhida: quem precisa abre, quem não precisa não rola por ela');
});

test('o aviso de "travado" vem ANTES dos campos travados', () => {
  assert.ok(onde('dt-aviso-editar-assinado') < onde('dt-telefone'),
    'avisar depois do formulário é avisar tarde');
});

test('o valor do contrato vem antes do sinal', () => {
  assert.ok(onde('dt-valor') < onde('dt-sinal'),
    'primeiro quanto é o contrato, depois quanto se pediu para segurar');
});

test('nenhum botão fica solto fora da linha de ações', () => {
  const i = html.indexOf('id="dt-salvar"');
  const fim = html.indexOf('</div>\n  </div>\n</div>', i);
  assert.ok(onde('dt-gerar-pdf') > i && onde('dt-gerar-pdf') < fim + 400,
    '"Gerar Contrato PDF" ficava sozinho embaixo de tudo');
});

test('a caixa não diz mais que a Documentação não existe', () => {
  assert.ok(!/módulos forem construídos/.test(html),
    'processo e ficha já nascem sozinhos na assinatura — o texto dizia o contrário');
  assert.match(html, /ficha na Documentação/, 'o texto novo diz o que de fato acontece');
});

test('a janela continua com tudo que tinha', () => {
  for (const id of ['dt-nome', 'dt-stage-track', 'dt-auto', 'dt-telefone', 'dt-email',
    'dt-endereco', 'dt-cpf', 'dt-nacionalidade', 'dt-sinal', 'dt-sinal-status', 'dt-valor',
    'dt-entrada', 'dt-num-parcelas', 'dt-data-primeira', 'dt-recorrencia', 'dt-dias-custom',
    'dt-pagamento-entrada', 'dt-pagamento', 'dt-obs', 'dt-anexos', 'dt-anexo-novo',
    'dt-historico', 'dt-acao-principal', 'dt-mais', 'dt-pausar', 'dt-reativar', 'dt-cancelar',
    'dt-salvar', 'dt-fechar', 'dt-voltar', 'dt-avancar', 'dt-gerar-pdf', 'dt-tabela-parcelas']) {
    const n = (html.match(new RegExp(`id="${id}"`, 'g')) || []).length;
    assert.equal(n, 1, `${id} deveria aparecer uma vez, apareceu ${n}`);
  }
});

test('o resumo formata a data com helper próprio, não com um de outra tela', () => {
  // O erro que isto evita eu cometi escrevendo este resumo: usei `fmtData`,
  // que existe em OUTRAS telas e não nesta. A janela inteira quebraria ao
  // abrir, e só apareceria no ar.
  const i = html.indexOf("document.getElementById('dt-resumo')");
  assert.ok(i > 0, 'não achei o trecho que preenche o resumo');
  const bloco = html.slice(html.lastIndexOf('(function(){', i), i + 300);

  assert.match(bloco, /const dia = \(d\) =>/,
    'o resumo precisa do seu próprio formatador de data');

  for (const emprestada of ['fmtData', 'fmtDataBR', 'fmtDataUscis', 'formatarData', 'fmtVenc']) {
    assert.ok(!new RegExp(`(?<![.\\w$])${emprestada}\\s*\\(`).test(bloco),
      `${emprestada}() não existe em contratos.html — chamar quebra a janela ao abrir`);
  }
  // E o que ele usa de fora tem mesmo que existir aqui.
  assert.match(html, /function fmtMoney\(/, 'o resumo usa fmtMoney');
});
