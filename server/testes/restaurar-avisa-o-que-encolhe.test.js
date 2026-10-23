// A tela do backup prometia: "Restaurar coloca de volta o que estiver no
// arquivo, sem apagar o que já existe." Para documentos, usuários e mensagens
// isso é verdade — o servidor usa ON CONFLICT DO NOTHING. Para os MÓDULOS não
// é: cada bloco do arquivo chama gravar() e SUBSTITUI o bloco inteiro.
//
// Na prática: restaurar um arquivo com 2 leads deixa o módulo de leads com 2
// leads. Os outros 1.757 somem. E a tela dizia que nada seria apagado,
// justamente no momento em que ela ia subir atualizações de Kommo, Bling e
// Trello por esse caminho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
const backup = readFileSync(new URL('../src/backup.js', import.meta.url), 'utf8');

test('o servidor realmente substitui o bloco — é isto que a tela tem de contar', () => {
  // Se um dia a restauração passar a juntar em vez de substituir, este teste
  // cai e o aviso da tela tem de mudar junto.
  assert.match(backup, /for \(const bl of b\.armazenamento \|\| \[\]\) \{\s*\n\s*await gravar\(bl\.chave, bl\.valor, null/,
    'o bloco do arquivo entra inteiro no lugar do que existe');
  assert.match(backup, /INSERT INTO arquivos[\s\S]{0,400}ON CONFLICT \(id\) DO NOTHING/,
    'documento, esse sim, é acrescentado');
});

test('a tela não promete mais o que não cumpre', () => {
  assert.ok(!cfg.includes('Restaurar coloca de volta o que estiver no arquivo, sem apagar o que já existe.'),
    'a frase antiga era falsa para os módulos');
  assert.match(cfg, /são <b>substituídos inteiros<\/b> pelo que vier no arquivo/,
    'precisa dizer o que acontece de verdade');
  assert.match(cfg, /um arquivo com 2 leads deixa o módulo com 2 leads/,
    'com um exemplo, porque "substituído" todo mundo lê como "atualizado"');
});

test('antes de enviar, conta registro por registro', () => {
  assert.match(cfg, /async function conferirRestauracao\(arquivos\)/, 'falta a conferência');
  const i = cfg.indexOf('async function conferirRestauracao(arquivos)');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /const dif = noArquivo - hoje;/, 'tem que comparar com o que existe hoje');
  assert.match(corpo, /if\(dif < 0\) perigos\.push/, 'encolhimento vira aviso destacado');
  assert.match(corpo, /\$\{Math\.abs\(dif\)\} registro\(s\) deixam de existir/,
    'o número precisa aparecer — "vai encolher" não diz nada');
  assert.match(cfg, /const resumo = await conferirRestauracao\(arquivos\);\s*\n\s*const ok = await LW\.confirmar\(`Restaurar \$\{quais\}\?`, resumo\);/,
    'a conferência tem que estar DENTRO da pergunta, não num aviso que some');
});

test('o módulo aparece com o nome que ela conhece', () => {
  // "legalway-funil-v1: 377 → 2" não diz nada a ninguém às onze da noite.
  const i = cfg.indexOf('const NOME_DO_BLOCO = {');
  const mapa = cfg.slice(i, cfg.indexOf('};', i));
  for (const [chave, nome] of [['legalway-funil-v1', 'Funil'], ['legalway-leads-v1', 'Entrada de Leads'],
                               ['legalway-financeiro-v1', 'Contas a receber'],
                               ['legalway-processos-documentacao-v1', 'Documentação']]) {
    assert.match(mapa, new RegExp(`'${chave}':'${nome}'`), `falta o nome de ${chave}`);
  }
});

test('arquivo ilegível ou de outro sistema avisa, não quebra', () => {
  const i = cfg.indexOf('async function conferirRestauracao(arquivos)');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.match(corpo, /não é um JSON que eu consiga ler/, 'JSON quebrado tem que avisar');
  assert.match(corpo, /não é um backup do sistema/, 'arquivo de outro lugar também');
  assert.match(corpo, /catch\(err\)\{ \/\* bloco novo, ou sem permissão de leitura \*\/ \}/,
    'bloco que ela não consegue ler não pode derrubar a conferência');
});

test('encolher continua possível — só deixa de ser por acidente', () => {
  // Às vezes encolher é o certo: uma limpeza de dados de teste, por exemplo.
  // O aviso informa; quem decide é ela.
  const i = cfg.indexOf('async function conferirRestauracao(arquivos)');
  const corpo = cfg.slice(i, cfg.indexOf('\n}\n', i));
  assert.ok(!/return false|cancelar|bloquear/i.test(corpo),
    'a conferência avisa, não impede');
});
