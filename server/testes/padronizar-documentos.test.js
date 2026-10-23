// "Padronizar documentos: organizar por ordem alfabética, caixa alta, e unir os
// que são a mesma coisa."
//
// São 156 nomes distintos nos 21 serviços, e muitos são o mesmo documento
// escrito de outro jeito: "Certidão de Casamento/Nascimento", "CERTIDÃO DE
// CASAMENTO/NASCIMENTO" e "CERTIDAO NASCIMENTO/CASAMENTO" são três grafias da
// mesma certidão. Enquanto forem nomes diferentes, cada uma precisa do próprio
// modelo e da própria orientação — foi por isso que o modelo anexado uma vez
// não alcançava todos os serviços.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

function fns() {
  const i = cfg.indexOf('const semAcentoDoc =');
  const fim = cfg.indexOf('\n}', cfg.indexOf('function melhorGrafia')) + 2;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cfg.slice(i, fim) + '\nglobalThis.f = { chaveExata, chavePalavras, melhorGrafia };', ctx);
  return ctx.f;
}

test('o mesmo texto com outra caixa ou acento é o mesmo documento', () => {
  const { chaveExata } = fns();
  const k = chaveExata('CERTIDÃO DE CASAMENTO/NASCIMENTO');
  assert.equal(chaveExata('Certidão de Casamento/Nascimento'), k);
  assert.equal(chaveExata('certidao de casamento/nascimento'), k);
  assert.equal(chaveExata('  CERTIDÃO   DE CASAMENTO/NASCIMENTO '), k, 'espaço sobrando não separa');
});

test('as mesmas palavras em outra ordem são propostas, não decididas', () => {
  const { chavePalavras, chaveExata } = fns();
  const a = 'CERTIDÃO DE CASAMENTO/NASCIMENTO';
  const b = 'CERTIDAO NASCIMENTO/CASAMENTO';
  assert.notEqual(chaveExata(a), chaveExata(b), 'pelo texto exato são diferentes');
  assert.notEqual(chavePalavras(a), chavePalavras(b), '"DE" sobra num e não no outro');
  // O caso que realmente une:
  assert.equal(chavePalavras('CASAMENTO/NASCIMENTO'), chavePalavras('NASCIMENTO / CASAMENTO'));
  assert.equal(chavePalavras('FORM I-765'), chavePalavras('form i 765'), 'separador não importa');
});

test('o nome final é caixa alta COM acento', () => {
  // "CERTIDAO" sem acento é o que está escrito errado nos dados; não pode virar
  // o padrão só por aparecer mais vezes.
  const { melhorGrafia } = fns();
  assert.equal(melhorGrafia([
    { nome: 'CERTIDAO NASCIMENTO', n: 9 },
    { nome: 'Certidão de nascimento', n: 2 },
  ]), 'CERTIDÃO DE NASCIMENTO', 'a grafia com acento ganha mesmo aparecendo menos');
  assert.equal(melhorGrafia([
    { nome: 'passaporte', n: 1 },
    { nome: 'PASSAPORTE', n: 7 },
  ]), 'PASSAPORTE', 'sem acento em jogo, vence a mais frequente');
});

test('quem já está padronizado não aparece na lista', () => {
  // Uma tela com 156 linhas das quais 140 não mudam nada é uma tela que ninguém
  // lê até o fim.
  const i = cfg.indexOf('const soCaixa =');
  const trecho = cfg.slice(i, i + 220);
  assert.match(trecho, /todas\.length === 1 && todas\[0\]\.nome === final/);
  assert.match(trecho, /if\(soCaixa\) continue;/);
});

test('o que precisa de conferência vem primeiro e marcado', () => {
  assert.match(cfg, /grupos\.sort\(\(a,b\)=> \(b\.confira - a\.confira\) \|\| a\.final\.localeCompare\(b\.final,'pt'\)\)/,
    'o duvidoso não pode ficar no fim de uma lista longa');
  assert.match(cfg, /⚠️ unidos pelas palavras — confira: /, 'e tem que dizer por que está ali');
  assert.match(cfg, /\$\{g\.confira\?'border-color:var\(--red\);':''\}/, 'com a borda marcada');
});

test('ela pode corrigir o nome final', () => {
  assert.match(cfg, /data-pd-nome="\$\{i\}"/, 'o nome tem que ser editável');
  assert.match(cfg, /grupos\[Number\(inp\.getAttribute\('data-pd-nome'\)\)\]\.final = inp\.value\.toUpperCase\(\)/,
    'e o que ela digitar também sai em caixa alta');
});

test('renomeia nos serviços E nos processos', () => {
  const i = cfg.indexOf('const aplicar = async ()=>', cfg.indexOf('abrirPadronizarDocumentos'));
  const corpo = cfg.slice(i, cfg.indexOf('\n  };', i));
  assert.match(corpo, /checklists\.forEach\(c=>\{/, 'nos checklists dos serviços');
  assert.match(corpo, /processos\.forEach\(p=> \(p\.checklist\|\|\[\]\)\.forEach\(renomear\)\)/,
    'e nos processos dos clientes, senão os 264 ficam com os nomes velhos');
});

test('o checklist do serviço é reordenado; o do cliente não', () => {
  // O processo do cliente já foi trabalhado: tem anexo e status por item.
  // Reordenar no meio de um caso em andamento faria a equipe procurar tudo de
  // novo.
  const i = cfg.indexOf('const aplicar = async ()=>', cfg.indexOf('abrirPadronizarDocumentos'));
  const corpo = cfg.slice(i, cfg.indexOf('\n  };', i));
  assert.match(corpo, /if\(Array\.isArray\(c\.documentos\)\) c\.documentos\.sort\(porNome\)/);
  assert.match(corpo, /if\(Array\.isArray\(c\.documentosDependente\)\) c\.documentosDependente\.sort\(porNome\)/);
  assert.match(corpo, /No processo do cliente a ordem NÃO é mexida/, 'a razão tem que estar escrita');
  const depois = corpo.slice(corpo.indexOf('processos.forEach'));
  assert.ok(!/\.sort\(porNome\)/.test(depois), 'o processo do cliente não pode ser reordenado');
});

test('a ordem alfabética respeita o português', () => {
  const i = cfg.indexOf('const porNome =', cfg.indexOf('abrirPadronizarDocumentos'));
  assert.match(cfg.slice(i, i + 130), /localeCompare\(String\(b\.nome\|\|''\), 'pt'\)/,
    "sem 'pt', Á vem depois de Z");
});

test('o botão existe e está ligado', () => {
  assert.match(cfg, /id="ck-padronizar"[^>]*>📏 Padronizar os nomes<\/button>/);
  assert.match(cfg, /document\.getElementById\('ck-padronizar'\)\.addEventListener\('click', abrirPadronizarDocumentos\)/);
});
