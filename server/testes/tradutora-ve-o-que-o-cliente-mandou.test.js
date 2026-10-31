// A tradutora abria o link e lia "⚠️ Original não está no sistema — peça
// direto pra Documentação" para todo documento que o CLIENTE tinha mandado
// pelo portal. E o ZIP vinha sem ele.
//
// Motivo: três formas conviveram nos dados para o mesmo campo —
//   equipe antiga  → item.arquivo = "/api/arquivos/<id>"   (texto)
//   portal antigo  → item.arquivo = { url, nome, ... }     (objeto)
//   os dois hoje   → item.arquivos = [ { url, nome, ... } ] (lista)
// A tela de Documentação já lia as três (arquivosDoItem). O portal do
// prestador lia só a primeira. E a primeira é a única que o cliente NÃO usa.
//
// A partir de segunda o caminho normal é o cliente anexar pelo portal, então
// era o caminho normal que estava quebrado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const prestador = readFileSync(new URL('../../docs/portal-prestador.html', import.meta.url), 'utf8');
const documentos = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

// Recorta a função contando chaves. Fatia de tamanho fixo já me traiu quatro
// vezes: basta um comentário crescer e o alvo sai da janela.
function recortar(fonte, assinatura) {
  const abre = fonte.indexOf(assinatura);
  assert.ok(abre > 0, `não achei ${assinatura}`);
  const inicio = fonte.indexOf('{', abre);
  let nivel = 0;
  for (let i = inicio; i < fonte.length; i++) {
    if (fonte[i] === '{') nivel++;
    else if (fonte[i] === '}') { nivel--; if (!nivel) return fonte.slice(abre, i + 1); }
  }
  throw new Error('não fechei as chaves');
}

function carregar() {
  const caixa = {
    window: { storage: { temArquivo: (s) => typeof s === 'string' && (s.startsWith('data:') || s.startsWith('/api/arquivos/')) } },
    Array, String,
  };
  vm.createContext(caixa);
  vm.runInContext(recortar(prestador, 'function anexosDoItem(d)'), caixa);
  return caixa.anexosDoItem;
}

const LINK = '/api/arquivos/' + 'a'.repeat(32);

test('a forma antiga da equipe (texto) continua valendo', () => {
  const r = carregar()({ nome: 'Passaporte', arquivo: LINK, nomeArquivo: 'passaporte.pdf' });
  assert.equal(r.length, 1);
  assert.equal(r[0].url, LINK);
  assert.equal(r[0].nome, 'passaporte.pdf');
});

test('a forma antiga do portal (objeto) passa a valer', () => {
  // É a forma do documento que a Carolina mandou em 19/10. Antes aparecia
  // como "não está no sistema".
  const r = carregar()({ nome: 'Formulário DS-160', arquivo: { url: LINK, nome: 'etiqueta.pdf', enviadoPor: 'cliente' } });
  assert.equal(r.length, 1);
  assert.equal(r[0].url, LINK);
  assert.equal(r[0].nome, 'etiqueta.pdf');
});

test('a forma de hoje (lista) passa a valer, com frente E verso', () => {
  const a = '/api/arquivos/' + '1'.repeat(32), b = '/api/arquivos/' + '2'.repeat(32);
  const r = carregar()({ nome: 'RG', arquivo: null, arquivos: [
    { url: a, nome: 'frente.jpg' }, { url: b, nome: 'verso.jpg' },
  ] });
  assert.equal(r.map(x => x.nome).join('|'), 'frente.jpg|verso.jpg');
});

test('item sem nada devolve lista vazia — e a tela diz que falta', () => {
  const f = carregar();
  assert.equal(f({ nome: 'Certidão' }).length, 0);
  assert.equal(f(null).length, 0);
  assert.equal(f({ nome: 'x', arquivos: [] }).length, 0);
});

test('url que não é arquivo de verdade não entra', () => {
  // Já houve `arquivo` com texto solto. Um href para "sim" não baixa nada.
  const f = carregar();
  assert.equal(f({ nome: 'x', arquivo: 'sim' }).length, 0);
  assert.equal(f({ nome: 'x', arquivos: [{ url: 'enviado por e-mail', nome: 'n' }] }).length, 0);
});

test('a lista da tela usa anexosDoItem, não item.arquivo', () => {
  const trecho = prestador.slice(prestador.indexOf('Documentos originais deste pacote'), prestador.indexOf('Tradução — anexe'));
  assert.match(trecho, /anexosDoItem\(item\)/);
  assert.doesNotMatch(trecho, /temArquivo\(item\.arquivo\)/,
    'voltar a ler só item.arquivo esconde da tradutora o que o cliente mandou');
});

test('o ZIP do prestador leva TODOS os anexos de cada documento', () => {
  const zip = recortar(prestador, "document.getElementById('btn-baixar-zip')");
  assert.match(zip, /anexosDoItem\(item\)/);
  assert.doesNotMatch(zip, /arquivoBase64\(item\.arquivo\)/);
  assert.match(zip, /for\(let k=0; k<anexos\.length; k\+\+\)/, 'um arquivo só deixaria o verso fora');
});

test('o pacote da tela de Documentação segue a mesma regra', () => {
  const zip = recortar(documentos, 'async function gerarPacoteZip(');
  assert.match(zip, /arquivosDoItem\(item\)/);
  assert.doesNotMatch(zip, /temArquivo\(item\.arquivo\)/);
  assert.doesNotMatch(zip, /item\.arquivo\.includes/,
    'item.arquivo pode ser objeto — .includes nele quebra a geração inteira');
});

// ---------------------------------------------------------------------------
// E o nome do arquivo vem do APARELHO DO CLIENTE.
//
// Ele é digitado fora do sistema, entra pelo portal e aparece em duas telas:
// a da equipe e a da tradutora — que monta a página com innerHTML e é pública,
// aberta por um link com token. Nome com aspas ou com tag quebraria o HTML ali.
//
// A rota de assinatura já limpava o nome do anexo dela; a do portal não.
// ---------------------------------------------------------------------------
const portalCliente = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');

test('o servidor limpa o nome do arquivo que o cliente manda', () => {
  assert.match(portalCliente, /const nomeArquivo = String\(limparTexto\(String\(req\.body\?\.nome \|\| 'documento'\)\)\)/);
  assert.match(portalCliente, /\.slice\(0, 120\) \|\| 'documento'/,
    'nome que vira vazio depois de limpo precisa de um padrão');
});

test('a tela da tradutora escapa o que vem do processo', () => {
  const trecho = prestador.slice(prestador.indexOf('Documentos originais deste pacote'),
                                 prestador.indexOf('Tradução — anexe'));
  assert.match(trecho, /\$\{escHtml\(d\)\}/, 'o nome do documento vai cru para o innerHTML');
  assert.match(trecho, /download="\$\{escHtml\(a\.nome\s*\|\|\s*d\)\}"/, 'o nome do arquivo vai cru para o atributo');
  assert.doesNotMatch(trecho, /download="\$\{a\.nome\s*\|\|\s*d\}"/);
});

test('a página continua escapando tudo que vem do link', () => {
  // Era o que já existia e não pode se perder.
  for (const campo of ['cliente', 'servico', 'prestador', 'documentos']) {
    assert.match(prestador, new RegExp(`escHtml\\(params\\.get\\('${campo}'\\)`),
      `${campo} do link precisa ser escapado`);
  }
});
