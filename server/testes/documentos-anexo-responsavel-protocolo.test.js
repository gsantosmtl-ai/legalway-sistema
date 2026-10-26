// Três coisas que ela pegou usando o módulo de Documentos:
//
//  · "aba Resumo - adicionar responsavel (nao da para colocar)"
//  · "protocolo - tem que estar aberto independente do checklist para os casos
//     antigos que ja foram protocolados"
//  · "quando coloca o anexo na caixinha do checklist nao esta transferindo e
//     salvando. tem que ir para o checklist e sair de anexo"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const tela = readFileSync(new URL('../../docs/documentos.html', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const ini = tela.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let i = tela.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < tela.length; i++) { if (tela[i] === '{') nivel++; else if (tela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  return tela.slice(ini, fim);
}

// ---------------------------------------------------------------------------
// Responsável: a lista não pode nascer vazia
//
// O cadastro próprio da Documentação está VAZIO na base real — zero pessoas —
// e o campo vinha só dele. Resultado: o select abria com um traço e mais nada,
// embora 37 fichas já tivessem responsável gravado, vindo da importação.
function nomes(ctx) {
  const c = Object.assign({ responsaveis: [], equipeDoEscritorio: [], processos: [] }, ctx);
  vm.createContext(c);
  new vm.Script(corpoDe('function nomesParaResponsavel(p)')
    + `\nvar r = JSON.stringify(nomesParaResponsavel(${JSON.stringify(c.alvo || null)}));`).runInContext(c);
  return JSON.parse(c.r);
}

test('com o cadastro vazio, a lista ainda traz a equipe', () => {
  const r = nomes({ responsaveis: [], equipeDoEscritorio: ['Elaine', 'Vitoria'] });
  assert.deepEqual(r, ['Elaine', 'Vitoria']);
});

test('os nomes já em uso nas fichas entram na lista', () => {
  // sem isto, trocar o responsável de uma ficha apagaria um nome que o
  // sistema não saberia oferecer de volta
  const r = nomes({ equipeDoEscritorio: ['Elaine'], processos: [{ responsavel: 'Peterson' }, { responsavel: 'Vitoria' }] });
  assert.deepEqual(r, ['Elaine', 'Peterson', 'Vitoria']);
});

test('o responsável da própria ficha nunca some da lista', () => {
  const r = nomes({ equipeDoEscritorio: ['Elaine'], alvo: { responsavel: 'Alguém que saiu' } });
  assert.ok(r.includes('Alguém que saiu'));
});

test('não repete quem aparece em mais de uma origem', () => {
  const r = nomes({ responsaveis: [{ nome: 'Elaine' }], equipeDoEscritorio: ['Elaine'],
    processos: [{ responsavel: 'Elaine' }] });
  assert.deepEqual(r, ['Elaine']);
});

test('nome vazio ou só espaço não vira opção', () => {
  const r = nomes({ responsaveis: [{ nome: '' }, { nome: null }], equipeDoEscritorio: ['', 'Elaine'] });
  assert.deepEqual(r, ['Elaine']);
});

test('o select usa a lista nova, não só o cadastro', () => {
  const i = tela.indexOf('<label>Responsável (Documentação)</label>');
  const bloco = tela.slice(i, i + 500);
  assert.match(bloco, /nomesParaResponsavel\(p\)/);
  assert.doesNotMatch(bloco, /responsaveis\.map/, 'ler só do cadastro era o defeito');
});

// ---------------------------------------------------------------------------
// Protocolo: sempre dá para registrar
test('a aba Protocolo não tem mais beco sem saída', () => {
  assert.doesNotMatch(tela, /Ainda não está pronto pra protocolar\. Complete o checklist primeiro/,
    'esse texto era a tela inteira, sem nenhum botão');
  assert.match(tela, /Registrar protocolo já feito/);
});

test('mesmo aguardando o financeiro, dá para registrar um protocolo antigo', () => {
  const i = tela.indexOf("const esperandoFinanceiro = p.status === 'Aguardando autorização financeira'");
  assert.ok(i > 0, 'não achei o ramo');
  const ramo = tela.slice(i, i + 1600);
  assert.match(ramo, /btn-abrir-protocolo/, 'o botão vale para os dois casos');
  assert.match(ramo, /aviso-box/, 'e o aviso do financeiro continua');
});

test('protocolo registrado fora do fluxo fica escrito no histórico', () => {
  // Até o fim do ramo `if(!editando)`, em vez de uma janela de N caracteres:
  // um comentário a mais no meio empurrava a linha procurada para fora da
  // janela e o teste caía sem que nada tivesse mudado de comportamento.
  const i = tela.indexOf('const statusAntes = p.status;');
  const trecho = tela.slice(i, tela.indexOf('else p.historico.push', i));
  assert.match(trecho, /foraDoFluxo = statusAntes !== 'Liberado para protocolo'/);
  assert.match(trecho, /registrado fora do fluxo normal/);
  assert.match(trecho, /a ficha estava em/, 'com o status de onde veio');
});

// ---------------------------------------------------------------------------
// Anexo → checklist: mexer no objeto VIVO
test('a transferência reencontra o processo, o anexo e o item na hora', () => {
  const i = tela.indexOf("body.querySelectorAll('[data-anexo-para]')");
  const corpo = tela.slice(i, tela.indexOf("body.querySelectorAll('[data-anexo-rm]')", i));
  assert.match(corpo, /const vivo = processos\.find\(x => x\.id === openId\)/,
    'mexer no `p` capturado é o defeito: loadAll troca o array inteiro');
  assert.match(corpo, /vivo\.anexos\.splice\(jA, 1\)/, 'o anexo sai da lista do objeto vivo');
  assert.doesNotMatch(corpo, /p\.anexos\.splice/, 'não pode mais mexer no órfão');
});

test('o anexo é reencontrado pelo arquivo, não pela posição', () => {
  const i = tela.indexOf("body.querySelectorAll('[data-anexo-para]')");
  const corpo = tela.slice(i, tela.indexOf("body.querySelectorAll('[data-anexo-rm]')", i));
  assert.match(corpo, /chaveDoAnexo = anexoAntes\.arquivoId \|\| anexoAntes\.url \|\| anexoAntes\.nome/);
  assert.match(corpo, /findIndex\(x => x && \(x\.arquivoId \|\| x\.url \|\| x\.nome\) === chaveDoAnexo\)/,
    'a posição muda quando outra pessoa mexe na ficha');
  assert.match(corpo, /\(vivo\.checklist \|\| \[\]\)\.find\(x => x && x\.nome === itemAntes\.nome\)/,
    'o item do checklist, pelo nome');
});

test('se alguém mexeu na ficha no meio, avisa em vez de estragar', () => {
  const i = tela.indexOf("body.querySelectorAll('[data-anexo-para]')");
  const corpo = tela.slice(i, tela.indexOf("body.querySelectorAll('[data-anexo-rm]')", i));
  assert.match(corpo, /if\(jA < 0 \|\| !d\)\{/);
  assert.match(corpo, /Alguém mexeu nesta ficha agora/);
});

test('não sobrescreve um documento que já tem arquivo', () => {
  const i = tela.indexOf("body.querySelectorAll('[data-anexo-para]')");
  const corpo = tela.slice(i, tela.indexOf("body.querySelectorAll('[data-anexo-rm]')", i));
  assert.match(corpo, /if\(temAnexo\(d\)\)\{/);
});

test('só diz que deu certo se a gravação deu certo', () => {
  const i = tela.indexOf("body.querySelectorAll('[data-anexo-para]')");
  const corpo = tela.slice(i, tela.indexOf("body.querySelectorAll('[data-anexo-rm]')", i));
  assert.match(corpo, /const erro = await saveProcessos\(\);/);
  assert.match(corpo, /if\(erro\)\{ await loadAll\(\); renderDrawer\(\); render\(\); return; \}/,
    'antes avisava "virou o documento" mesmo quando a gravação falhava');
});

test('a transferência fica no histórico da ficha', () => {
  const i = tela.indexOf("body.querySelectorAll('[data-anexo-para]')");
  const corpo = tela.slice(i, tela.indexOf("body.querySelectorAll('[data-anexo-rm]')", i));
  assert.match(corpo, /virou o documento .* do checklist/);
});

// ---------------------------------------------------------------------------
// "incluir no documentos a coluna I-797 e Biometria"
//
// São os dois marcos depois do protocolo — o aviso de recebimento do USCIS e a
// coleta de digitais. São as duas perguntas que o cliente faz, e não havia onde
// anotar a resposta: ficava no Trello ou na cabeça de quem atendeu.
function escrever(fn, p) {
  const ctx = { fmtData: (d) => String(d).split('-').reverse().join('/') };
  vm.createContext(ctx);
  new vm.Script(corpoDe('function ' + fn + '(p)') + `\nvar r = ${fn}(${JSON.stringify(p)});`).runInContext(ctx);
  return ctx.r;
}

test('as duas colunas existem na lista', () => {
  assert.match(tela, /\{titulo:'I-797', valor:p=>textoI797\(p\)/);
  assert.match(tela, /\{titulo:'Biometria', valor:p=>textoBiometria\(p\)/);
});

test('as colunas ordenam pela data, não pelo texto', () => {
  // ordenar por "✓ 12/03/2026" agruparia tudo que tem ✓ junto
  assert.match(tela, /ordenar:p=>\(p\.i797 && p\.i797\.recebido\) \|\| ''/);
  assert.match(tela, /ordenar:p=>\(p\.biometria && p\.biometria\.data\) \|\| ''/);
});

test('sem data, a coluna mostra traço e não quebra', () => {
  assert.equal(escrever('textoI797', {}), '—');
  assert.equal(escrever('textoI797', { i797: null }), '—');
  assert.equal(escrever('textoBiometria', {}), '—');
  assert.equal(escrever('textoBiometria', { biometria: { feita: true } }), '—', 'feita sem data não é data');
});

test('biometria marcada e biometria feita se leem diferente', () => {
  // na véspera a pergunta é "faltou alguém ir?"
  assert.equal(escrever('textoBiometria', { biometria: { data: '2026-03-12' } }), '12/03/2026 (marcada)');
  assert.equal(escrever('textoBiometria', { biometria: { data: '2026-03-12', feita: true } }), '✓ 12/03/2026');
});

test('o I-797 mostra a data em que chegou', () => {
  assert.equal(escrever('textoI797', { i797: { recebido: '2026-02-01' } }), '01/02/2026');
});

test('dá para preencher os dois na aba Protocolo', () => {
  // coluna que não dá para preencher não serve para nada
  assert.match(tela, /id="i797-data"/);
  assert.match(tela, /id="bio-data"/);
  assert.match(tela, /id="bio-feita"/);
  assert.match(tela, /id="btn-salvar-marcos"/);
});

test('o salvamento mexe no processo vivo e desfaz se falhar', () => {
  const corpo = corpoDe('async function salvarMarcos(id)');
  assert.match(corpo, /const p = processos\.find\(x => x\.id === id\)/, 'resolve por id na hora');
  assert.match(corpo, /const erro = await saveProcessos\(\)/);
  assert.match(corpo, /p\.i797 = antes\.i797; p\.biometria = antes\.biometria;/, 'desfaz na tela se não gravou');
  assert.match(corpo, /p\.historico\.length = antes\.historico/, 'inclusive o histórico');
});

test('mudança nos marcos fica no histórico, e só quando muda algo', () => {
  const corpo = corpoDe('async function salvarMarcos(id)');
  assert.match(corpo, /if\(!mudou\.length\)\{ toast\('Nada mudou\.'\); return; \}/);
  assert.match(corpo, /p\.historico\.push/);
});

test('apagar a data apaga o marco, em vez de deixar um registro oco', () => {
  const corpo = corpoDe('async function salvarMarcos(id)');
  assert.match(corpo, /p\.i797 = i797 \? \{ \.\.\.\(p\.i797 \|\| \{\}\), recebido: i797 \} : null/);
  assert.match(corpo, /p\.biometria = bioData \? \{[^}]*\} : null/);
});

// ---------------------------------------------------------------------------
// As colunas do QUADRO: protocolado · I-797 · biometria · acompanhamento
test('preencher a data move a ficha para a coluna do marco', () => {
  const corpo = corpoDe('async function salvarMarcos(id)');
  assert.match(corpo, /const andarPara = \(etapa\) =>/);
  assert.match(corpo, /if\(bioData\) andarPara\('Biometria'\);/);
  // O recibo também move: ele vem impresso na carta I-797C, então quem digitou
  // o número tem a carta na mão mesmo sem ter preenchido a data.
  assert.match(corpo, /else if\(i797 \|\| recibo\) andarPara\('I-797'\);/,
    'biometria ganha do I-797: é a etapa mais adiantada das duas');
});

test('a ficha nunca anda para trás', () => {
  // corrigir uma data antiga não pode puxar de volta quem já está adiante
  const corpo = corpoDe('async function salvarMarcos(id)');
  assert.match(corpo, /if\(destino < 0 \|\| atual < 0 \|\| atual >= destino\) return;/);
});

test('lista personalizada pelo escritório não é mexida', () => {
  // indexOf devolve -1 e nada se move
  const corpo = corpoDe('async function salvarMarcos(id)');
  assert.match(corpo, /const destino = ETAPAS\.indexOf\(etapa\)/);
  assert.match(corpo, /const atual = ETAPAS\.indexOf\(p\.status\)/);
});

test('as duas etapas têm cor própria no quadro', () => {
  const corpo = corpoDe('function statusInfo(status)');
  assert.match(corpo, /'I-797': \{cls:'blue'\}/);
  assert.match(corpo, /'Biometria': \{cls:'amber'\}/);
});

test('a ordem da tela bate com a ordem das regras', () => {
  const i = tela.indexOf('let ETAPAS = [');
  const bloco = tela.slice(i, tela.indexOf('];', i));
  assert.match(bloco, /'Protocolado','I-797','Biometria',\s*\n?\s*'Em acompanhamento'/);
});
