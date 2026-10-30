// As duas mensagens que o cliente recebe no começo: as boas-vindas com a lista do que
// ele precisa mandar, e o acesso ao sistema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');

test('a lista de boas-vindas não cobra formulário do escritório', () => {
  // O cliente não tem o que mandar num I-914. Ver isso na lista faz ele achar que
  // está devendo documento e ligar para perguntar.
  // `pendentesDe` é uma arrow de uma linha; recorto até o ponto e vírgula.
  const i = fonte.indexOf('const pendentesDe =');
  const trecho = fonte.slice(i, fonte.indexOf(';', i) + 1);
  assert.match(trecho, /!d\.interno/, 'o formulário interno deveria ficar de fora da lista');
});

test('a regra de pendente roda e filtra mesmo', () => {
  const i = fonte.indexOf('const pendentesDe =');
  const fim = fonte.indexOf(';', fonte.indexOf('!d.interno', i)) + 1;
  const ctx = { PENDENTE: new Set(['Não solicitado', 'Solicitado', 'Incorreto']) };
  vm.createContext(ctx);
  new vm.Script(fonte.slice(i, fim) + `\nvar r = pendentesDe({checklist:[
    {nome:'Passaporte', status:'Não solicitado'},
    {nome:'FORM I-914', status:'Não solicitado', interno:true},
    {nome:'Certidão', status:'Solicitado'},
    {nome:'Foto', status:'Aprovado'},
    {nome:'RG', status:'Solicitado', arquivo:'x'}
  ]});`).runInContext(ctx);
  assert.deepEqual(Array.from(ctx.r).map(d => d.nome), ['Passaporte', 'Certidão'],
    'deveria listar só o que o cliente ainda precisa mandar');
});

// Recorta o bloco inteiro contando chaves.
//
// Antes isto era `fonte.slice(i, i + 1400)`. Uma janela de tamanho fixo quebra
// sozinha quando alguém acrescenta um comentário acima da linha procurada — foi
// o que aconteceu em 30/10/2026, três vezes no mesmo dia, em testes diferentes.
// O teste reprovava sem nada estar errado no código.
function blocoDoGatilho(nome) {
  const i = fonte.indexOf(nome);
  assert.notEqual(i, -1, `não achei ${nome}`);
  let nivel = 0;
  for (let k = fonte.indexOf('{', i); k < fonte.length; k++) {
    if (fonte[k] === '{') nivel++;
    else if (fonte[k] === '}' && --nivel === 0) return fonte.slice(i, k + 1);
  }
  throw new Error('as chaves não fecharam');
}

test('as boas-vindas levam a lista de documentos', () => {
  const trecho = blocoDoGatilho('boasVindasDocumentos:');
  assert.match(trecho, /\{documentos\}/, 'a mensagem precisa trazer a lista');
  assert.match(trecho, /documentos: listarDocumentos\(faltam, 0\)/, 'a lista sai do que está pendente');
});

test('a mensagem de acesso usa as palavras do escritório', () => {
  const trecho = blocoDoGatilho('acessoPortal:');
  assert.match(trecho, /preparamos o seu sistema/, 'falta a frase do escritório');
  assert.match(trecho, /anexa os seus documentos na nossa plataforma/, 'falta a instrução de anexar');
  // O login é o telefone quando o cliente tem, senão o e-mail — por isso {login}.
  for (const campo of ['Acesse: {link}', 'Login: {login}', 'Senha: {senha}']) {
    assert.ok(trecho.includes(campo), `faltou "${campo}"`);
  }
});

test('o aviso de trocar a senha continua na mensagem', () => {
  // Sem isso o cliente guarda a senha temporária achando que é definitiva.
  assert.match(blocoDoGatilho('acessoPortal:'), /criar uma senha nova/,
    'a mensagem precisa avisar que a senha é só para o primeiro acesso');
});
