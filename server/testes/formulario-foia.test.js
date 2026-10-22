// "Formulário também FOIA, que o cliente tem que preencher igual o Visto T."
//
// As 14 perguntas que o escritório já fazia por mensagem, uma a uma, passam a
// morar no processo: a documentação lê as respostas na hora de montar o pedido
// em vez de caçar no WhatsApp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { FORMULARIOS, formularioPorId, camposDoFormulario } = await import('../src/formularios.js');

const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const foia = formularioPorId('foia');

test('o formulário do FOIA existe e tem as 14 perguntas dela', () => {
  assert.ok(foia, 'falta o formulário');
  const perguntas = foia.campos.filter(c => !['assinatura', 'titulo'].includes(c.tipo) && c.id !== 'declaro');
  assert.equal(perguntas.length, 15, 'as 14 perguntas mais o campo livre do final');
});

test('cada pergunta dela está lá, na ordem', () => {
  const rotulos = foia.campos.map(c => c.rotulo);
  const esperado = [
    /Já entrou nos Estados Unidos alguma vez\?/,
    /Quantas vezes entrou nos Estados Unidos\?/,
    /Data da primeira entrada/,
    /Data da última entrada/,
    /Cidade e estado da última entrada/,
    /Como entrou nos Estados Unidos\?/,
    /Já foi detido pela imigração \(ICE ou CBP\)\?/,
    /Já foi deportado, removido ou recebeu ordem de remoção\?/,
    /Já teve audiência na Corte de Imigração\?/,
    /Já solicitou asilo, visto, Green Card ou outro benefício imigratório\?/,
    /Receipt Number/,
    /outro nome ou outra data de nascimento/,
    /Já solicitou FOIA anteriormente\?/,
    /Quais registros deseja obter\?/,
  ];
  esperado.forEach((re, i) => assert.match(rotulos[i], re, `a pergunta ${i + 1} saiu do lugar`));
});

test('o campo livre do final existe, como ela pediu', () => {
  // "Inclua também um campo no final para o cliente explicar livremente
  // qualquer situação imigratória anterior que não tenha sido mencionada."
  const c = foia.campos.find(x => x.id === 'outras_situacoes');
  assert.ok(c, 'falta o campo livre');
  assert.equal(c.tipo, 'longo', 'tem que caber um texto, não uma linha');
  assert.match(c.rotulo, /não foi perguntada aqui/i);
  // E vem antes da declaração e da assinatura: depois de assinar ninguém escreve mais.
  const i = foia.campos.findIndex(x => x.id === 'outras_situacoes');
  assert.ok(i < foia.campos.findIndex(x => x.id === 'declaro'));
  assert.ok(i < foia.campos.findIndex(x => x.id === 'assinatura'));
});

test('as perguntas de "quando e onde" cabem uma explicação', () => {
  // "Já foi detido? Quando e onde" não se responde com sim ou não numa linha.
  for (const id of ['detido_pela_imigracao', 'deportado_ou_removido', 'audiencia_na_corte',
                    'beneficio_imigratorio', 'outro_nome_ou_nascimento', 'foia_anterior', 'registros_desejados']) {
    assert.equal(foia.campos.find(c => c.id === id).tipo, 'longo', `${id} precisa de espaço para explicar`);
  }
  assert.equal(foia.campos.find(c => c.id === 'data_primeira_entrada').tipo, 'data');
  assert.equal(foia.campos.find(c => c.id === 'data_ultima_entrada').tipo, 'data');
});

test('termina com declaração e assinatura, igual ao do Visto T', () => {
  const ultimo = foia.campos[foia.campos.length - 1];
  assert.equal(ultimo.tipo, 'assinatura');
  assert.equal(ultimo.obrigatorio, true, 'assinar é obrigatório');
  const decl = foia.campos.find(c => c.id === 'declaro');
  assert.deepEqual(decl.opcoes, ['VERDADEIRO', 'FALSO']);
});

test('todo campo tem id único e um tipo que a tela sabe desenhar', () => {
  const TIPOS = new Set(['titulo', 'texto', 'longo', 'data', 'escolha', 'endereco', 'assinatura']);
  for (const f of FORMULARIOS) {
    const ids = f.campos.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, `${f.id} tem id repetido — uma resposta sobrescreveria a outra`);
    for (const c of f.campos) {
      assert.ok(TIPOS.has(c.tipo), `${f.id}/${c.id}: tipo "${c.tipo}" não existe`);
      assert.ok((c.rotulo || '').trim(), `${f.id}/${c.id} está sem pergunta`);
      if (c.tipo === 'escolha') assert.ok(Array.isArray(c.opcoes) && c.opcoes.length, `${f.id}/${c.id} precisa de opções`);
    }
  }
});

test('o servidor sabe listar os formulários', () => {
  assert.match(index, /app\.get\('\/api\/formularios', exigirLogin/, 'falta a rota da lista');
  assert.match(index, /formularios: FORMULARIOS\.map\(f => \(\{ id: f\.id, nome: f\.nome/,
    'a lista precisa trazer id e nome');
  assert.equal(camposDoFormulario('foia').length, foia.campos.length);
  assert.equal(camposDoFormulario('nao-existe').length, 0, 'id desconhecido não pode quebrar');
});

test('cada formulário diz de qual serviço é', () => {
  // "Formulário do FOIA é somente no serviço do FOIA e não no Visto T."
  assert.equal(formularioPorId('foia').servico, 'FOIA');
  assert.equal(formularioPorId('visto-t').servico, 'Visto T');
  assert.match(index, /servico: f\.servico \|\| ''/, 'a lista precisa mandar o serviço para a tela');
});

test('a tela oferece primeiro o formulário do próprio serviço', () => {
  const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
  const i = cfg.indexOf('function opcoesDeFormulario(nomeDoServico, escolhido)');
  assert.ok(i > 0, 'falta a separação por serviço');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /const daCasa = formulariosDisponiveis\.filter\(f=> mesmo\(f\.servico, nomeDoServico\)\)/,
    'os do próprio serviço vêm primeiro');
  assert.match(corpo, /<optgroup label="De outros serviços">/,
    'os outros ficam separados, mas continuam possíveis');
  // O nome do serviço vem digitado por gente: "FOIA" e "foia " são o mesmo.
  assert.match(corpo, /String\(a\|\|''\)\.trim\(\)\.toLowerCase\(\) === String\(b\|\|''\)\.trim\(\)\.toLowerCase\(\)/,
    'a comparação não pode depender de maiúscula ou espaço');
  assert.match(cfg, /\$\{opcoesDeFormulario\(s\.nome, d\.formularioId\)\}/,
    'a escolha precisa receber o nome do serviço daquele checklist');
});
