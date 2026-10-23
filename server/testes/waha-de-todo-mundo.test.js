// "Importante dentro do sistema ter o WAHA de todo mundo: Documentos,
// Financeiro, Comercial (primeira mensagem lead), Renato (follow up),
// Adriano (follow up)."
//
// Cinco números, não três. E os dois últimos não são setores: são pessoas. O
// follow-up de um lead tem que sair do número do vendedor que está na conversa
// — o cliente respondeu ao Renato; se a cobrança chega por um número do
// escritório, o fio se quebra e a resposta vira "quem é você?".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { sessaoDoSetor, sessaoDoVendedor, remetentes } = await import('../src/waha.js');

const avisos = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

const REGRAS = {
  setores: { lista: [
    { key: 'documentos', nome: 'Documentação', sessao: 'documentos', numero: '+14071110001' },
    { key: 'financeiro', nome: 'Financeiro', sessao: 'financeiro', numero: '+14071110002' },
    { key: 'comercial', nome: 'Comercial', sessao: 'comercial', numero: '+14071110003' },
  ]},
  agenda: { disponibilidade: [
    { vendedor: 'Renato', numero: '+14072220001', sessao: 'renato' },
    { vendedor: 'Renato', numero: '+14072220001', sessao: 'renato' },   // segunda faixa do mesmo
    { vendedor: 'Adriano', numero: '+14072220002', sessao: 'adriano' },
    { vendedor: 'Bruno', numero: '+14072220003', sessao: '' },          // sem número próprio
  ]},
};

test('os cinco remetentes aparecem, sem repetir', () => {
  const r = remetentes(REGRAS);
  assert.equal(JSON.stringify(r.map(x => x.sessao)),
    '["documentos","financeiro","comercial","renato","adriano"]');
  assert.equal(r.filter(x => x.tipo === 'setor').length, 3);
  assert.equal(r.filter(x => x.tipo === 'vendedor').length, 2);
  assert.equal(r.find(x => x.sessao === 'renato').nome, 'Renato');
  assert.ok(!r.some(x => x.nome === 'Bruno'), 'quem não tem sessão não é remetente');
});

test('acha a sessão do vendedor pelo nome, sem tropeçar em acento ou caixa', () => {
  assert.equal(sessaoDoVendedor(REGRAS, 'Renato'), 'renato');
  assert.equal(sessaoDoVendedor(REGRAS, 'renato'), 'renato');
  assert.equal(sessaoDoVendedor(REGRAS, '  ADRIANO '), 'adriano');
  assert.equal(sessaoDoVendedor(REGRAS, 'Bruno'), '', 'sem sessão própria devolve vazio, para cair no setor');
  assert.equal(sessaoDoVendedor(REGRAS, ''), '');
  assert.equal(sessaoDoVendedor(REGRAS, 'Ninguém'), '');
  assert.equal(sessaoDoVendedor({}, 'Renato'), '', 'sem regras não explode');
});

test('os setores continuam funcionando como antes', () => {
  assert.equal(sessaoDoSetor(REGRAS, 'documentos'), 'documentos');
  assert.equal(sessaoDoSetor(REGRAS, 'financeiro'), 'financeiro');
  assert.equal(sessaoDoSetor(REGRAS, 'inexistente'), '');
});

test('aviso de lead sai pelo número do vendedor; o resto, pelo setor', () => {
  assert.match(avisos, /const sessaoPara = \(c\) => \(gat\.sobre === 'lead'\s*\?\s*sessaoDoVendedor\(R, c && c\.alvo && c\.alvo\.vendedor\) : ''\) \|\| sessaoDoSetorDoAviso/,
    'a escolha é por candidato: cada lead tem o seu vendedor');
  assert.match(avisos, /const deQuem = sessaoPara\(c\);/);
  assert.match(avisos, /await enviarWaha\(deQuem, c\.telefone, texto\)/,
    'e é essa sessão que manda — não a do aviso');
  assert.match(avisos, /envia = podeWaha && \(!!sessao \|\| gat\.sobre === 'lead'\)/,
    'um aviso de lead não pode ser barrado só porque o setor comercial não tem número');
});

test('a tela pede a sessão de cada vendedor e mostra os dois tipos juntos', () => {
  assert.match(cfg, /\{k:'sessao', label:'Sessão no WhatsApp \(ex: renato\) — o follow-up de lead sai por este número'\}/);
  assert.match(cfg, /const equipe = \(\(regrasAtuais\.agenda \|\| \{\}\)\.disponibilidade\) \|\| \[\]/,
    'o painel de conectar precisa enxergar os vendedores');
  assert.match(cfg, /tipo: 'Vendedor'/);
  assert.match(cfg, /\$\{escR\(st\.tipo \|\| 'Setor'\)\}/, 'na tela dá para ver qual é setor e qual é pessoa');
  assert.match(cfg, /Agenda → Disponibilidade da equipe/,
    'quando não há nenhuma sessão, a tela diz onde preencher as duas coisas');
});
