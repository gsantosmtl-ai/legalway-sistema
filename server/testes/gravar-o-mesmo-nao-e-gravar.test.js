// Medido em produção em 31/10/2026, lendo a versão de cada bloco duas vezes
// com 140 s de intervalo:
//
//   legalway-contratos-v1               10657 → 10659  conteúdo mudou? NÃO   547 kB
//   legalway-processos-documentacao-v1   8942 →  8944  conteúdo mudou? NÃO  2457 kB
//   legalway-funil-v1                    8706 →  8708  conteúdo mudou? NÃO   891 kB
//   legalway-clientes-v1                 8263 →  8265  conteúdo mudou? NÃO   172 kB
//
// Quatro blocos, 4,07 MB, reescritos a cada volta da automação com o conteúdo
// IDÊNTICO: 205 MB por hora, 4,9 GB por dia. E o pior não era o desperdício:
// cada gravação sobe a versão, a versão vai por WebSocket para todas as abas
// abertas, e cada aba invalida o cache e baixa os blocos de novo. Com sete
// pessoas e duas abas cada, o sistema passava o dia se recarregando sozinho.
//
// Quem gravava era `numerarRegistros`. O comentário dele sempre disse "depois
// da primeira rodada isso aqui não escreve mais nada" — mas o `if (quantos)`
// guardava só a linha de log; a gravação vinha antes, toda volta.
//
// Duas correções, uma em cada camada:
//   1. `numerarRegistros` pergunta ANTES se falta alguém sem número;
//   2. `gravar` recusa gravação sem mudança, para qualquer chamador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bancoDeEnsaio } from './ajuda/banco-de-ensaio.js';

const armazenamento = readFileSync(new URL('../src/armazenamento.js', import.meta.url), 'utf8');

// --------------------------------------------------- camada 1: a automação
test('rodar a automação duas vezes não grava nada na segunda', async () => {
  const banco = bancoDeEnsaio({
    'legalway-contratos-v1': [{ id: 'c1', cliente: 'Ana', status: 'Assinado', codigo: 'CT-0001',
      servicos: [], criadoEm: '2026-10-01T12:00:00Z' }],
    'legalway-processos-documentacao-v1': [{ id: 'p1', clienteNome: 'Ana', contratoId: 'c1',
      status: 'Em acompanhamento', codigo: 'PC-0001', checklist: [], criadoEm: '2026-10-01T12:00:00Z' }],
    'legalway-funil-v1': [{ id: 'f1', nome: 'Ana', codigo: 'PR-0001', criadoEm: '2026-10-01T12:00:00Z' }],
    'legalway-clientes-v1': [{ id: 'cl1', nome: 'Ana', codigo: 'CL-0001', criadoEm: '2026-10-01T12:00:00Z' }],
  });
  await banco.rodar();
  const depoisDaPrimeira = { ...banco.versoes() };
  await banco.rodar();
  assert.deepEqual(banco.versoes(), depoisDaPrimeira,
    'nada mudou entre as duas voltas — nenhum bloco podia ganhar versão nova');
});

test('na segunda volta a numeração nem OFERECE o bloco ao gravar', async () => {
  // Esta é a outra metade. Com só a trava do `gravar`, os 4 MB continuavam
  // subindo do servidor para o banco a cada volta — só para o banco responder
  // "é igual". A conferência agora é feita antes de abrir a transação.
  const banco = bancoDeEnsaio({
    'legalway-contratos-v1': [{ id: 'c1', cliente: 'Ana', status: 'Assinado', codigo: 'CT-0001',
      servicos: [], criadoEm: '2026-10-01T12:00:00Z' }],
    'legalway-clientes-v1': [{ id: 'cl1', nome: 'Ana', codigo: 'CL-0001', criadoEm: '2026-10-01T12:00:00Z' }],
    'legalway-funil-v1': [{ id: 'f1', nome: 'Ana', codigo: 'PR-0001', criadoEm: '2026-10-01T12:00:00Z' }],
    'legalway-processos-documentacao-v1': [{ id: 'p1', clienteNome: 'Ana', contratoId: 'c1',
      status: 'Em acompanhamento', codigo: 'PC-0001', checklist: [], criadoEm: '2026-10-01T12:00:00Z' }],
  });
  await banco.rodar();
  const antes = { ...banco.tentativas() };
  await banco.rodar();
  const depois = banco.tentativas();
  for (const chave of ['legalway-contratos-v1', 'legalway-clientes-v1', 'legalway-funil-v1',
                       'legalway-processos-documentacao-v1']) {
    assert.equal(depois[chave] || 0, antes[chave] || 0,
      `${chave} foi oferecido ao gravar de novo sem precisar — é o bloco inteiro subindo à toa`);
  }
});

test('quem está sem número ainda ganha um', async () => {
  const banco = bancoDeEnsaio({
    'legalway-clientes-v1': [{ id: 'cl1', nome: 'Ana', criadoEm: '2026-10-01T12:00:00Z' }],
  });
  await banco.rodar();
  assert.equal(banco.bloco('legalway-clientes-v1')[0].codigo, 'CL-0001');
});

test('e na volta seguinte o bloco já numerado fica quieto', async () => {
  const banco = bancoDeEnsaio({
    'legalway-clientes-v1': [{ id: 'cl1', nome: 'Ana', criadoEm: '2026-10-01T12:00:00Z' }],
  });
  await banco.rodar();
  const v = banco.versoes()['legalway-clientes-v1'];
  await banco.rodar();
  assert.equal(banco.versoes()['legalway-clientes-v1'], v, 'numerou de novo o que já tinha número');
});

test('bloco vazio não abre transação', async () => {
  const banco = bancoDeEnsaio({ 'legalway-clientes-v1': [] });
  await banco.rodar();
  assert.equal(banco.versoes()['legalway-clientes-v1'], undefined);
});

// --------------------------------------------------- camada 2: o gravar
test('o gravar deixa o Postgres recusar gravação sem mudança', () => {
  // `WHERE armazenamento.valor <> EXCLUDED.valor` no DO UPDATE: comparação de
  // jsonb, feita pelo banco. Em JavaScript não daria — a ordem das chaves do
  // jsonb não casa com a do JSON.stringify e a comparação diria "mudou"
  // sempre. Conferido contra o Postgres de produção: chaves na mesma ordem ou
  // em ordem diferente contam como iguais; item trocado de lugar na lista,
  // como diferente.
  assert.match(armazenamento, /ON CONFLICT \(chave\) DO UPDATE SET[\s\S]*?WHERE armazenamento\.valor <> EXCLUDED\.valor/);
});

test('sem mudança: nada de histórico, nada de aviso às abas', () => {
  const i = armazenamento.indexOf('if (!r.rowCount)');
  assert.ok(i > 0, 'o atalho de "nada mudou" desapareceu');
  const fim = armazenamento.indexOf('}', armazenamento.indexOf('return', i));
  const trecho = armazenamento.slice(i, fim);
  assert.match(trecho, /COMMIT/);
  assert.doesNotMatch(trecho, /armazenamento_hist/, 'linha de histórico sem mudança gasta o teto de 30 versões');
  assert.doesNotMatch(trecho, /notificar\(/, 'avisar as abas é o que fazia cada uma baixar os blocos de novo');
  assert.doesNotMatch(trecho, /registrarDiferencas/, 'não há diferença para auditar');
});

test('sem mudança devolve a versão que ESTÁ no banco', () => {
  // A tela usa o que volta como base da próxima gravação. Devolver a versão
  // que não foi criada faria a próxima gravação ser recusada por base antiga.
  const i = armazenamento.indexOf('if (!r.rowCount)');
  const trecho = armazenamento.slice(i, i + 1400);
  assert.match(trecho, /SELECT versao FROM armazenamento WHERE chave = \$1/,
    'a versão boa é a que está no banco AGORA, não a que esta transação leu');
  assert.match(trecho, /semMudanca: true/);
});

test('chave nova gravada em paralelo não derruba a gravação', () => {
  // `SELECT ... FOR UPDATE` não tranca linha que ainda não existe. Duas
  // gravações simultâneas de uma chave NOVA com o mesmo conteúdo fazem a
  // segunda cair no ON CONFLICT com zero linhas — e ali `atual` é indefinido.
  // Ler `atual.versao` seria TypeError no meio de uma gravação.
  const i = armazenamento.indexOf('if (!r.rowCount)');
  const trecho = armazenamento.slice(i, i + 1400);
  assert.doesNotMatch(trecho, /versao: atual\.versao\b/,
    'atual pode ser indefinido neste ponto');
  assert.match(trecho, /atual \? atual\.versao : versao/);
});

test('o caminho normal continua gravando histórico, avisando e auditando', () => {
  const depois = armazenamento.slice(armazenamento.indexOf('if (!r.rowCount)'));
  assert.match(depois, /INSERT INTO armazenamento_hist/);
  assert.match(depois, /DELETE FROM armazenamento_hist WHERE chave = \$1 AND versao <= \$2/);
  assert.match(depois, /notificar\(\{ tipo: 'storage'/);
  assert.match(depois, /registrarDiferencas\(chave/);
});
