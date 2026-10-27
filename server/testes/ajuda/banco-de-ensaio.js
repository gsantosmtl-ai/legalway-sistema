// Um banco em memória, para rodar as automações DE VERDADE num fluxo inteiro.
//
// A alternativa seria reescrever a lógica dentro do teste — e aí o teste passa
// a conferir a imitação, não o sistema. Aqui o arquivo `automacoes.js` é
// carregado como ele é, com os `import` trocados por dublês: o que roda é o
// código que vai para produção.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { REGRAS_PADRAO } = await import('../../src/regras.js');
// Estas duas entram DE VERDADE, não como dublê: são a regra de quanto o
// cliente pagou e quanto ele deve, e um dublê aqui esconderia justamente o
// erro que elas consertam.
const { pagoPeloCliente, saldoDoCliente } = await import('../../src/pagamento.js');
// O gerador de id de verdade: um dublê aqui esconderia justamente a colisão
// que ele existe para impedir.
const { novoId } = await import('../../src/ids.js');

const FONTE = new URL('../../src/automacoes.js', import.meta.url);

// Tira os `import` (o contexto fornece os nomes) e os `export` (que só valem
// em módulo). O corpo do arquivo fica intacto.
function corpoDoModulo() {
  return readFileSync(FONTE, 'utf8')
    .replace(/^import[^;]+;$/gm, '')
    .replace(/^export (async )?function/gm, '$1function')
    .replace(/^export const/gm, 'const');
}

export function bancoDeEnsaio(blocos = {}, opcoes = {}) {
  const dados = JSON.parse(JSON.stringify(blocos));
  const versoes = {};
  const avisos = [];
  const naoFeitos = [];

  const ctx = {
    console: { log(){}, warn(){}, error(){} },
    // --- armazenamento ---
    ler: async (chave) => (chave in dados) ? { valor: dados[chave], versao: versoes[chave] || 1 } : null,
    gravar: async (chave, valor) => {
      dados[chave] = JSON.parse(JSON.stringify(valor));
      versoes[chave] = (versoes[chave] || 1) + 1;
      return { versao: versoes[chave] };
    },
    // --- avisos: guardados, nunca enviados ---
    avisarCanal: async (canal, texto) => { avisos.push({ canal, texto }); },
    avisarPessoa: async (quem, texto) => { avisos.push({ quem, texto }); },
    // As regras PADRÃO do sistema, não um objeto vazio: metade das automações
    // lê configuração de dentro delas, e com `{}` o teste mediria o dublê.
    obterRegras: async () => opcoes.regras || REGRAS_PADRAO,
    // --- passos de fora do arquivo: não fazem nada aqui, e ficam anotados ---
    varrerUscis: async () => { naoFeitos.push('uscis'); },
    primeiroContato: async () => { naoFeitos.push('primeiro contato'); },
    avisosAutomaticos: async () => { naoFeitos.push('avisos'); },
    conferirPrazos: async () => { naoFeitos.push('prazos'); },
    conferirStripe: async () => { naoFeitos.push('stripe'); },
    avisosDeParcela: async () => { naoFeitos.push('parcelas'); },
    boletimDiario: async () => { naoFeitos.push('boletim'); },
    limparTentativas: async () => { naoFeitos.push('tentativas'); },
    DOCUMENTOS_DEPENDENTE_PADRAO: [{ nome: 'Documentos do dependente' }],
    hojeNoFuso: () => (opcoes.hoje || new Date().toISOString().slice(0, 10)),
    pagoPeloCliente, saldoDoCliente,
    novoId,
  };
  vm.createContext(ctx);
  new vm.Script(corpoDoModulo()).runInContext(ctx);

  return {
    dados, avisos, naoFeitos,
    // Roda a bateria inteira, como o servidor faz. O resultado passa por JSON
    // de propósito: ele nasce DENTRO do contexto isolado, e um array de lá tem
    // outro protótipo — `deepEqual` reprova dois arrays vazios iguais.
    rodar: async () => JSON.parse(JSON.stringify(await ctx.executarAutomacoes('teste'))),
    bloco: (chave) => dados[chave] || [],
  };
}

// O contrato nascendo do Ganho, com o literal que está na tela do Funil —
// e não uma cópia escrita no teste, que envelheceria sozinha.
const FUNIL = new URL('../../../docs/funil-comercial.html', import.meta.url);
export function contratoDoGanho(lead, dependentes = 0, quando = '2026-10-24T12:00:00.000Z') {
  const tela = readFileSync(FUNIL, 'utf8');
  const ini = tela.indexOf('const novoContrato = {');
  if (ini < 0) throw new Error('não achei o contrato gerado no Ganho');
  let i = tela.indexOf('{', ini), nivel = 0, fim = -1;
  for (; i < tela.length; i++) { if (tela[i] === '{') nivel++; else if (tela[i] === '}') { nivel--; if (!nivel) { fim = i + 1; break; } } }
  const ctx = {
    l: lead, dependentes,
    LW: { novoId: (p) => p + '-' + (lead.id || 'x'), escaparHtml: (x) => x },
    now: () => new Date(quando),
  };
  vm.createContext(ctx);
  new vm.Script(tela.slice(ini, fim) + ';\nvar pronto = JSON.stringify(novoContrato);').runInContext(ctx);
  return JSON.parse(ctx.pronto);
}
