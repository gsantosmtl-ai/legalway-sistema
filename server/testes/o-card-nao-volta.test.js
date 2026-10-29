// O card que ia para "Documento finalizado" e voltava sozinho.
//
// Relato dela, duas vezes, com dois clientes diferentes:
//   "wandersom orlando - coloco o card em documentos em finalizado - mas ele
//    vai e volta e nao fica em finalizado"
//   "paulo fernando alves - mudanca de endereco finalizado (quando coloco o
//    card no finalizado ele volta)"
//
// Ninguém estava arrastando o card de volta. Registrar um ACOMPANHAMENTO —
// uma atualização enviada ao cliente — mandava a ficha para "Em
// acompanhamento" SEMPRE, sem olhar onde ela estava. Como "Em acompanhamento"
// é a etapa logo antes da última, o card voltava uma coluna.
//
// A regra certa já existia no mesmo arquivo, nos marcos do USCIS: uma ficha só
// anda para a FRENTE. Uma que já está em "Em acompanhamento" não volta para
// "Biometria" porque alguém corrigiu uma data antiga. Faltava aqui.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(AQUI, '../../docs/documentos.html'), 'utf8');

// O trecho que roda quando alguém confirma uma atualização ao cliente.
//
// Fechado pela contagem de chaves, e não pelo primeiro `});` depois de um
// `toast(`: o handler começa com um `toast('Descreva a atualização.')` de
// validação, e cortar ali deixava o teste lendo cinco linhas e aprovando
// qualquer coisa depois delas.
function trechoDoAcompanhamento() {
  const i = html.indexOf("getElementById('confirm-ac').addEventListener");
  assert.ok(i > 0, 'não achei o botão que confirma o acompanhamento');
  let nivel = 0, fim = -1;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') nivel++;
    else if (html[k] === '}') { nivel--; if (nivel === 0) { fim = k + 1; break; } }
  }
  assert.ok(fim > 0, 'não consegui fechar o handler do acompanhamento');
  return html.slice(i, fim);
}

test('registrar acompanhamento não arrasta a ficha para trás', () => {
  const t = trechoDoAcompanhamento();
  const guarda = t.indexOf('atual < destino');
  const troca = t.indexOf("p.status = 'Em acompanhamento'");
  assert.ok(guarda >= 0 && /ETAPAS\.indexOf\('Em acompanhamento'\)/.test(t),
    'falta a regra de só andar para a frente');
  // A ordem é o que importa: a troca de etapa tem que vir DEPOIS da guarda.
  // Se voltar a aparecer antes, a ficha é arrastada para trás de novo.
  assert.ok(troca > guarda,
    'o acompanhamento voltou a mudar a etapa antes de olhar onde a ficha está');
});

// A trava não pode engolir o caso legítimo: ficha ATRÁS de "Em acompanhamento"
// continua avançando quando a equipe manda uma atualização.
test('a ficha que está atrás continua avançando', () => {
  const t = trechoDoAcompanhamento();
  const i = t.indexOf('atual < destino');
  assert.ok(/p\.status = 'Em acompanhamento'/.test(t.slice(i, i + 300)),
    'a ficha que está numa etapa anterior deixou de avançar');
});

// Lista personalizada pelo escritório: indexOf devolve -1 e nada se move.
// Sem esta guarda, uma etapa renomeada faria toda ficha pular para a etapa
// errada — ou para a primeira da lista.
test('lista de etapas diferente não move nada', () => {
  const t = trechoDoAcompanhamento();
  assert.ok(/destino >= 0 && atual >= 0/.test(t),
    'sem a guarda do -1, uma lista de etapas personalizada move a ficha para o lugar errado');
});

// Cada lugar que muda a etapa SOZINHO, com a condição que o segura.
//
// Não é uma heurística: é uma lista conferida. A primeira versão deste teste
// procurava um `if` nos 260 caracteres anteriores e acusou dois inocentes —
// os dois têm condição, só que mais acima, separada por um comentário. Uma
// regra que grita no lugar errado ensina a ignorar o teste.
//
// Aqui a conta é fechada: se alguém acrescentar, tirar ou duplicar uma troca
// automática de etapa, o número muda e este teste para a mudança para que
// alguém olhe a condição nova.
const TROCAS_AUTOMATICAS = {
  // Financeiro autorizou — só sai de "Aguardando autorização financeira".
  'Liberado para protocolo': 1,
  // Todos os documentos aprovados — só a partir de "Documentos solicitados"
  // ou "Recebendo documentos".
  'Documentação completa': 1,
  // Botão "Solicitar autorização" — só aparece em "Documentação completa".
  'Aguardando autorização financeira': 1,
  // Registrar protocolo — só quando NÃO é edição de um protocolo que já existe.
  'Protocolado': 1,
  // Atualização ao cliente — só anda para a frente (o defeito deste arquivo).
  'Em acompanhamento': 1,
};

test('nenhuma troca automática de etapa entrou sem ser conferida', () => {
  const achadas = {};
  const re = /\n\s*p\.status = '([^']+)';/g;
  let m;
  while ((m = re.exec(html))) achadas[m[1]] = (achadas[m[1]] || 0) + 1;
  assert.deepStrictEqual(achadas, TROCAS_AUTOMATICAS,
    'mudou o conjunto de trocas automáticas de etapa — confira a condição de cada uma nova');
});
