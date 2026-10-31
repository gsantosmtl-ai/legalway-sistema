// O cabeçalho do sanitizar.js diz por que ele existe:
//
//   "As telas montam a interface com innerHTML sem escapar; como os dados
//    agora são compartilhados (e parte vem de fora, pelo portal), um
//    '<script>' num nome de lead rodaria no navegador de todo mundo."
//
// A limpeza estava na ROTA de gravação — `PUT /storage/:chave` passa por
// `limparValor`. Só que o lead que entra pelo webhook da Meta ou pelo WhatsApp
// não passa por rota nenhuma: cai em `registrarToque` e vai direto ao
// `gravar`. Qualquer pessoa na internet preenche um formulário do Facebook.
//
// Varri as telas: o nome do lead é escrito com `${l.nome}` sem escapar em
// entrada-leads, no funil, na fila do SDR e na tela inicial.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x';
const { limparValor, limparTexto } = await import('../src/sanitizar.js');

const leads = readFileSync(new URL('../src/leads-entrada.js', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../src/portal-cliente.js', import.meta.url), 'utf8');

test('registrarToque limpa tudo que chega, logo na primeira linha', () => {
  const i = leads.indexOf('export async function registrarToque(t) {');
  assert.ok(i > 0, 'registrarToque mudou de nome');
  const corpo = leads.slice(i, leads.indexOf('const achado =', i));
  assert.match(corpo, /t = limparValor\(t\);/);
  // antes de qualquer leitura do bloco: limpar depois de já ter mexido na
  // lista seria limpar o que não foi gravado.
  assert.ok(corpo.indexOf('t = limparValor(t)') < corpo.indexOf('await ler(CHAVE_LEADS)'),
    'a limpeza tem de vir antes de ler o bloco');
});

test('a limpeza alcança nome, telefone, e-mail, serviço e campanha', () => {
  // `limparValor` desce em objeto e lista — é por isso que limpar `t` inteiro
  // basta, e não é preciso lembrar de cada campo.
  const sujo = {
    nome: 'Maria <script>alert(1)</script>',
    email: 'a@b.com',
    telefone: '+1 407 555 0110" onmouseover="x',
    servico: '<img src=x onerror=alert(1)>',
    campanha: 'javascript:alert(1)',
    texto: 'Preencheu o formulário <b>agora</b>',
    campos: { whatsappUltimaEntrada: '<i>x</i>' },
  };
  const limpo = limparValor(sujo);
  assert.equal(limpo.nome.includes('<'), false, 'tag no nome');
  assert.equal(limpo.servico.includes('<'), false, 'tag no serviço');
  assert.equal(/javascript\s*:/i.test(limpo.campanha), false, 'javascript: na campanha');
  assert.equal(/\son\w+\s*=/i.test(limpo.telefone), false, 'manipulador de evento no telefone');
  assert.equal(limpo.texto.includes('<b>'), false, 'tag no histórico');
  assert.equal(limpo.campos.whatsappUltimaEntrada.includes('<i>'), false, 'a limpeza desce nos campos extras');
  assert.equal(limpo.email, 'a@b.com', 'o que é inofensivo não pode ser mexido');
});

test('link de arquivo do próprio sistema não é mexido', () => {
  // `limparTexto` deixa passar /api/arquivos/... de propósito: sem isso a
  // limpeza quebraria todo anexo que passasse por ela.
  const url = '/api/arquivos/' + 'a'.repeat(32);
  assert.equal(limparTexto(url), url);
});

test('a resposta do formulário do cliente também é limpa', () => {
  assert.match(portal, /doc\.respostas\[k\] = String\(limparTexto\(String\(v == null \? '' : v\)\)\)\.slice\(0, 2000\)/);
});

test('o nome do arquivo que o cliente anexa também é limpo', () => {
  assert.match(portal, /const nomeArquivo = String\(limparTexto\(/);
});

test('atualizarLead limpa também — é a outra porta do mesmo bloco', () => {
  // Quem chama é a caixa de entrada: o texto que a equipe responde no WhatsApp
  // e o nome que ela corrige. Os dois vão direto ao `gravar`.
  const i = leads.indexOf('export async function atualizarLead(');
  assert.ok(i > 0, 'atualizarLead mudou de nome');
  const corpo = leads.slice(i, leads.indexOf('const lead = lista.find', i));
  assert.match(corpo, /campos = limparValor\(campos\);/);
  assert.match(corpo, /textoHistorico = limparValor\(textoHistorico\);/);
  assert.ok(corpo.indexOf('limparValor(campos)') < corpo.indexOf('await ler(CHAVE_LEADS)'),
    'limpar depois de ler o bloco é limpar tarde');
});

test('a rota de gravação continua limpando — não troquei uma coisa pela outra', () => {
  const arm = readFileSync(new URL('../src/armazenamento.js', import.meta.url), 'utf8');
  assert.match(arm, /const valorNovo = limparValor\(paraJson\(req\.body\.valor\)\);/);
});
