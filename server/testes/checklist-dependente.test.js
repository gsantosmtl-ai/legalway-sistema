// O dependente entrega o mesmo conjunto de documentos que o titular: passaporte,
// certidão, foto. Antes a seção dele tinha UM item genérico — e aí os três documentos
// do filho iam anexados no mesmo lugar, cada um sobrescrevendo o anterior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');
const ini = fonte.indexOf('export function montarChecklist(modelo, dependentes)');
assert.ok(ini > 0, 'não achei montarChecklist');
let i = fonte.indexOf('{', ini), nivel = 0, fim = -1;
for(; i < fonte.length; i++){ if(fonte[i]==='{') nivel++; else if(fonte[i]==='}'){ nivel--; if(!nivel){ fim=i+1; break; } } }
const corpo = fonte.slice(ini, fim).replace('export function', 'function');

function montar(modelo, dependentes){
  const ctx = { DOCUMENTOS_DEPENDENTE_PADRAO: [{ nome: 'Documentos do dependente' }] };
  vm.createContext(ctx);
  new vm.Script(corpo + `\nvar r = montarChecklist(${JSON.stringify(modelo)}, ${JSON.stringify(dependentes)});`).runInContext(ctx);
  // Array.from traz para este lado: o array nasce no contexto isolado e o deepEqual
  // compara o protótipo, não só o conteúdo.
  return Array.from(ctx.r).map(d => ({ ...d }));
}

const MODELO = { documentos: [
  { nome: 'Passaporte' }, { nome: 'Certidão de nascimento' }, { nome: 'Foto 5x5' },
  { nome: 'FORM I-914', interno: true },
]};

test('o dependente recebe a mesma lista do titular', () => {
  const r = montar(MODELO, 1);
  const dep = r.filter(d => d.grupo === 'Dependente 1').map(d => d.nome);
  assert.deepEqual(dep, ['Passaporte', 'Certidão de nascimento', 'Foto 5x5'],
    'o dependente deveria ter os mesmos documentos do titular');
});

test('formulário do escritório não se repete por dependente', () => {
  // O I-914 do titular já cobre a família. Repetir um por filho enche o checklist
  // de pendência que não existe.
  const dep = montar(MODELO, 2).filter(d => d.grupo).map(d => d.nome);
  assert.ok(!dep.includes('FORM I-914'), 'o formulário interno foi repetido no dependente');
});

test('cada dependente ganha a própria seção', () => {
  // Sem seção separada, o passaporte do segundo filho sobrescreve o do primeiro.
  const r = montar(MODELO, 2);
  assert.equal(r.filter(d => d.grupo === 'Dependente 1').length, 3);
  assert.equal(r.filter(d => d.grupo === 'Dependente 2').length, 3);
  assert.equal(r.filter(d => !d.grupo).length, 4, 'o titular mantém a lista inteira, com o formulário');
});

test('a lista própria do serviço continua mandando', () => {
  const comLista = { ...MODELO, documentosDependente: [{ nome: 'Certidão do dependente' }] };
  const dep = montar(comLista, 1).filter(d => d.grupo).map(d => d.nome);
  assert.deepEqual(dep, ['Certidão do dependente'],
    'quando o serviço define a lista do dependente, ela tem prioridade');
});

test('sem dependente, nada muda', () => {
  assert.equal(montar(MODELO, 0).filter(d => d.grupo).length, 0);
});

test('serviço sem documento nenhum cai no padrão antigo', () => {
  const dep = montar({ documentos: [] }, 1).filter(d => d.grupo).map(d => d.nome);
  assert.deepEqual(dep, ['Documentos do dependente'], 'o padrão existe para não deixar a seção vazia');
});

test('a tela e o servidor montam igual', () => {
  // As duas listas têm de dar o mesmo resultado, senão o checklist muda sozinho
  // dependendo de quem criou o processo.
  const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
  assert.match(tela, /const semFormulario = doTitular\.filter\(d => !d\.interno\)/,
    'a tela deveria seguir a mesma regra do servidor');
});
