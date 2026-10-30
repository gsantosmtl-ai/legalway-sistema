// Aviso no celular (Web Push), sem biblioteca nenhuma.
//
// Por que à mão: o servidor inteiro roda com pouquíssima dependência, e as que
// existem são grandes e conhecidas. Trocar uma biblioteca nova de criptografia
// por ~120 linhas de node:crypto evita mais um pacote no build do Railway —
// e o formato é fechado, está nas RFC 8188 (aes128gcm) e 8291 (Web Push).
//
// O caminho da mensagem:
//   1. o celular assina e dá um endereço (endpoint) + duas chaves dele
//   2. aqui a gente cifra o texto PARA aquele aparelho
//   3. manda para o endereço, assinando com VAPID para o navegador saber
//      que o remetente é este servidor
//
// Nada aqui depende de WhatsApp, Meta ou e-mail. Funciona sozinho.
import { createECDH, createHmac, createCipheriv, randomBytes,
  generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { query } from './db.js';

const b64url = (b) => Buffer.from(b).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (chave, msg) => createHmac('sha256', chave).update(msg).digest();

// ---------------------------------------------------------------- as chaves
// Nascem no primeiro uso e ficam no banco. Trocar a chave desassina TODO
// mundo, então ela nunca é regerada sozinha.
let cache = null;

export async function chaves() {
  if (cache) return cache;
  const achou = await query('SELECT publica, privada FROM push_chaves WHERE id = 1');
  if (achou.rows[0]) { cache = achou.rows[0]; return cache; }

  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  // chave pública "não comprimida": 0x04 seguido de X e Y, 65 bytes
  const publica = b64url(Buffer.concat([Buffer.from([4]), deB64url(jwk.x), deB64url(jwk.y)]));
  const privada = privateKey.export({ format: 'pem', type: 'pkcs8' });
  // ON CONFLICT: se duas cópias do servidor subirem juntas, a primeira ganha e
  // a segunda usa a dela — sem isso, metade dos aparelhos ficaria órfã.
  await query('INSERT INTO push_chaves (id, publica, privada) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING',
    [publica, privada]);
  const agora = await query('SELECT publica, privada FROM push_chaves WHERE id = 1');
  cache = agora.rows[0];
  return cache;
}

/** A chave pública, que a tela entrega ao navegador na hora de assinar. */
export async function chavePublica() { return (await chaves()).publica; }

// ------------------------------------------------------------------- o VAPID
// Um JWT curto dizendo "sou eu", assinado com a chave privada. O navegador
// confere contra a chave pública que o aparelho guardou quando assinou.
function vapid(endpoint, privadaPem) {
  const { origin } = new URL(endpoint);
  const cabecalho = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const corpo = b64url(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:contato@legalway.group',
  }));
  const entrada = `${cabecalho}.${corpo}`;
  // ieee-p1363 = r||s cru, que é o que o JWT ES256 espera (não o DER)
  const assinatura = sign('sha256', Buffer.from(entrada),
    { key: createPrivateKey(privadaPem), dsaEncoding: 'ieee-p1363' });
  return `${entrada}.${b64url(assinatura)}`;
}

// ---------------------------------------------------------------- a cifragem
// RFC 8291. O texto é cifrado PARA o aparelho: ninguém no caminho lê, nem o
// servidor de push do Google ou da Apple.
// `fixo` existe só para o teste poder reproduzir o exemplo oficial da RFC 8291,
// que traz chave efêmera e sal escolhidos. Em produção nunca é passado — e aí
// os dois nascem aleatórios, como têm de nascer.
export function cifrar(texto, p256dhB64, authB64, fixo) {
  const aparelho = deB64url(p256dhB64);     // 65 bytes
  const segredo = deB64url(authB64);        // 16 bytes

  const efemero = createECDH('prime256v1');
  if (fixo && fixo.efemeroPrivado) efemero.setPrivateKey(deB64url(fixo.efemeroPrivado));
  else efemero.generateKeys();
  const minhaPublica = efemero.getPublicKey();            // 65 bytes
  const compartilhado = efemero.computeSecret(aparelho);  // 32 bytes

  const prkChave = hmac(segredo, compartilhado);
  const infoChave = Buffer.concat([
    Buffer.from('WebPush: info\0'), aparelho, minhaPublica,
  ]);
  const ikm = hmac(prkChave, Buffer.concat([infoChave, Buffer.from([1])]));

  const sal = (fixo && fixo.sal) ? deB64url(fixo.sal) : randomBytes(16);
  const prk = hmac(sal, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);

  // 0x02 marca que este é o último (e único) bloco
  const claro = Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.from([2])]);
  const cifra = createCipheriv('aes-128-gcm', cek, nonce);
  const cifrado = Buffer.concat([cifra.update(claro), cifra.final(), cifra.getAuthTag()]);

  const tamanhoBloco = Buffer.alloc(4);
  tamanhoBloco.writeUInt32BE(4096);
  return Buffer.concat([sal, tamanhoBloco, Buffer.from([minhaPublica.length]), minhaPublica, cifrado]);
}

// -------------------------------------------------------------------- envio
/**
 * Manda para UM aparelho. Nunca lança: push que falha não pode derrubar o
 * caminho do lead. Devolve o que aconteceu para quem quiser registrar.
 */
export async function enviarPara(assinatura, dados) {
  try {
    const { publica, privada } = await chaves();
    const corpo = cifrar(JSON.stringify(dados), assinatura.p256dh, assinatura.auth);
    const r = await fetch(assinatura.endpoint, {
      method: 'POST',
      headers: {
        TTL: '86400',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(corpo.length),
        Authorization: `vapid t=${vapid(assinatura.endpoint, privada)}, k=${publica}`,
      },
      body: corpo,
      signal: AbortSignal.timeout(10000),
    });
    // 404/410 = o aparelho desinstalou ou desligou o aviso. Some da lista, em
    // silêncio: continuar tentando enche o log e não avisa ninguém.
    if (r.status === 404 || r.status === 410) {
      await query('DELETE FROM push_assinaturas WHERE endpoint = $1', [assinatura.endpoint]).catch(() => {});
      return { ok: false, sumiu: true, status: r.status };
    }
    if (!r.ok) {
      await query('UPDATE push_assinaturas SET falhas = falhas + 1 WHERE endpoint = $1', [assinatura.endpoint]).catch(() => {});
      return { ok: false, status: r.status, detalhe: (await r.text().catch(() => '')).slice(0, 200) };
    }
    await query('UPDATE push_assinaturas SET ultimo_ok = now(), falhas = 0 WHERE endpoint = $1', [assinatura.endpoint]).catch(() => {});
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, erro: String(e && e.message || e).slice(0, 200) };
  }
}

/** Todos os aparelhos de uma pessoa. */
export async function avisarPessoaNoCelular(usuarioId, dados) {
  const { rows } = await query('SELECT * FROM push_assinaturas WHERE usuario_id = $1', [usuarioId]);
  const r = await Promise.all(rows.map((a) => enviarPara(a, dados)));
  return { aparelhos: rows.length, entregues: r.filter((x) => x.ok).length };
}

/**
 * Quem ligou o aviso para ESTE departamento.
 *
 * `canais` vazio quer dizer "tudo" — é o que os aparelhos ligados antes de a
 * escolha existir já têm, e é o padrão mais seguro: errar para mais faz a
 * pessoa receber aviso demais; errar para menos faz o lead passar batido.
 */
export async function avisarCanalNoCelular(canal, dados) {
  const { rows } = await query(
    `SELECT a.* FROM push_assinaturas a
       JOIN usuarios u ON u.id = a.usuario_id
      WHERE u.ativo = true
        AND (a.canais IS NULL OR a.canais = '' OR ($1 = ANY (string_to_array(a.canais, ','))))`,
    [String(canal || '')]);
  const r = await Promise.all(rows.map((a) => enviarPara(a, dados)));
  return { aparelhos: rows.length, entregues: r.filter((x) => x.ok).length };
}

/** Todos os aparelhos ligados, sem olhar departamento. */
export async function avisarTodosNoCelular(dados) {
  const { rows } = await query(
    `SELECT a.* FROM push_assinaturas a
       JOIN usuarios u ON u.id = a.usuario_id
      WHERE u.ativo = true`);
  const r = await Promise.all(rows.map((a) => enviarPara(a, dados)));
  return { aparelhos: rows.length, entregues: r.filter((x) => x.ok).length };
}
