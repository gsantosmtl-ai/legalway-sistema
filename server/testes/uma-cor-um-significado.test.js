// Uma cor, um significado — em toda tela.
//
// O pedido dela foi: "sempre padrão, mesmas cores, mesmas localizações, tem que
// ser fácil e intuitivo". O que havia antes, medido:
//
//   · `button.primary` era azul-marinho em 18 telas e VINHO em 6 — entre elas
//     Contratos e Financeiro. A mesma classe, a mesma ideia, duas cores.
//   · a etiqueta neutra era azul-marinho em 4 telas e cinza no resto, e o olho
//     lê azul-marinho como destaque.
//   · quatro telas escreveram o tom à mão (#E6F4EC) em vez de usar o token,
//     então "Pago" tinha dois verdes diferentes dependendo de onde você olhava.
//
// Isso não aparece em teste de comportamento e ninguém percebe lendo o diff de
// uma tela só. Só aparece olhando as 30 juntas — que é o que este arquivo faz.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');
const telas = readdirSync(DOCS).filter((f) => f.endsWith('.html'));
const ler = (f) => readFileSync(join(DOCS, f), 'utf8');

// O portal do cliente é a tela da MARCA: quem abre não é a equipe, é o cliente.
// Lá o vinho é a cor certa. Nas telas de trabalho, não.
const DA_MARCA = new Set(['portal-cliente.html', 'portal-prestador.html']);

test('o botão da ação principal é azul-marinho em toda tela de trabalho', () => {
  const vinho = telas.filter((f) => !DA_MARCA.has(f)
    && /button\.primary\s*\{[^}]*background:\s*var\(--gold\)/.test(ler(f)));
  assert.deepEqual(vinho, [],
    'estas telas pintam a ação principal de vinho; nas outras ela é azul-marinho');
});

test('a etiqueta neutra não é azul-marinho em tela nenhuma', () => {
  const erradas = telas.filter((f) => {
    const m = ler(f).match(/\.pill\s*\{[^}]*\}/g) || [];
    return m.some((r) => /background:\s*#EEF0F8/i.test(r) && /color:\s*var\(--navy\)/.test(r));
  });
  assert.deepEqual(erradas, [],
    'azul-marinho é marca, menu e botão principal; etiqueta neutra é cinza');
});

test('ninguém escreve o tom da cor de estado à mão', () => {
  // Os tons que estavam espalhados antes de a paleta ir para padrao.css.
  const CRUS = /#E6F4EC|#FFF3DF|#FBE9E5|#EEF0F8/i;
  const achados = [];
  for (const f of telas) {
    for (const linha of ler(f).split('\n')) {
      if (!CRUS.test(linha)) continue;
      // Uma DEFINIÇÃO de token e um fallback var(--x, #hex) são legítimos;
      // e a cor da barra do navegador não é cor de estado.
      if (/--[a-z-]+\s*:\s*#/i.test(linha)) continue;
      if (/var\(--[a-z-]+,\s*#/i.test(linha)) continue;
      if (/theme-color|content=/.test(linha)) continue;
      achados.push(`${f}: ${linha.trim().slice(0, 80)}`);
    }
  }
  assert.deepEqual(achados, [], 'use o token: é ele que mantém o mesmo verde em todas as telas');
});

test('quem define os tokens de estado usa o mesmo valor que todo mundo', () => {
  const CANONICO = {
    'green-tag': '#2F6F4E', 'green-tag-bg': '#E4EFE8',
    'amber': '#8E5F06', 'amber-bg': '#F3E9D2',
    'red': '#A5402E', 'red-bg': '#F6E7E3',
    'blue-tag': '#3A5A8C', 'blue-tag-bg': '#E7ECF3',
  };
  const fora = [];
  for (const f of telas) {
    const s = ler(f);
    for (const [k, v] of Object.entries(CANONICO)) {
      const re = new RegExp(`--${k}\\s*:\\s*(#[0-9A-Fa-f]{6})`, 'g');
      let m;
      while ((m = re.exec(s))) {
        if (m[1].toUpperCase() !== v.toUpperCase()) fora.push(`${f}: --${k}=${m[1]} (é ${v})`);
      }
    }
  }
  assert.deepEqual(fora, [], 'dois tons para a mesma ideia é o que faz a tela parecer outra');
});

test('a paleta de estado mora em padrao.css, não copiada em cada tela', () => {
  const css = readFileSync(join(DOCS, 'assets/padrao.css'), 'utf8');
  for (const t of ['--green-tag-bg', '--amber-bg', '--red-bg', '--blue-tag-bg']) {
    assert.ok(css.includes(t), `${t} precisa estar em padrao.css para valer em toda tela`);
  }
  assert.ok(/verde\s+resolvido/i.test(css) && /vermelho\s+precisa de voc/i.test(css),
    'a regra escrita vai junto: sem ela o próximo a mexer não sabe o que cada cor quer dizer');
});

test('nenhum token definido como ele mesmo', () => {
  // Já aconteceu: uma varredura gerou `--navy: var(--navy)` e apagou a cor de
  // cinco telas. É invisível no diff e só aparece no ar.
  const ruins = [];
  for (const f of [...telas, 'assets/padrao.css', 'assets/comum.css']) {
    let s;
    try { s = ler(f); } catch { continue; }
    const re = /--([a-z-]+)\s*:\s*var\(--([a-z-]+)\)/g;
    let m;
    while ((m = re.exec(s))) if (m[1] === m[2]) ruins.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(ruins, [], 'token que aponta para si mesmo apaga a cor da tela');
});

// --- os quatro níveis de botão ----------------------------------------------

test('o vinho saiu das telas de trabalho', () => {
  const comVinho = telas.filter((f) => !DA_MARCA.has(f)
    && /<button[^>]*class="[^"]*\bgold\b/.test(ler(f)));
  assert.deepEqual(comVinho, [],
    'vinho era "Salvar", "Abrir", "Copiar" e "+ Adicionar" ao mesmo tempo — '
    + 'a mesma cor para quatro coisas diferentes não diz nada');
});

test('o botão secundário existe em toda tela, não em três', () => {
  const css = readFileSync(join(DOCS, 'assets/padrao.css'), 'utf8');
  assert.ok(/button\.leve/.test(css),
    'sem um secundário disponível, quem precisa dele usa ghost (some) ou primary (grita)');
});

test('a senha temporária: o destaque está em Copiar, não em Fechar', () => {
  // A senha aparece uma vez só. Fechar sem copiar perde — e "Fechar" era o
  // botão escuro da janela.
  const s = ler('usuarios.html');
  const i = s.indexOf('id="modal-senha"');
  assert.ok(i > 0, 'não achei a janela da senha temporária');
  const janela = s.slice(i, i + 1800);
  assert.ok(/class="primary"[^>]*id="copiar-senha"/.test(janela),
    'copiar é o que não dá para refazer depois: é ele que leva o destaque');
  assert.ok(!/class="[^"]*primary[^"]*"[^>]*id="fechar-senha"/.test(janela),
    'o botão que faz a senha sumir não pode ser o mais chamativo da janela');
});

test('voltar e avançar etapa são um par e parecem um par', () => {
  const s = ler('contratos.html');
  const voltar = s.match(/<button[^>]*id="dt-voltar"[^>]*>/);
  const avancar = s.match(/<button[^>]*id="dt-avancar"[^>]*>/);
  assert.ok(voltar && avancar);
  const cls = (t) => (t[0].match(/class="([^"]*)"/) || [, ''])[1].trim();
  assert.equal(cls(voltar), cls(avancar),
    'o voltar estava sem estilo nenhum e o avançar em destaque — mesma dupla, pesos diferentes');
});

test('no máximo um botão em destaque por linha de ações', () => {
  // A exceção declarada: o Financeiro tem DUAS entradas de peso igual, receber
  // e pagar. Forçar hierarquia entre elas seria inventar uma que não existe.
  const EXCECAO = new Set(['financeiro.html']);
  const demais = [];
  for (const f of telas) {
    if (EXCECAO.has(f)) continue;
    const s = ler(f);
    for (const m of s.matchAll(/<div[^>]*style="[^"]*display:\s*flex[^"]*"[^>]*>([\s\S]{0,900}?)<\/div>/g)) {
      const n = (m[1].match(/<button[^>]*class="[^"]*\bprimary\b/g) || []).length;
      if (n > 1) {
        const rotulos = [...m[1].matchAll(/<button[^>]*class="[^"]*\bprimary\b[^"]*"[^>]*>([\s\S]{0,60}?)<\/button>/g)]
          .map((x) => x[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 30));
        demais.push(`${f}: ${rotulos.join(' | ')}`);
      }
    }
  }
  assert.deepEqual(demais, [], 'dois destaques na mesma linha é o mesmo que nenhum');
});
