// Hoje há 47 contratos cancelados no sistema e NENHUM diz por quê. O histórico
// guardava só "Contrato cancelado" — sem razão, sem quem. Pausar, que é bem
// menos grave, já perguntava o motivo.
//
// Sem isso, o cartão "Contratos cancelados · US$ X que deixaram de entrar" é um
// número que ninguém sabe ler: não dá para saber se o escritório está perdendo
// gente por preço, por prazo, ou se é só cadastro refeito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ct = readFileSync(new URL('../../docs/contratos.html', import.meta.url), 'utf8');
const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');

// `dt-cancelar` aparece antes num `style.display` — mirar no handler.
function corpoDoCancelar() {
  const i = ct.indexOf("document.getElementById('dt-cancelar').addEventListener");
  assert.notEqual(i, -1, 'não achei o handler de cancelar');
  return ct.slice(i, ct.indexOf('\n});', i));
}

test('cancelar pergunta o motivo, de uma lista', () => {
  assert.match(ct, /const MOTIVOS_CANCELAMENTO = \['Cliente desistiu', 'Não conseguiu pagar', 'Foi para outro escritório',\s*\n\s*'Caso inviável', 'Refeito em outro contrato', 'Erro de cadastro', 'Outro'\]/,
    'lista fechada para o relatório prestar, com "Outro" para o que não cabe nela');
  const corpo = corpoDoCancelar();
  assert.match(corpo, /const motivo = await LW\.escolherComTexto\(/);
  assert.match(corpo, /if\(!motivo\) return;/, 'desistiu da pergunta, não cancela nada');
});

test('o motivo vem ANTES da senha', () => {
  // Ninguém digita senha para descobrir que ainda vai ter que escrever algo.
  const corpo = corpoDoCancelar();
  assert.ok(corpo.indexOf('escolherComTexto') < corpo.indexOf('confirmarComSenha'),
    'perguntar o motivo primeiro, pedir a senha depois');
  assert.match(corpo, /confirmarComSenha/, 'cancelar continua exigindo senha');
});

test('fica gravado o motivo, quem e quando', () => {
  const corpo = corpoDoCancelar();
  assert.match(corpo, /alvo\.canceladoMotivo = motivo;/);
  assert.match(corpo, /alvo\.canceladoPor = \(sessao && sessao\.nome\) \|\| '';/);
  assert.match(corpo, /alvo\.canceladoEm = now\(\)\.toISOString\(\);/);
  assert.match(corpo, /Contrato cancelado por \$\{\(sessao && sessao\.nome\) \|\| 'alguém'\} — \$\{motivo\}/,
    'e o histórico passa a dizer tudo isso numa linha');
});

test('a lista trocada entre as duas perguntas não cancela o contrato errado', () => {
  const corpo = corpoDoCancelar();
  assert.match(corpo, /const alvo = contratos\.find\(x=>x\.id===editingId\);/,
    'relê depois de perguntar: são duas esperas seguidas');
  assert.match(corpo, /A lista mudou enquanto você confirmava/);
});

test('"Outro" sem explicar não passa', () => {
  const i = comum.indexOf('window.LW.escolherComTexto');
  const corpo = comum.slice(i, comum.indexOf('\n  };', i));
  assert.match(corpo, /const ehOutro = \(\)=> \/\^outro\/i\.test\(marcado\(\)\)/);
  assert.match(corpo, /if\(!t\)\{ campo\.style\.borderColor = '#B4454B'; campo\.focus\(\); return; \}/,
    '"Outro" em branco é o mesmo vazio de antes');
  assert.match(corpo, /z-index:9000/, 'a pergunta tem que ficar acima da janela que a abriu');
  assert.match(corpo, /if\(e\.key === 'Escape'\) fechar\(null\)/);
});
