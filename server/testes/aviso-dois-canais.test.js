// O aviso que cria o acesso ao portal carrega a SENHA do cliente. Chegar pela metade é
// não chegar: parte dos clientes só olha WhatsApp, parte só olha e-mail. Antes o motor
// conhecia um canal só e travava o aviso inteiro quando o WhatsApp estava desligado —
// mesmo com o e-mail pronto para usar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');

test('o motor conhece os dois canais', () => {
  assert.match(fonte, /import \{ enviarEmail, emailConfigurado \} from '\.\/email\.js'/,
    'o motor de avisos precisa saber mandar e-mail, não só WhatsApp');
  assert.match(fonte, /const podeEmail = emailConfigurado\(\)/,
    'falta decidir se o e-mail pode sair automaticamente');
});

test('o e-mail obedece à mesma chave de envio automático', () => {
  // Ligar o WhatsApp não pode ligar o e-mail por tabela, nem o contrário: é o
  // escritório que decide se a máquina manda sozinha.
  assert.match(fonte, /const podeEmail = emailConfigurado\(\) && !!\(R\.setores && R\.setores\.envioAutomatico\)/,
    'o e-mail automático deveria depender da mesma chave do escritório');
});

test('o aviso com senha não trava mais por falta de WhatsApp', () => {
  assert.match(fonte, /gat\.exigeEnvioAutomatico && !envia && !podeEmail/,
    'o aviso só deveria parar quando NENHUM canal automático existe');
  assert.ok(!/gat\.exigeEnvioAutomatico && !envia\)/.test(fonte),
    'voltou a exigir WhatsApp especificamente');
});

test('manda pelos dois quando os dois existem, e registra por onde saiu', () => {
  assert.match(fonte, /let foiWaha = false, foiEmail = false/, 'falta acompanhar os dois canais');
  assert.match(fonte, /foiWaha && foiEmail \? 'waha\+email'/,
    'quando os dois funcionam, o registro tem que dizer os dois');
  assert.match(fonte, /e por e-mail/, 'o histórico do processo deveria dizer que saiu por e-mail também');
});

test('o e-mail usa o endereço do próprio processo', () => {
  assert.match(fonte, /const emailDestino = \(c\.alvo && c\.alvo\.email\) \|\| c\.valores\.email/,
    'sem endereço de destino o e-mail não sai');
});

test('uma falha de e-mail não derruba a varredura', () => {
  // Um SMTP fora do ar não pode impedir o WhatsApp de sair, nem parar os outros avisos.
  const i = fonte.indexOf('const emailDestino');
  const trecho = fonte.slice(i, i + 900);
  assert.match(trecho, /try \{[\s\S]*catch \(e\)/, 'o envio de e-mail precisa de try/catch');
  assert.match(trecho, /e-mail falhou: \$\{e\.message\}/, 'a falha tem que aparecer no log, não sumir');
});

test('conta como enviado qualquer canal que funcionou', () => {
  assert.match(fonte, /if \(como !== 'pronta'\) enviados\+\+/,
    'enviado por e-mail também é enviado — antes só o WhatsApp contava');
});

test('a tela de Avisos não promete só WhatsApp', () => {
  // O texto dizia "ninguém recebe no WhatsApp até ligar" — desde a mudança dos dois
  // canais isso virou meia verdade: com SMTP ligado, sai por e-mail.
  const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');
  assert.ok(!/ninguém recebe no WhatsApp até ligar/.test(cfg),
    'a tela ainda diz que só o WhatsApp entrega');
  assert.match(cfg, /sai pelos <b>dois canais<\/b>/,
    'a tela deveria explicar que são dois canais');
});
