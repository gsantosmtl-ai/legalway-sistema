// "Botão para o WAHA: documentos, clica e é enviado para o terceiro, e não pelo
// WhatsApp Web. Enviado direto, só mostrar como enviado."
//
// Antes, os dois botões abriam `wa.me` numa aba: a pessoa caía no WhatsApp Web,
// procurava a conversa, colava e mandava — e o sistema nunca ficava sabendo se
// chegou a ser enviado. Agora sai pelo número do setor de Documentação, pela
// rota que já existia, e fica registrado na ficha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const docs = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');
const rotas = readFileSync(new URL('../src/waha-rotas.js', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const i = docs.indexOf(assinatura);
  assert.notEqual(i, -1, 'não achei ' + assinatura);
  let n = 0;
  for (let k = docs.indexOf('{', i); k < docs.length; k++) {
    if (docs[k] === '{') n++;
    else if (docs[k] === '}') { n--; if (n === 0) return docs.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham');
}

test('os dois botões mandam pelo sistema, não abrem o WhatsApp Web', () => {
  assert.match(docs, /id="btn-whats-traducao-2"[^>]*>💬 Enviar pelo sistema</);
  assert.match(docs, /id="btn-whats-psico-2"[^>]*>💬 Enviar pelo sistema</);
  for (const id of ['btn-whats-traducao-2', 'btn-whats-psico-2']) {
    const i = docs.indexOf(`document.getElementById('${id}')?.addEventListener`);
    const trecho = docs.slice(i, i + 260);
    assert.match(trecho, /enviarAoPrestador\(ev\.currentTarget/, id + ' tem que enviar pelo sistema');
    assert.ok(!/window\.open/.test(trecho), id + ' não pode mais abrir aba nenhuma');
  }
});

test('o WhatsApp Web continua existindo, como saída de emergência', () => {
  // Enquanto o WAHA não estiver configurado no Railway, o envio pelo sistema
  // falha — e aí ela precisa de um caminho que funcione hoje.
  for (const id of ['btn-wa-web-traducao', 'btn-wa-web-psico']) {
    assert.ok(docs.includes(`id="${id}"`), 'falta ' + id);
    const i = docs.indexOf(`document.getElementById('${id}')?.addEventListener`);
    assert.match(docs.slice(i, i + 320), /window\.open\(`https:\/\/wa\.me\//);
  }
  assert.match(docs, /Abrir no WhatsApp Web \(se o envio pelo sistema falhar\)/,
    'o rótulo tem que dizer quando usar, senão vira dois botões iguais');
});

test('sai pelo número do setor de Documentação', () => {
  const corpo = corpoDe('async function enviarAoPrestador(botao, p, prestador, texto, oQue)');
  assert.match(corpo, /LW\.api\('\/waha\/enviar', \{method:'POST', body:\{setor:'documentacao'/);
  assert.match(rotas, /rotasWaha\.post\('\/waha\/enviar', exigirLogin/);
  assert.match(rotas, /documentacao: 'legalway-processos-documentacao-v1'/,
    'a rota confere a permissão pelo módulo do setor');
  assert.match(rotas, /INSERT INTO auditoria/, 'mensagem enviada em nome do escritório fica registrada');
});

// ------------------------------------------------------- rodando
function palco(apiFn) {
  const ctx = {
    now: () => new Date('2026-10-23T19:00:00Z'),
    sessao: { nome: 'Tatiane' }, console,
    renderDrawer: () => {}, avisos: [], gravou: null,
    toast: (m) => ctx.avisos.push(m),
    saveProcessos: async () => { ctx.gravou = true; return null; },
    LW: { api: apiFn },
  };
  vm.createContext(ctx);
  vm.runInContext(corpoDe('async function enviarAoPrestador(botao, p, prestador, texto, oQue)'), ctx);
  return ctx;
}
const BOTAO = () => ({ disabled: false, textContent: '💬 Enviar pelo sistema' });
const PROC = () => ({ id: 'p1', clienteNome: 'Maria', historico: [] });
const TRAD = { nome: 'Ana Tradutora', telefone: '+1 407 555 0110' };

test('enviou: marca como enviado e registra na ficha', async () => {
  let recebido = null;
  const ctx = palco(async (caminho, o) => { recebido = { caminho, ...o.body }; return { ok: true }; });
  const b = BOTAO(), p = PROC();
  const r = await ctx.enviarAoPrestador(b, p, TRAD, 'Olá Ana, segue o pacote', 'Pacote de tradução');

  assert.equal(r, true);
  assert.equal(recebido.caminho, '/waha/enviar');
  assert.equal(recebido.setor, 'documentacao');
  assert.equal(recebido.telefone, '+1 407 555 0110');
  assert.equal(recebido.texto, 'Olá Ana, segue o pacote');
  assert.equal(b.textContent, '✅ Enviado', '"só mostrar como enviado"');
  assert.equal(b.disabled, true, 'não dá para mandar duas vezes sem querer');
  assert.match(p.historico.at(-1).texto, /Pacote de tradução enviado para Ana Tradutora no WhatsApp/);
  assert.equal(p.historico.at(-1).quem, 'Tatiane');
  assert.equal(ctx.gravou, true);
});

test('falhou: o botão volta e ela sabe por quê', async () => {
  // É o caso de hoje: o WAHA ainda não está configurado no Railway.
  const ctx = palco(async () => { throw new Error('O WhatsApp dos setores não está configurado neste servidor.'); });
  const b = BOTAO(), p = PROC();
  const r = await ctx.enviarAoPrestador(b, p, TRAD, 'texto', 'Pacote de tradução');

  assert.equal(r, false);
  assert.equal(b.disabled, false, 'o botão tem que voltar a funcionar');
  assert.equal(b.textContent, '💬 Enviar pelo sistema');
  assert.equal(p.historico.length, 0, 'não pode registrar envio que não aconteceu');
  assert.match(ctx.avisos.join(' '), /não está configurado neste servidor/,
    'o motivo real, não um "erro" genérico');
});

test('prestador sem WhatsApp nem tenta', async () => {
  const ctx = palco(async () => { throw new Error('não deveria chamar'); });
  const b = BOTAO();
  assert.equal(await ctx.enviarAoPrestador(b, PROC(), { nome: 'Sem Zap' }, 'x', 'y'), false);
  assert.match(ctx.avisos.join(' '), /não tem WhatsApp cadastrado/);
});

test('enviou mas não gravou: avisa as duas coisas', async () => {
  // A mensagem já saiu — dizer só "não consegui gravar" faria ela mandar de novo.
  const ctx = palco(async () => ({ ok: true }));
  ctx.saveProcessos = async () => 'sem conexão com o servidor';
  const b = BOTAO();
  await ctx.enviarAoPrestador(b, PROC(), TRAD, 'x', 'Pacote de tradução');
  assert.match(ctx.avisos.join(' '), /Enviado para Ana Tradutora, mas não consegui registrar/);
  assert.equal(b.textContent, '✅ Enviado');
});
