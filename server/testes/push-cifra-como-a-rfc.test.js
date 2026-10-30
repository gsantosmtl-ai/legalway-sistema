// O aviso no celular vai CIFRADO para o aparelho. Se a cifragem estiver errada
// por um byte, o navegador descarta a mensagem em silêncio: ninguém recebe e
// ninguém fica sabendo por quê.
//
// Por isso este teste não inventa um caso próprio — ele usa o EXEMPLO OFICIAL
// da RFC 8291 (§5), que traz a chave efêmera e o sal escolhidos e o resultado
// esperado byte a byte. Se bater, a implementação está conforme a norma.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://ninguem@localhost:1/vazio';
const { cifrar } = await import('../src/push.js');

// RFC 8291, seção 5 — "Push Message Encryption Example"
const RFC = {
  texto: 'When I grow up, I want to be a watermelon',
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  efemeroPrivado: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  sal: 'DGv6ra1nlYgDCS1FRnbzlw',
  esperado: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLoc'
    + 'InmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const b64url = (b) => Buffer.from(b).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('a cifragem bate byte a byte com o exemplo oficial da RFC 8291', () => {
  const saiu = cifrar(RFC.texto, RFC.p256dh, RFC.auth,
    { efemeroPrivado: RFC.efemeroPrivado, sal: RFC.sal });
  assert.equal(b64url(saiu), RFC.esperado,
    'o corpo cifrado saiu diferente do que a RFC manda — o navegador vai descartar a notificação');
});

test('o cabeçalho do corpo tem a forma que a RFC 8188 exige', () => {
  const saiu = cifrar('oi', RFC.p256dh, RFC.auth);
  assert.equal(saiu.subarray(0, 16).length, 16, 'o sal tem 16 bytes');
  assert.equal(saiu.readUInt32BE(16), 4096, 'o tamanho do bloco é 4096');
  assert.equal(saiu[20], 65, 'a chave pública tem 65 bytes e o tamanho vem declarado');
  assert.equal(saiu[21], 4, 'a chave pública é a não comprimida, que começa com 0x04');
  // sal(16) + tamanho(4) + tamanho da chave(1) + chave(65) + texto + marca(1) + etiqueta(16)
  assert.equal(saiu.length, 16 + 4 + 1 + 65 + Buffer.byteLength('oi') + 1 + 16);
});

test('cada envio usa sal e chave efêmera novos', () => {
  const a = cifrar('mesmo texto', RFC.p256dh, RFC.auth);
  const b = cifrar('mesmo texto', RFC.p256dh, RFC.auth);
  assert.notEqual(b64url(a), b64url(b),
    'dois envios idênticos saíram iguais — o sal ou a chave efêmera está sendo reaproveitado');
});

// O navegador busca /sw.js sozinho para conferir atualização, e nem sempre
// com a sessão em mão. Se essa rota exigir login, o service worker nunca
// registra e o aviso no celular simplesmente não existe — sem erro visível.
test('o service worker é servido sem exigir login', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = (await import('node:path')).default;
  const raiz = path.dirname(fileURLToPath(import.meta.url));
  const index = readFileSync(path.join(raiz, '../src/index.js'), 'utf8');
  const linha = index.split('\n').find((l) => l.includes('const PUBLICO'));
  assert.ok(linha, 'não achei a lista PUBLICO no index.js');
  assert.match(linha, /sw\\?\.js/, '/sw.js saiu da lista de rotas públicas');
  // e o arquivo tem que existir de verdade
  const sw = readFileSync(path.join(raiz, '../../docs/sw.js'), 'utf8');
  assert.match(sw, /addEventListener\('push'/, 'o service worker não escuta o evento push');
  assert.match(sw, /addEventListener\('notificationclick'/, 'tocar no aviso não abre nada');
});
