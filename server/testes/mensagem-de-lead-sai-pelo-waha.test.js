// Decisão dela, 30/10/2026: "vamos enviar as mensagens pelo WAHA, somente a
// PRIMEIRA mensagem pela API, e se for enviado pelo WhatsApp".
//
// Não é preferência de canal — é o que faz a mensagem existir. A API da Meta
// só permite texto livre dentro de 24h da última mensagem DO CLIENTE. Em
// outubro, 353 dos 654 leads (54%) vieram de formulário do Facebook e do
// Instagram e nunca mandaram nada: para mais da metade, a apresentação
// simplesmente não saía. O WAHA é sessão de WhatsApp comum e não tem a trava.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const caixa = readFileSync(new URL('../src/caixa-entrada.js', import.meta.url), 'utf8');
const pc = readFileSync(new URL('../src/primeiro-contato.js', import.meta.url), 'utf8');
const whats = readFileSync(new URL('../src/whatsapp.js', import.meta.url), 'utf8');

function corpoDe(fonte, assinatura) {
  const i = fonte.indexOf(assinatura);
  assert.notEqual(i, -1, `não achei "${assinatura}"`);
  let nivel = 0;
  for (let k = fonte.indexOf('{', i); k < fonte.length; k++) {
    if (fonte[k] === '{') nivel++;
    else if (fonte[k] === '}' && --nivel === 0) return fonte.slice(i, k + 1);
  }
  throw new Error('chaves não fecharam');
}

test('quem entrou pelo WhatsApp é respondido pelo número oficial', () => {
  // Já existe conversa aberta lá. Responder de outro número faria o cliente
  // receber mensagem de um desconhecido.
  const r = corpoDe(caixa, "rotasCaixaEntrada.post('/assumir/:id'");
  assert.match(r, /veioPeloWhatsapp = dentroDaJanela\(lead\)/,
    'o divisor tem de ser a origem, não a ordem de tentativa');
  assert.match(r, /veioPeloWhatsapp && whatsappConfigurado\(\)[\s\S]{0,120}enviarTexto\(lead\.telefone/,
    'quem veio pelo WhatsApp não está indo pela API');
});

test('quem entrou pelo formulário sai pelo WAHA', () => {
  // A API da Meta só permite texto livre dentro de 24h de uma mensagem do
  // cliente. 353 dos 654 leads de outubro vieram de formulário: por ali,
  // nada sairia.
  const r = corpoDe(caixa, "rotasCaixaEntrada.post('/assumir/:id'");
  const api = r.indexOf('veioPeloWhatsapp && whatsappConfigurado()');
  const waha = r.indexOf('wahaConfigurado() && sessaoComercial');
  assert.ok(api > -1 && waha > -1);
  assert.ok(api < waha, 'a API é o primeiro ramo, e o WAHA atende o resto');
});

test('a apresentação sai pelo Comercial geral', () => {
  const r = corpoDe(caixa, "rotasCaixaEntrada.post('/assumir/:id'");
  assert.match(r, /sessaoDoSetor\(R, 'comercial'\)/);
});

test('o primeiro contato automático segue a mesma divisão por origem', () => {
  const f = corpoDe(pc, 'export async function primeiroContato');
  assert.match(f, /veioPeloWhatsapp = dentroDaJanela\(lead\)/);
  assert.match(f, /veioPeloWhatsapp && whatsappConfigurado\(\)/, 'WhatsApp -> API');
  assert.match(f, /wahaConfigurado\(\) && sessaoEnvio/, 'formulário -> WAHA');
});

test('no WAHA, a mensagem sai do número do próprio vendedor', () => {
  // A mensagem diz "{vendedor} vai te ligar". Sair de outro número quebra o fio.
  const f = corpoDe(pc, 'export async function primeiroContato');
  assert.match(f, /sessaoDoVendedor\(R, vend\) \|\| sessaoDoSetor\(R, 'comercial'\)/,
    'sem sessão do vendedor tem de cair no Comercial, não parar de enviar');
});

test('a API da Meta continua servindo o PRIMEIRO toque', () => {
  // A resposta automática a quem escreveu no número oficial é a única coisa
  // que ainda sai pela API — e ela precisa continuar saindo de lá, porque é a
  // resposta dentro da própria conversa que o cliente abriu.
  assert.match(whats, /enviarTexto\(para, texto\)/,
    'a resposta automática do número oficial sumiu');
});

test('nenhum dos dois caminhos fica sem explicação quando não envia', () => {
  const r = corpoDe(caixa, "rotasCaixaEntrada.post('/assumir/:id'");
  assert.match(r, /o WhatsApp oficial não está configurado neste servidor/);
  assert.match(r, /veio de formulário e o WAHA não está configurado/);
  assert.match(r, /veio de formulário e o setor Comercial está sem número/);
  assert.match(r, /motivo = 'o lead não tem telefone'/);
});
