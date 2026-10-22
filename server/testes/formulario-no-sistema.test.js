// O formulário do Visto T passa a viver DENTRO do sistema. Com formulário de fora, as
// respostas ficavam na outra ferramenta: não entravam na ficha do processo e a
// documentação não conseguia usá-las ao montar o pacote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORMULARIOS, formularioPorId, camposDoFormulario } from '../src/formularios.js';

const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const tela = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

test('o formulário do Visto T foi importado inteiro', () => {
  const f = formularioPorId('visto-t');
  assert.ok(f, 'o formulário deveria existir');
  assert.equal(f.servico, 'Visto T');
  assert.ok(f.campos.length >= 60, `só ${f.campos.length} campos — o original tem 63`);
});

test('os tipos de campo que o formulário usa estão todos previstos', () => {
  const tipos = new Set(camposDoFormulario('visto-t').map(c => c.tipo));
  for (const t of tipos) {
    assert.ok(['titulo','texto','longo','data','escolha','endereco','assinatura'].includes(t),
      `tipo desconhecido: ${t}`);
  }
  assert.ok(tipos.has('data'), 'faltaram as datas');
  assert.ok(tipos.has('escolha'), 'faltaram as perguntas de sim/não');
});

test('cada campo tem id único — senão uma resposta sobrescreve a outra', () => {
  const ids = camposDoFormulario('visto-t').map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'há ids repetidos no formulário');
});

test('as seções de cônjuge e filhos vieram junto', () => {
  const rotulos = camposDoFormulario('visto-t').map(c => c.rotulo).join(' | ');
  for (const t of ['Cônjuge', 'Filho 1', 'Filho 2', 'Filho 3', 'Você tem filhos?']) {
    assert.ok(rotulos.includes(t), `faltou "${t}"`);
  }
});

test('salvar é incremental — ninguém responde 63 campos de uma vez', () => {
  assert.match(portal, /rotasPortalCliente\.post\('\/portal\/formulario\/:indice'/, 'falta a rota de salvar');
  assert.match(tela, /addEventListener\(evento, \(\)=> salvarCampo\(inp\)\)/,
    'cada campo deveria salvar ao sair dele');
  assert.match(portal, /doc\.formularioSalvoEm = new Date/, 'falta registrar o rascunho');
});

test('o servidor só aceita campo que existe no formulário', () => {
  // O corpo do pedido vem do navegador: sem esta checagem, daria para escrever
  // qualquer chave dentro do processo.
  assert.match(portal, /const campoValido = \(campos, id\) => campos\.some/, 'falta a validação');
  assert.match(portal, /if \(campoValido\(f\.campos, k\)\) doc\.respostas\[k\]/,
    'o servidor precisa filtrar as chaves recebidas');
});

test('enviar exige os obrigatórios e diz quais faltaram', () => {
  assert.match(portal, /const faltando = f\.campos\.filter\(c => c\.obrigatorio/, 'falta checar obrigatórios');
  assert.match(portal, /Faltou preencher: /, 'a mensagem precisa dizer o que faltou');
});

test('falha ao salvar avisa o cliente em vez de fingir que deu certo', () => {
  // Silêncio aqui é o pior caso: a pessoa segue digitando 60 campos achando que salvou.
  const i = tela.indexOf('async function salvarCampo');
  const trecho = tela.slice(i, i + 1400);
  assert.match(trecho, /NÃO salvou/, 'a falha de salvamento tem que aparecer na tela');
});

test('a equipe consegue ler as respostas', () => {
  assert.match(docs, /data-ver-respostas=/, 'falta o botão de ver as respostas');
  assert.match(docs, /em branco/, 'campo não respondido deveria aparecer como em branco, não sumir');
});

test('o item é ligado ao formulário em Configurações', () => {
  // Era uma caixinha de sim/não que só sabia ligar o 'visto-t', escrito na mão
  // na tela. Com o segundo formulário (FOIA) virou escolha, e a lista vem do
  // servidor: um formulário novo aparece aqui sem ninguém editar esta tela.
  assert.match(cfg, /<select data-doc-form="\$\{modelo\.id\}\|\$\{i\}"/, 'falta a escolha no checklist do serviço');
  assert.match(cfg, /ck\(id\)\.documentos\[Number\(idx\)\]\.formularioId = sel\.value/, 'falta gravar a ligação');
  assert.match(cfg, /formulariosDisponiveis = \(await LW\.api\('\/formularios'\)\)\.formularios \|\| \[\]/,
    'a lista tem que vir do servidor');
  assert.ok(!/'visto-t' : ''/.test(cfg), "o 'visto-t' escrito na mão precisa sair da tela");
});
