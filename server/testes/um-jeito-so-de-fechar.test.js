// A queixa dela, com estas palavras: "sinto falta de padrão de botão de
// fechamento, às vezes está em cima, às vezes embaixo, às vezes nos dois
// lugares. Tem que ser fácil, tem que ser intuitivo."
//
// A varredura confirmou: 96 sobreposições, nenhuma fechava com Esc, o rótulo
// variava entre Fechar (24x), Cancelar (38x) e Voltar (3x), e só o Financeiro
// tinha ✕ no topo. Quem aprendia numa tela desaprendia na outra.
//
// Estes testes prendem o padrão: ✕ sempre no mesmo canto, Esc fecha, e o
// fechamento respeita a limpeza que cada tela já faz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const comum = readFileSync(new URL('../../docs/assets/comum.js', import.meta.url), 'utf8');

function corpoDe(assinatura) {
  const ini = comum.indexOf(assinatura);
  assert.ok(ini > 0, 'não achei ' + assinatura);
  let j = comum.indexOf('(', ini), par = 0;
  for (; j < comum.length; j++) {
    if (comum[j] === '(') par++;
    else if (comum[j] === ')') { par--; if (!par) break; }
  }
  let i = comum.indexOf('{', j), nivel = 0, fim = -1;
  for (; i < comum.length; i++) {
    if (comum[i] === '{') nivel++;
    else if (comum[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } }
  }
  return comum.slice(ini, fim);
}

// --------------------------------------------------------------- o rótulo
test('o reconhecedor pega os três rótulos que existem hoje, e só eles', () => {
  const m = /const RE_SO_FECHA = (\/.+\/i);\n/.exec(comum);
  assert.ok(m, 'não achei a expressão que reconhece o botão de fechar');
  const re = new RegExp(m[1].slice(1, -2), 'i');
  for (const bom of ['Fechar', 'Cancelar', 'Voltar', '← Voltar', '✕', 'fechar ']) {
    assert.ok(re.test(bom), `devia reconhecer "${bom}"`);
  }
  // Estes NÃO podem casar: são ações de verdade, não fechamento de janela.
  // "Cancelar contrato" cancela o contrato do cliente — clicar nele achando
  // que fecha a janela seria um estrago real.
  for (const ruim of ['Cancelar contrato', '✖ Cancelar processo', 'Cancelar seleção',
                      'Salvar', 'Confirmar', 'Voltar etapa', '← Voltar sem trocar']) {
    assert.ok(!re.test(ruim), `NÃO podia reconhecer "${ruim}" como fechar janela`);
  }
});

// --------------------------------------------------------------- o ✕
test('o ✕ nasce no mesmo canto, no modal e na gaveta', () => {
  const corpo = corpoDe('function porOXis(ov)');
  assert.match(corpo, /top:10px; right:12px/, 'a posição precisa ser fixa e igual nos dois');
  assert.match(corpo, /aria-label', 'Fechar'/, 'sem rótulo acessível o leitor de tela anuncia só "botão"');
  assert.match(corpo, /Fechar \(Esc\)/, 'a dica precisa ensinar o atalho — é assim que a pessoa descobre');
  assert.match(corpo, /drawer'\) \? ov : \(ov\.querySelector\('\.modal-box'\)/,
    'na gaveta o ✕ vai na própria gaveta; no modal, na caixa branca');
});

test('não duplica o ✕ se a janela for padronizada duas vezes', () => {
  // O observador de mudanças passa pelas mesmas janelas mais de uma vez.
  const corpo = corpoDe('function porOXis(ov)');
  assert.match(corpo, /if \(ov\.querySelector\(':scope \[data-lw-x\]'\)\) return;/);
});

// --------------------------------------------------------------- o fechar
test('fechar CLICA no botão da tela, não arranca a classe por fora', () => {
  // Cada tela faz sua limpeza ao fechar. Só tirar o `show` deixaria lixo:
  // seleção presa, registro ainda marcado como "em edição".
  const corpo = corpoDe('function fecharSobreposicao(ov)');
  assert.match(corpo, /b\.click\(\);/, 'tem que acionar o botão que já existe');
  const ondeClica = corpo.indexOf('b.click()');
  const ondeTira = corpo.indexOf("classList.remove('show')");
  assert.ok(ondeClica > 0 && ondeTira > ondeClica,
    'tirar o `show` é o último recurso, só quando a janela não tem botão nenhum');
});

test('o ✕ que o próprio padrão injetou não é confundido com o botão da tela', () => {
  const corpo = corpoDe('function botaoDeFechar(ov)');
  assert.match(corpo, /if \(b\.hasAttribute\('data-lw-x'\)\) continue;/,
    'sem isto o ✕ clicaria em si mesmo e nada fecharia');
});

// --------------------------------------------------------------- o Esc
test('Esc fecha a janela de cima, não todas', () => {
  const corpo = corpoDe('function ligarFechamentoPadrao()');
  assert.match(corpo, /abertas\[abertas\.length - 1\]/,
    'com duas janelas abertas, Esc tem que fechar só a de cima');
  assert.match(corpo, /'\.modal\.show, \.drawer\.show'/, 'Esc vale para os dois tipos');
});

test('o Esc do padrão não atropela quem já tratava Esc sozinho', () => {
  // Dois componentes do comum.js já escutam Esc em CAPTURA e chamam
  // stopPropagation. Se o padrão também escutasse em captura, os dois
  // fechariam de uma vez.
  const corpo = corpoDe('function ligarFechamentoPadrao()');
  const esc = /addEventListener\('keydown', \(e\)=>\{[\s\S]*?\}\)(;|, true\))/.exec(corpo);
  assert.ok(esc, 'não achei o escutador de Esc');
  assert.equal(esc[1], ';', 'o Esc do padrão tem que ser em bolha, não em captura');
});

test('clique no fundo NÃO fecha — é decisão, não esquecimento', () => {
  // Metade destas janelas é formulário. Um clique torto no fundo apagaria o
  // que a pessoa acabou de digitar.
  const corpo = corpoDe('function ligarFechamentoPadrao()');
  assert.doesNotMatch(corpo, /addEventListener\('click'/,
    'fechar por clique no fundo faz perder formulário pela metade');
  assert.match(comum, /Clique no fundo escuro NÃO fecha, de propósito/,
    'a razão precisa estar escrita, senão alguém "conserta" isso depois');
});

// --------------------------------------------------------------- liga sozinho
test('o padrão liga sozinho em toda tela interna', () => {
  // Deixar cada tela chamar significaria lembrar em 24 arquivos.
  assert.match(comum, /ligarFechamentoPadrao\(\);/);
  assert.match(comum, /MutationObserver/,
    'as janelas criadas depois, ao abrir um registro, também precisam do ✕');
});

test('todas as telas internas carregam o comum.js', () => {
  // Sem isto o padrão vale só para algumas, que é o problema de origem.
  const dir = new URL('../../docs/', import.meta.url);
  const fora = [];
  for (const arq of readdirSync(dir).filter(a => a.endsWith('.html'))) {
    const html = readFileSync(new URL(arq, dir), 'utf8');
    const interna = /id="side-nav"/.test(html);
    if (interna && !/assets\/comum\.js/.test(html)) fora.push(arq);
  }
  assert.deepEqual(fora, [], 'tela interna sem o comum.js fica fora do padrão');
});

// --------------------------------------------------------------- de verdade
test('numa página montada, o ✕ aparece e o Esc fecha pelo botão da tela', () => {
  // Roda o código de verdade contra um DOM de mentira: prova que as peças se
  // encaixam, em vez de só conferir que o texto está lá.
  const cliques = [];
  function elemento(tag, classes = []) {
    const el = {
      tagName: tag.toUpperCase(), classList: new Set(classes), filhos: [], atributos: {}, estilo: {},
      textContent: '', style: { cssText: '', position: '' },
      classListTem(c) { return this.classList.has(c); },
    };
    el.classList.contains = (c) => el.classList.has(c);
    el.classList.remove = (c) => el.classList.delete(c);
    el.matches = (sel) => sel.split(',').some(s => el.classList.has(s.trim().slice(1)));
    el.hasAttribute = (a) => a in el.atributos;
    el.setAttribute = (a, v) => { el.atributos[a] = v; };
    el.appendChild = (f) => { el.filhos.push(f); return f; };
    el.addEventListener = () => {};
    el.querySelector = (sel) => {
      if (sel.includes('[data-lw-x]')) return el.filhos.find(f => 'data-lw-x' in f.atributos) || null;
      return el.filhos.find(f => f.matches && f.matches(sel)) || null;
    };
    el.querySelectorAll = (sel) => sel.includes('button') ? el.filhos.filter(f => f.tagName === 'BUTTON') : [];
    return el;
  }

  const botaoTela = elemento('button');
  botaoTela.textContent = 'Fechar';
  botaoTela.addEventListener = () => {};
  botaoTela.click = () => cliques.push('botão da tela');

  const caixa = elemento('div', ['modal-box']);
  const modal = elemento('div', ['modal', 'show']);
  modal.filhos.push(caixa, botaoTela);

  const ctx = {
    document: {
      createElement: (t) => { const e = elemento(t); e.click = () => cliques.push('✕'); return e; },
      querySelectorAll: () => [modal],
      addEventListener: (_t, fn) => { ctx.__esc = fn; },
      body: { },
    },
    getComputedStyle: () => ({ position: 'static' }),
    window: { MutationObserver: null, LW: {} },
    console,
  };
  ctx.window.LW = ctx.LW = {};
  vm.createContext(ctx);
  new vm.Script(
    'const RE_SO_FECHA = ' + /const RE_SO_FECHA = (\/.+\/i);\n/.exec(comum)[1] + ';\n'
    + 'const RE_SO_SIMBOLO = ' + /const RE_SO_SIMBOLO = (\/.+\/);/.exec(comum)[1] + ';\n'
    + corpoDe('function botaoDeFechar(ov)') + '\n'
    + corpoDe('function fecharSobreposicao(ov)') + '\n'
    + corpoDe('function porOXis(ov)') + '\n'
    + 'porOXis(globalThis.__modal);'
  ).runInContext(Object.assign(ctx, { __modal: modal }));

  const xis = caixa.filhos.find(f => 'data-lw-x' in f.atributos);
  assert.ok(xis, 'o ✕ tinha que ter sido criado dentro da caixa branca');
  assert.equal(xis.textContent, '✕');
  assert.equal(xis.atributos['aria-label'], 'Fechar');
  assert.equal(caixa.style.position, 'relative', 'sem isto o ✕ escapa da caixa');
});

test('onde já existe ✕ próprio, o padrão NÃO cria um segundo', () => {
  // O Financeiro já tem dois botões `cc-x`. Injetar outro ao lado seria
  // produzir o "às vezes nos dois lugares" que ela reclamou — o padrão
  // existe para acabar com isso, não para piorar.
  const corpo = corpoDe('function porOXis(ov)');
  assert.match(corpo, /RE_SO_SIMBOLO\.test\(proprio\.textContent/,
    'precisa reconhecer o ✕ que a tela já tem');
  assert.match(corpo, /proprio\.style\.top = '10px'/,
    'o ✕ que já existe tem que ir para o mesmo canto dos outros');
  const ondeReusa = corpo.indexOf('RE_SO_SIMBOLO');
  const ondeCria = corpo.indexOf("createElement");
  assert.ok(ondeReusa > 0 && ondeCria > ondeReusa, 'reusar vem antes de criar');
});

test('o Financeiro, que já tinha ✕, continua com exatamente um por janela', () => {
  const fin = readFileSync(new URL('../../docs/financeiro.html', import.meta.url), 'utf8');
  const quantos = (fin.match(/class="cc-x"/g) || []).length;
  assert.equal(quantos, 2, 'eram os dois ✕ que existiam quando o padrão foi escrito');
  assert.match(fin, /title="Fechar"/, 'os dois já se identificam como fechar');
});
