// "Mas eu enviei os modelos, e não é somente para o Visto T, outras também."
//
// O exemplo de carta pessoal é o mesmo em todo serviço que pede carta pessoal.
// Anexar um por serviço seria trabalho repetido; anexar dentro de cada processo
// multiplicaria o mesmo PDF 264 vezes no banco e em todo backup que ela baixa.
// O arquivo passa a morar UMA vez, com o nome do documento, e o portal o
// encontra por esse nome — em qualquer serviço, inclusive nos processos que já
// existem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
const permissoes = readFileSync(new URL('../src/permissoes.js', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../../docs/assets/storage.js', import.meta.url), 'utf8');

// O casamento é por nome, e nome de documento vem digitado por gente: maiúscula,
// acento e espaço sobrando não podem separar "CARTA PESSOAL" de "Carta Pessoal".
function chave(fonte, nomeDaConst) {
  const i = fonte.indexOf(`const ${nomeDaConst} =`);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fonte.slice(i, fonte.indexOf('\n', i)) + `\nglobalThis.f = ${nomeDaConst};`, ctx);
  return ctx.f;
}

test('o nome casa apesar de acento, maiúscula e espaço', () => {
  for (const [fonte, nome] of [[portal, 'chaveDoNome'], [cfg, 'chaveDoNomeDoc']]) {
    const f = chave(fonte, nome);
    assert.equal(f('CARTA PESSOAL'), f('carta pessoal'), 'maiúscula não pode separar');
    assert.equal(f('  CARTA PESSOAL '), f('CARTA PESSOAL'), 'espaço sobrando não pode separar');
    assert.equal(f('Certidão'), f('CERTIDAO'), 'acento não pode separar');
    assert.equal(f(null), '', 'nome vazio não pode quebrar');
  }
  // E os dois lados têm que concordar, senão ela anexa e o cliente não vê.
  assert.equal(chave(portal, 'chaveDoNome')('Certidão de Nascimento'),
               chave(cfg, 'chaveDoNomeDoc')('CERTIDAO DE NASCIMENTO'),
               'a tela e o servidor precisam normalizar igual');
});

test('o modelo do próprio processo tem prioridade sobre a biblioteca', () => {
  // Se alguém anexou algo específico naquele cliente, é esse que vale.
  const i = portal.indexOf('modelo: d.modelo && d.modelo.url');
  const trecho = portal.slice(i, i + 300);
  assert.match(trecho, /\? \{ nome: d\.modelo\.nome \|\| 'modelo', url: d\.modelo\.url \}/);
  assert.match(trecho, /: \(modelos && modelos\.get\(chaveDoNome\(d\.nome\)\)\) \|\| null/,
    'sem modelo próprio, tem que cair na biblioteca');
});

test('a biblioteca é lida ao montar a tela, não copiada para o processo', () => {
  assert.match(portal, /processo: visaoDoProcesso\(p, R, contas, await modelosPorNome\(\)\)/,
    'a visão do cliente precisa receber os modelos');
  const i = portal.indexOf('async function modelosPorNome()');
  const corpo = portal.slice(i, portal.indexOf('\n}', i));
  assert.match(corpo, /\.filter\(m => m && m\.nome && m\.arquivo && m\.arquivo\.url\)/,
    'registro sem arquivo não pode virar link quebrado no portal');
  assert.match(corpo, /catch \{ return new Map\(\); \}/,
    'biblioteca ilegível não pode derrubar o portal inteiro');
});

test('o bloco tem permissão e entra no backup', () => {
  assert.match(permissoes, /'legalway-modelos-documentos-v1':\s*\{ modulos: \['documentos', 'usuarios'\], leituraLivre: true \}/,
    'quem monta checklist monta modelo');
  assert.ok(storage.includes('"legalway-modelos-documentos-v1"'),
    'o bloco precisa ser conhecido pelas telas');
});

test('ela anexa uma vez e vê em quantos serviços aquilo vale', () => {
  assert.match(cfg, /<div class="tab2" data-tab="modelos-doc">📎 Modelos para o cliente<\/div>/, 'falta a aba');
  assert.match(cfg, /aparece em \$\{servicos\.length\} serviço\(s\)/,
    'ela precisa ver que o modelo serve para mais de um visto');
  // O nome é escolhido de uma lista, não digitado: um acento errado e o modelo
  // não apareceria para ninguém, sem nenhum erro na tela.
  assert.match(cfg, /<option value="">Para qual documento…<\/option>/, 'o nome tem que ser escolhido');
  assert.match(cfg, /function nomesDeDocumentos\(\)/, 'a lista sai dos checklists que existem');
});

test('anexar de novo troca o modelo, não cria um segundo', () => {
  const i = cfg.indexOf('async function anexarModeloDoc(e)');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /const i = modelosDoc\.findIndex\(m=> chaveDoNomeDoc\(m\.nome\) === chaveDoNomeDoc\(nome\)\)/,
    'tem que procurar antes de empurrar');
  assert.match(corpo, /if\(i >= 0\) modelosDoc\[i\] = registro; else modelosDoc\.push\(registro\)/,
    'dois modelos para o mesmo documento e ninguém sabe qual o cliente vê');
  assert.match(corpo, /if\(!nome\)\{ toast\('Escolha primeiro para qual documento é o modelo\.'\); return; \}/,
    'arquivo sem documento escolhido não pode ser gravado');
  assert.match(corpo, /modelosDoc = null; await carregarModelosDoc\(\)/,
    'o servidor troca o arquivo embutido por um link — precisa reler para pegar o link');
});
