// O link do prestador é de FORA do escritório. A página lê o processo inteiro,
// mexe na tradução e grava o objeto todo de volta — e o servidor trocava o
// item por essa cópia.
//
// Entre a leitura e o clique em "Enviar tradução" alguém no escritório pode
// ter movido o cartão, aprovado um documento, anexado o I-797. Tudo isso
// voltava ao estado antigo, sem aviso, por causa de um gravar de fora.
//
// Agora o link só pode tocar no que a tarefa dele produz: tradução, avaliação
// psicológica e histórico. O resto do processo é intocável por esse caminho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../src/armazenamento.js', import.meta.url), 'utf8');

// Recorta o `transformar` do PUT público contando parênteses/chaves a partir
// do gravar(). Fatia de tamanho fixo já me traiu quatro vezes.
function transformador() {
  const abre = fonte.indexOf('const r = await gravar(chave, itens, null, quem, async (fatia, atual)');
  assert.ok(abre > 0, 'o PUT público mudou de forma — reveja este teste');
  const inicio = fonte.indexOf('{', fonte.indexOf('=>', abre));
  let nivel = 0;
  for (let i = inicio; i < fonte.length; i++) {
    if (fonte[i] === '{') nivel++;
    else if (fonte[i] === '}') { nivel--; if (!nivel) return fonte.slice(inicio, i + 1); }
  }
  throw new Error('não fechei as chaves');
}

async function aplicar(fatia, atual) {
  const caixa = {
    CHAVE_PROCESSOS: 'legalway-processos-documentacao-v1',
    chave: 'legalway-processos-documentacao-v1',
    quem: 'público:portal',
    extrairArquivos: async (v) => v,
    Array, String, undefined,
  };
  vm.createContext(caixa);
  const fn = vm.runInContext(`(async (fatia, atual) => ${transformador()})`, caixa);
  return fn(fatia, atual);
}

// O processo como o escritório o deixou, DEPOIS de o prestador abrir o link.
const noBanco = () => [{
  id: 'doc1', clienteNome: 'Cliente de Ensaio', status: 'Documentação completa',
  anexos: [{ nome: 'I-797.pdf', url: '/api/arquivos/' + 'a'.repeat(32) }],
  checklist: [{ nome: 'Passaporte', status: 'Aprovado' }],
  email: 'cleide@exemplo.com',
  traducao: { documentos: ['Passaporte'] },
  historico: [{ texto: 'criado' }],
}];

// O que a página do prestador manda: a cópia VELHA, de antes das mudanças.
const doPrestador = () => [{
  id: 'doc1', clienteNome: 'Cliente de Ensaio', status: 'Recebendo documentos',
  anexos: [],
  checklist: [{ nome: 'Passaporte', status: 'Solicitado' }],
  email: '',
  traducao: { documentos: ['Passaporte'], confirmadoPeloPrestador: true, arquivosRecebidos: [{ nome: 'trad.pdf' }] },
  historico: [{ texto: 'criado' }, { texto: 'Prestador enviou 1 arquivo traduzido' }],
}];

test('a tradução que o prestador enviou é gravada', async () => {
  const lista = await aplicar(doPrestador(), noBanco());
  assert.equal(lista[0].traducao.confirmadoPeloPrestador, true);
  assert.equal(lista[0].traducao.arquivosRecebidos[0].nome, 'trad.pdf');
});

test('o histórico cresce com a linha do prestador', async () => {
  const lista = await aplicar(doPrestador(), noBanco());
  assert.equal(lista[0].historico.length, 2);
});

test('o status que o escritório mudou NÃO volta atrás', async () => {
  const lista = await aplicar(doPrestador(), noBanco());
  assert.equal(lista[0].status, 'Documentação completa');
});

test('anexo que chegou depois não é apagado pelo link de fora', async () => {
  const lista = await aplicar(doPrestador(), noBanco());
  assert.equal(lista[0].anexos.length, 1);
  assert.equal(lista[0].anexos[0].nome, 'I-797.pdf');
});

test('documento aprovado não volta para "Solicitado"', async () => {
  const lista = await aplicar(doPrestador(), noBanco());
  assert.equal(lista[0].checklist[0].status, 'Aprovado');
});

test('o e-mail do cliente não é limpo por um link de prestador', async () => {
  const lista = await aplicar(doPrestador(), noBanco());
  assert.equal(lista[0].email, 'cleide@exemplo.com');
});

test('a avaliação psicológica também é um campo que o link pode escrever', async () => {
  const fatia = [{ id: 'doc1', avaliacaoPsicologica: { status: 'laudo_recebido' } }];
  const lista = await aplicar(fatia, noBanco());
  assert.equal(lista[0].avaliacaoPsicologica.status, 'laudo_recebido');
  assert.equal(lista[0].status, 'Documentação completa');
});

test('processo que não existe no bloco é acrescentado (não é merge)', async () => {
  // É o caminho da conta a pagar do prestador: item novo entra inteiro.
  const lista = await aplicar([{ id: 'novo', traducao: {} }], noBanco());
  assert.equal(lista.length, 2);
  assert.equal(lista[1].id, 'novo');
});
