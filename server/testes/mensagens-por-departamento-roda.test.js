// Este arquivo existe por causa de um erro meu.
//
// Montei a tela de departamentos e escrevi seis testes — todos olhando o TEXTO
// do código. Passaram. Subi. E a tela não abria: `pintarListaAvisos` usava
// `canal` e `automatico`, que eram variáveis de OUTRA função. O nível 2
// estourava com "canal is not defined" e a lista ficava presa no nível 1, sem
// nada aparecer na tela.
//
// Teste de texto não pega variável que não existe. Este roda a função.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

function recortar(assinatura) {
  const i = cfg.indexOf(assinatura);
  assert.notEqual(i, -1, 'não achei ' + assinatura);
  let n = 0;
  for (let k = cfg.indexOf('{', i); k < cfg.length; k++) {
    if (cfg[k] === '{') n++;
    else if (cfg[k] === '}') { n--; if (n === 0) return cfg.slice(i, k + 1); }
  }
  throw new Error('chaves não fecham');
}

// Um DOM de mentira, só com o que a função usa.
function elemento(id) {
  const el = { id, innerHTML: '', _filhos: [], ouvintes: [],
    addEventListener(t, f) { this.ouvintes.push([t, f]); },
    querySelector(sel) { return this._achar(sel)[0] || null; },
    querySelectorAll(sel) { return this._achar(sel); },
    _achar(sel) {
      // Varre o HTML gerado procurando os atributos que a função religa.
      const attr = /\[([a-z-]+)\]/.exec(sel);
      if (attr) {
        const re = new RegExp(attr[1] + '="([^"]*)"', 'g');
        const fora = []; let m;
        while ((m = re.exec(this.innerHTML))) fora.push(botao(attr[1], m[1]));
        return fora;
      }
      const idm = /^#([a-z-]+)$/.exec(sel);
      if (idm) return this.innerHTML.includes(`id="${idm[1]}"`) ? [botao('id', idm[1])] : [];
      const cls = /^\.([a-z-]+)$/.exec(sel);
      if (cls) return this.innerHTML.includes(`class="${cls[1]}"`) ? [botao('class', cls[1])] : [];
      return [];
    } };
  return el;
}
const botao = (attr, valor) => ({ ouvintes: [], getAttribute: (a) => a === attr ? valor : null,
  addEventListener(t, f) { this.ouvintes.push([t, f]); } });

function palco({ dept = null, avisos, regras } = {}) {
  const alvo = elemento('lista-avisos');
  const guardado = { dept };
  const ctx = {
    console, document: {
      getElementById: (id) => id === 'lista-avisos' ? alvo : null,
      querySelector: () => ({ click() {} }),
    },
    localStorage: { getItem: () => guardado.dept, setItem: (_, v) => { guardado.dept = v; }, removeItem: () => { guardado.dept = null; } },
    escR: (v) => String(v == null ? '' : v),
    avisos, regrasAtuais: regras,
    avisosAbertos: new Set(),
    gatilhoDe: (k) => k ? ({
      documentosPendentes: { key: 'documentosPendentes', nome: 'Documentos que faltam', sobre: 'processo', setorSugerido: 'documentos', quando: 'semanal', chaves: [] },
      cobrancaChegando: { key: 'cobrancaChegando', nome: 'Cobrança chegando', sobre: 'parcela', setorSugerido: 'financeiro', quando: 'diasAntes', chaves: [] },
      followupComercial: { key: 'followupComercial', nome: 'Follow-up comercial', sobre: 'lead', setorSugerido: 'comercial', quando: 'evento', chaves: [] },
      reuniaoChegando: { key: 'reuniaoChegando', nome: 'Reunião chegando', sobre: 'agenda', setorSugerido: 'comercial', quando: 'minutosAntes', chaves: [] },
    }[k]) : null,
    QUANDO_ROTULO: {}, DIA_NOME: {}, gatilhos: [],
    resumoDoAviso: () => 'resumo',
  };
  ctx.DEPT_ATIVO = dept;
  vm.createContext(ctx);
  vm.runInContext('var DEPT_ATIVO = ' + JSON.stringify(dept) + ';\n' + recortar('function pintarListaAvisos(setores)'), ctx);
  ctx.pintarListaAvisos(((regras || {}).setores || {}).lista || []);
  return { ctx, alvo, guardado };
}

const AVISOS = [
  { id: 'a1', gatilho: 'documentosPendentes', nome: 'Documentos que faltam', ligado: true, texto: 'x' },
  { id: 'a2', gatilho: 'cobrancaChegando', nome: 'Cobrança chegando', ligado: false, texto: 'x' },
  { id: 'a3', gatilho: 'followupComercial', nome: 'Follow-up comercial', ligado: false, texto: 'x' },
  { id: 'a4', gatilho: 'reuniaoChegando', nome: 'Reunião chegando', ligado: true, texto: 'x' },
];
const REGRAS = {
  setores: { canal: 'waha', envioAutomatico: true, avisoAntesCobrancaDias: 2, lista: [
    { key: 'documentos', nome: 'Documentação', numero: '+1407', sessao: 'documentos', responsavel: 'Elaine' },
    { key: 'financeiro', nome: 'Financeiro', numero: '', sessao: '', responsavel: '' },
    { key: 'comercial', nome: 'Comercial', numero: '+1408', sessao: 'comercial', responsavel: '' },
  ]},
  agenda: { disponibilidade: [
    { vendedor: 'Renato', numero: '+1409', sessao: 'renato' },
    { vendedor: 'Adriano', numero: '+1410', sessao: '' },
  ]},
};
const SETORES = REGRAS.setores.lista;

test('nível 1: desenha os cinco departamentos, sem estourar', () => {
  const { alvo } = palco({ dept: null, avisos: AVISOS, regras: REGRAS });
  assert.ok(alvo.innerHTML.length > 200, 'a tela não pode sair vazia');
  for (const nome of ['Documentação', 'Financeiro', 'Comercial geral', 'Comercial Renato', 'Comercial Adriano']) {
    assert.ok(alvo.innerHTML.includes(nome), 'falta o departamento ' + nome);
  }
  assert.ok(!alvo.innerHTML.includes('Peterson'), 'o rótulo é do setor, não de quem responde por ele');
});

test('nível 2: abrir um departamento desenha as REGRAS e as mensagens', () => {
  // É aqui que estourava "canal is not defined" e nada aparecia.
  const { alvo } = palco({ dept: 'setor:documentos', avisos: AVISOS, regras: REGRAS });
  assert.ok(alvo.innerHTML.includes('Regras deste departamento'), 'as regras têm que aparecer');
  assert.ok(alvo.innerHTML.includes('dept-voltar'), 'e o caminho de volta');
  assert.ok(alvo.innerHTML.includes('Elaine'), 'o responsável do setor');
  assert.ok(alvo.innerHTML.includes('WhatsApp (WAHA)'), 'o canal, lido das regras');
  assert.ok(alvo.innerHTML.includes('Ligado'), 'o envio automático, lido das regras');
  assert.ok(alvo.innerHTML.includes('Documentos que faltam'), 'e a mensagem do setor');
  assert.ok(!alvo.innerHTML.includes('Cobrança chegando'), 'sem as mensagens dos outros');
});

test('nível 2 no Financeiro: regra em branco aparece como falta', () => {
  const { alvo } = palco({ dept: 'setor:financeiro', avisos: AVISOS, regras: REGRAS });
  assert.ok(alvo.innerHTML.includes('— não preenchido'), 'número e sessão vazios não podem sumir');
  assert.ok(alvo.innerHTML.includes('Avisar da cobrança com'), 'a antecedência só aparece no Financeiro');
  assert.ok(alvo.innerHTML.includes('Cobrança chegando'));
});

test('nível 2 num vendedor: traz o follow-up E a reunião', () => {
  const { alvo } = palco({ dept: 'vend:Renato', avisos: AVISOS, regras: REGRAS });
  assert.ok(alvo.innerHTML.includes('Follow-up comercial'));
  assert.ok(alvo.innerHTML.includes('Reunião chegando'), 'a reunião também sai pelo número dele');
  assert.ok(!alvo.innerHTML.includes('Documentos que faltam'));
  assert.ok(alvo.innerHTML.includes('+1409'), 'o número vem da disponibilidade da equipe');
});

test('vendedor sem número conectado é avisado na tela', () => {
  const { alvo } = palco({ dept: 'vend:Adriano', avisos: AVISOS, regras: REGRAS });
  assert.ok(alvo.innerHTML.includes('saem pelo <b>Comercial geral</b>'),
    'ele precisa saber por onde a mensagem sai enquanto isso');
});

test('departamento que não existe mais volta para a lista', () => {
  const { alvo } = palco({ dept: 'vend:QuemSaiu', avisos: AVISOS, regras: REGRAS });
  assert.ok(alvo.innerHTML.includes('Documentação') && alvo.innerHTML.includes('Comercial geral'),
    'em vez de uma tela vazia');
});

test('sem regras carregadas ainda, não quebra', () => {
  const { alvo } = palco({ dept: 'setor:documentos', avisos: AVISOS, regras: null });
  assert.ok(alvo.innerHTML.length > 50, 'tela em branco é pior do que tela incompleta');
});
