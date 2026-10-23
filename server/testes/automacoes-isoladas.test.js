// As 20 automações rodavam dentro de UM try.
//
// Bastava a primeira falhar — um lead com data estragada, um contrato sem
// campo esperado — para que cobrança, USCIS, comissão do SDR, prazos e todo o
// resto parassem de rodar. Em silêncio, em todas as rodadas seguintes, até
// alguém ler o log do servidor. E ninguém lê log de servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const auto = readFileSync(new URL('../src/automacoes.js', import.meta.url), 'utf8');

test('cada automação roda no seu próprio try', () => {
  const i = auto.indexOf('const PASSOS = [');
  assert.notEqual(i, -1, 'os passos precisam ser uma lista, para dar para isolar um a um');
  const corpo = auto.slice(i, auto.indexOf('return { passos: PASSOS.length, falhas };', i));
  assert.match(corpo, /for \(const \[nome, passo\] of PASSOS\) \{\s*\n\s*try \{\s*\n\s*await passo\(log\);\s*\n\s*\} catch \(e\) \{/,
    'o try tem que estar DENTRO do laço');
  assert.match(corpo, /falhas\.push\(`\$\{nome\}: \$\{e\.message\}`\)/, 'e dizer qual passo foi');
});

test('a ordem que importa continua garantida', () => {
  const i = auto.indexOf('const PASSOS = [');
  const corpo = auto.slice(i, auto.indexOf('];', i));
  const nomes = [...corpo.matchAll(/\['([^']+)',/g)].map(m => m[1]);
  assert.equal(nomes.length, 20, 'nenhum passo pode ter sumido na reorganização');
  assert.ok(nomes.indexOf('assinaturas pendentes') < nomes.indexOf('cliente e parcelas dos assinados'),
    'confirmar a assinatura antes de varrer: o contrato marcado agora já ganha cliente e parcelas nesta rodada');
  assert.ok(nomes.indexOf('conciliação do Stripe') < nomes.indexOf('marcar atrasadas'),
    'conciliar ANTES de marcar atrasado: quem pagou hoje não pode virar inadimplente');
  assert.ok(nomes.indexOf('conciliação do Stripe') < nomes.indexOf('avisos automáticos'),
    'nem receber cobrança de algo que acabou de pagar');
  assert.ok(nomes.indexOf('processos de contratos') < nomes.indexOf('autorizações financeiras'),
    'o processo precisa existir antes de ser autorizado');
  assert.ok(nomes.indexOf('comissão do SDR') > nomes.indexOf('conciliação do Stripe'),
    'a comissão depende da entrada estar paga');
});

test('a falha não fica só no log — alguém é avisado', () => {
  const i = auto.indexOf('if (falhas.length) {');
  const corpo = auto.slice(i, i + 900);
  assert.match(corpo, /avisoDoDia\('automacoes-falharam'\)/, 'uma vez por dia, senão vira barulho a cada rodada');
  assert.match(corpo, /avisarCanal\('documentacao'/);
  assert.match(corpo, /automação\(ões\) pararam de funcionar hoje/);
  assert.match(corpo, /As outras continuaram rodando/,
    'quem ler precisa saber que o resto do sistema não parou junto');
});

// ------------------------------------------------------------- rodando
test('um passo que explode não derruba os outros', () => {
  const ctx = { console: { log(){}, error(){} }, chamados: [] };
  vm.createContext(ctx);
  vm.runInContext(`
    async function rodar(PASSOS, avisou){
      const log = [], falhas = [];
      for (const [nome, passo] of PASSOS) {
        try { await passo(log); }
        catch (e) { falhas.push(nome + ': ' + e.message); }
      }
      return { falhas, log };
    }`, ctx);
  const passo = (nome, explode) => [nome, async () => { ctx.chamados.push(nome); if (explode) throw new Error('quebrou'); }];
  return ctx.rodar([
    passo('primeiro contato', true),
    passo('conciliação do Stripe', false),
    passo('comissão do SDR', true),
    passo('boletim diário', false),
  ]).then(r => {
    assert.equal(JSON.stringify(ctx.chamados),
      '["primeiro contato","conciliação do Stripe","comissão do SDR","boletim diário"]',
      'os quatro rodaram, mesmo com dois quebrando');
    assert.equal(r.falhas.length, 2);
    assert.match(r.falhas[0], /^primeiro contato: quebrou$/);
  });
});

test('a rodada não se atropela com ela mesma', () => {
  // Uma gravação dispara uma rodada; várias gravações seguidas disparariam
  // várias ao mesmo tempo, cada uma lendo e gravando os mesmos blocos.
  assert.match(auto, /let rodando = false;/);
  assert.match(auto, /if \(rodando\) return;\s*\n\s*rodando = true;/);
  assert.match(auto, /\} finally \{ rodando = false; \}/, 'e libera mesmo quando dá erro');
});
