// Auditoria do portal do cliente — a única parte do sistema que gente de fora
// acessa. Aqui um defeito é mais grave: não é a equipe que erra, é um estranho
// que tenta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const srv = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');
const tela = readFileSync(new URL('../../docs/portal-cliente.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const arquivos = readFileSync(new URL('../src/arquivos.js', import.meta.url), 'utf8');

test('nenhuma rota do cliente aceita o processo por parâmetro', () => {
  // É a garantia de que um cliente não vê o processo de outro: o processo vem
  // SEMPRE da sessão dele, nunca de algo que ele mande no pedido.
  const rotas = [...srv.matchAll(/rotasPortalCliente\.(get|post)\('(\/portal\/[^']*)', exigirCliente/g)].map(m => m[2]);
  assert.ok(rotas.length >= 4, 'esperava as rotas do cliente logado');
  for (const linha of srv.split('\n')) {
    if (!/processos\.find\(/.test(linha)) continue;
    if (/req\.cliente\.processo_id/.test(linha)) continue;
    if (/req\.params|req\.body|req\.query/.test(linha))
      assert.fail('rota do cliente achando processo por parâmetro: ' + linha.trim());
  }
  assert.ok(srv.includes('processos.find(x => x.id === req.cliente.processo_id)'));
});

test('a sessão do cliente é guardada com hash, e expira', () => {
  assert.match(srv, /randomBytes\(32\)\.toString\('hex'\)/, 'token longo e aleatório');
  assert.match(srv, /INSERT INTO sessoes_portal \(token_hash/, 'o banco guarda o HASH, não o token');
  assert.match(srv, /expira_em > now\(\) AND c\.ativo = true/, 'sessão vencida e cliente desligado não entram');
  assert.match(srv, /httpOnly: true, sameSite: 'lax'/);
});

test('documento interno não pode ser alcançado pelo índice', () => {
  // O item interno não aparece no portal, mas o índice viaja no pedido —
  // bastaria mudar o número para anexar num formulário do escritório.
  const i = srv.indexOf("rotasPortalCliente.post('/portal/documento'");
  const corpo = srv.slice(i, i + 2600);
  assert.match(corpo, /const visto = await docDoCliente\(p, indice\)/);
  assert.match(corpo, /if \(!visto \|\| visto\.interno\) return res\.status\(400\)/);
  assert.match(corpo, /if \(doc\.status === 'Aprovado'\) return res\.status\(409\)/,
    'documento já aprovado não pode ser trocado por outro');
});

test('o limite de tamanho é o mesmo nos três lugares, e a mensagem é em português', () => {
  // O corpo aceita 45 MB; 40 MB de arquivo em base64 dão ~54 MB. O express
  // recusava antes de o código rodar, e o cliente recebia "request entity too
  // large" depois de esperar o envio inteiro.
  assert.match(index, /app\.use\('\/api\/portal\/documento', express\.json\(\{ limit: '45mb' \}\)\)/);
  assert.match(tela, /const MAX_MB = 30;/, 'a tela corta antes de ler o arquivo');
  assert.match(tela, /if\(arquivo\.size > MAX_MB \* 1024 \* 1024\)/);
  assert.match(tela, /Esse arquivo tem \$\{tam\} MB e o limite é \$\{MAX_MB\} MB/,
    'tem que dizer o tamanho do arquivo dele, não só "muito grande"');
  assert.match(tela, /tire de novo com qualidade menor; se for PDF, mande as páginas em partes/,
    'e o que fazer a respeito');
  assert.match(srv, /if \(dataUri\.length > 41 \* 1024 \* 1024\)/, 'o servidor corta antes de decodificar');
  assert.match(srv, /o limite é 30 MB/);
  // 30 MB de arquivo ≈ 40 MB de base64, que cabe nos 41 MB e nos 45 MB do corpo.
  assert.ok(30 * 1.34 < 41 && 41 < 45, 'os três números precisam continuar fazendo sentido juntos');
});

test('o servidor continua tendo o teto duro, independente da tela', () => {
  assert.match(arquivos, /const TAMANHO_MAX = 40 \* 1024 \* 1024/);
  assert.match(arquivos, /tipoDeArquivoPermitido\(tipo\)/, 'html, svg e js não entram nem por engano');
});

test('o envio pode ser desligado pelo escritório', () => {
  const i = srv.indexOf("rotasPortalCliente.post('/portal/documento'");
  assert.match(srv.slice(i, i + 400), /R\.portal\.ativo === false \|\| R\.portal\.permitirEnvio === false/);
});
