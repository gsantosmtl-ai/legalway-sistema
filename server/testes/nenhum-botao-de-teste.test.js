// Nenhum botão de teste no sistema.
//
// Pedido dela, literal: "precisamos tirar do sistema todos os botões de teste,
// de criar cliente teste, de criar lead teste, de criar contrato teste, de
// criar documento teste e tudo que foi criado para teste só".
//
// A razão é concreta e já custou trabalho: esses botões criavam registro DE
// VERDADE no banco de produção — contrato assinado, cliente, parcelas, ficha.
// Foi de onde vieram os registros de teste que tivemos de caçar e remover da
// produção, e a remoção errou a ordem e deixou parcelas órfãs pelo caminho.
//
// Este arquivo substitui dois que protegiam o contrário: um garantia que os
// botões ficassem escondidos de quem não é sócio, outro cobria a tela de
// limpeza de dados de teste. Os dois deixaram de fazer sentido quando a coisa
// toda saiu — a proteção mais forte não é esconder, é não existir.
//
// Fica de fora, de propósito, o "💳 Cobrar" do Financeiro: ele escreve
// "(teste)" ao lado quando a chave da Stripe configurada no servidor é de
// teste. É aviso de que nenhum dinheiro real se move, não um botão de teste —
// trocada a chave, o rótulo some e ele cobra o cartão do cliente.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const telas = readdirSync(DOCS).filter((f) => f.endsWith('.html'));
const ler = (f) => readFileSync(join(DOCS, f), 'utf8');

test('os oito botões que criavam ou caçavam dado de teste não existem mais', () => {
  const ids = ['sim-evento', 'sim-contrato', 'sim-lead', 'btn-tarefa-teste',
    'btn-limpar-teste', 'btn-limpar-testes', 'btn-cliente-teste-completo'];
  const vivos = [];
  for (const f of telas) {
    const s = ler(f);
    for (const id of ids) if (s.includes(`id="${id}"`)) vivos.push(`${f}: ${id}`);
  }
  assert.deepEqual(vivos, [], 'esses botões criavam registro de verdade na produção');
});

test('nenhuma tela tem mais uma faixa rotulada "Testes:"', () => {
  const comFaixa = telas.filter((f) => /<span class="label">Testes:<\/span>/.test(ler(f)));
  assert.deepEqual(comFaixa, []);
});

test('as funções que inventavam dado foram embora junto', () => {
  // Botão removido com a função atrás é dívida: basta alguém religar um
  // listener e o problema volta inteiro.
  const sobras = [];
  for (const f of telas) {
    const s = ler(f);
    for (const fn of ['addSimLead', 'abrirLimpezaDeTestes']) {
      if (new RegExp(`function ${fn}\\s*\\(`).test(s)) sobras.push(`${f}: ${fn}()`);
    }
    if (/const nomesTeste\s*=/.test(s)) sobras.push(`${f}: nomesTeste`);
  }
  assert.deepEqual(sobras, []);
});

test('nenhum listener aponta para um botão de teste que já não existe', () => {
  // Um `getElementById(...).addEventListener` num id removido quebra o script
  // inteiro da tela na hora de carregar — e só aparece no ar.
  const quebrados = [];
  for (const f of telas) {
    const s = ler(f);
    for (const m of s.matchAll(/getElementById\('([^']+)'\)\s*\.addEventListener/g)) {
      const id = m[1];
      if (!/teste|sim-lead|sim-evento|sim-contrato/i.test(id)) continue;
      if (!s.includes(`id="${id}"`)) quebrados.push(`${f}: ${id}`);
    }
  }
  assert.deepEqual(quebrados, []);
});

test('a ferramenta do Kommo no SDR não foi junto', () => {
  // Ela morava dentro da faixa de testes, mas não é teste: confere a
  // importação real do Kommo.
  const sdr = ler('sdr.html');
  assert.match(sdr, /id="btn-corrigir-kommo"/, 'a conferência do Kommo é ferramenta de verdade');
  assert.match(sdr, /<span class="label">Ferramentas:<\/span>/,
    'a faixa continua, com o nome certo do que sobrou nela');
});

test('o "Cobrar" do Financeiro continua lá', () => {
  // O "(teste)" dele é o aviso de que a chave da Stripe é de teste. Apagar o
  // botão tiraria a cobrança no cartão do sistema inteiro.
  const fin = ler('financeiro.html');
  assert.match(fin, /data-cobrar-stripe/, 'é o botão que cobra o cartão do cliente');
  assert.match(fin, /Modo de teste — nenhum dinheiro real é movido/,
    'e ele precisa continuar avisando quando a chave é de teste');
});
