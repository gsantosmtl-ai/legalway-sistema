// "Criar outra mensagem — follow up de documentos / follow up comercial /
// follow up sem contato."
//
// O de documentos já existia (era "Documentos que faltam"; passou a se chamar
// pelo nome que ela usa). Os outros dois não: até aqui todo aviso falava com
// cliente de contrato fechado. Estes falam com o LEAD, antes do contrato — que
// é exatamente onde a conversa esfria e some.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { GATILHOS } = await import('../src/avisos-automaticos.js');

const motor = readFileSync(new URL('../src/avisos-automaticos.js', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../../docs/configuracoes.html', import.meta.url), 'utf8');

const HOJE = '2026-10-22';
const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString();
const agora = { data: HOJE, minutos: 600, dia: 'qui' };

test('os três follow-ups existem, com o nome que ela usa', () => {
  assert.equal(GATILHOS.documentosPendentes.nome, 'Follow-up de documentos');
  assert.equal(GATILHOS.followupComercial.nome, 'Follow-up comercial');
  assert.equal(GATILHOS.semContato.nome, 'Follow-up sem contato');
});

test('follow-up comercial: sai no dia que o vendedor marcou, e nos atrasados', () => {
  const leads = [
    { id: 1, nome: 'Maria Silva', etapa: 'Qualificação', telefone: '+14075550110',
      proximaAcao: { data: HOJE }, vendedor: 'Renato', servico: 'EB-2 NIW' },
    { id: 2, nome: 'João Pedro Souza', etapa: 'Proposta enviada', telefone: '+13215550198',
      proximaAcao: { data: '2026-10-19' }, vendedor: 'Adriano', servico: 'Visto T' },
    { id: 3, nome: 'Ana Costa', etapa: 'Qualificação', telefone: '+14075550111',
      proximaAcao: { data: '2026-10-30' }, vendedor: 'Renato' },
  ];
  const r = GATILHOS.followupComercial.candidatos({ leads }, {}, agora);
  assert.deepEqual(r.map(c => c.alvo.id), [1, 2], 'hoje e o atrasado entram; o futuro não');
  assert.equal(r[0].valores.cliente, 'Maria', 'trata pelo primeiro nome');
  assert.equal(r[0].valores.nomeCompleto, 'Maria Silva');
  assert.equal(r[0].valores.vendedor, 'Renato', 'a mensagem sai assinada pelo vendedor');
  assert.equal(r[0].telefone, '+14075550110');
  assert.equal(r[0].onde, 'lead', 'o alvo é o lead, não o processo');
});

test('follow-up comercial: uma vez por data marcada, não todo dia', () => {
  // Sem a data na chave, um lead atrasado receberia a mesma mensagem todo dia
  // até alguém mexer nele.
  const leads = [{ id: 1, nome: 'Maria Silva', etapa: 'Qualificação', proximaAcao: { data: '2026-10-19' } }];
  const r = GATILHOS.followupComercial.candidatos({ leads }, {}, agora);
  assert.equal(r[0].chaveUnica, 'followup:2026-10-19');
  const amanha = GATILHOS.followupComercial.candidatos({ leads }, {}, { ...agora, data: '2026-10-23' });
  assert.equal(amanha[0].chaveUnica, 'followup:2026-10-19',
    'a chave acompanha a data marcada, não o dia de hoje — senão repete todo dia');
});

test('lead fechado não recebe follow-up', () => {
  // Quem já assinou ou já disse não não pode receber "ainda tem interesse?".
  const leads = ['Ganho', 'Perdido', 'Fechado', 'Cancelado', 'Arquivado'].map((etapa, i) => ({
    id: i, nome: 'Cliente ' + i, etapa, proximaAcao: { data: HOJE },
    ultimoContato: { quando: diasAtras(90) },
  }));
  assert.equal(GATILHOS.followupComercial.candidatos({ leads }, {}, agora).length, 0);
  assert.equal(GATILHOS.semContato.candidatos({ leads }, { diasParado: 7 }, agora).length, 0);
});

test('follow-up sem contato: só quem passou dos dias que ela definir', () => {
  const leads = [
    { id: 1, nome: 'Parado Antigo', etapa: 'Qualificação', ultimoContato: { quando: diasAtras(30) } },
    { id: 2, nome: 'Falei Ontem', etapa: 'Qualificação', ultimoContato: { quando: diasAtras(1) } },
    { id: 3, nome: 'Sem Contato Registrado', etapa: 'Proposta enviada', criadoEm: diasAtras(45) },
    { id: 4, nome: 'Entrou Agora', etapa: 'Entrada', criadoEm: diasAtras(2) },
  ];
  const r = GATILHOS.semContato.candidatos({ leads }, { diasParado: 7 }, agora);
  assert.deepEqual(r.map(c => c.alvo.id), [1, 3],
    'quem tem contato recente fica de fora; sem contato registrado vale a data de entrada');
  assert.equal(r[0].valores.dias, '7', 'o número de dias entra no texto');
});

test('follow-up sem contato: o prazo é dela, e tem padrão', () => {
  const leads = [{ id: 1, nome: 'Parado', etapa: 'Qualificação', ultimoContato: { quando: diasAtras(10) } }];
  assert.equal(GATILHOS.semContato.candidatos({ leads }, { diasParado: 30 }, agora).length, 0,
    'com 30 dias de prazo, 10 dias parados não entram');
  assert.equal(GATILHOS.semContato.candidatos({ leads }, { diasParado: 3 }, agora).length, 1);
  assert.equal(GATILHOS.semContato.candidatos({ leads }, {}, agora).length, 1,
    'sem prazo escrito, o padrão de 7 dias vale');
  assert.equal(GATILHOS.semContato.candidatos({ leads }, { diasParado: 0 }, agora).length, 1,
    'zero não pode virar "todo lead do mundo a cada passagem"');
});

test('o funil só é lido quando um aviso de lead está ligado', () => {
  // São milhares de leads: carregar isso a cada minuto por nada é desperdício.
  assert.match(motor, /const precisaLeads = ligados\.some\(a => GATILHOS\[a\.gatilho\]\.sobre === 'lead'\)/,
    'falta a checagem');
  assert.match(motor, /const \{ valor: leads, versao: vL \} = precisaLeads \? await bloco\(K\.leads\) : \{ valor: \[\], versao: null \}/,
    'sem aviso de lead ligado, o bloco não é lido');
});

test('o que foi mandado para o lead fica gravado no lead', () => {
  // Sem isto o lead receberia a mesma mensagem na passagem seguinte: a marca de
  // "já mandei" mora no próprio lead.
  assert.match(motor, /else if \(c\.onde === 'lead'\) \{\s*\n\s*mexeuLeads = true;/,
    'falta marcar que o funil mudou');
  assert.match(motor, /if \(mexeuLeads\) await gravar\(K\.leads, leads, vL, QUEM\)/,
    'o funil precisa ser gravado, senão a marca se perde');
  assert.match(motor, /c\.alvo\.historico\.push\(\{ tipo: 'Sistema'/,
    'o vendedor tem que ver no lead o que o sistema mandou em nome dele');
  // E na calibragem também, senão ligar o aviso dispararia para todo o histórico.
  assert.match(motor, /else if \(c\.onde === 'lead'\) mexeuLeads = true;/,
    'a calibragem também mexe no funil');
});

test('a tela sabe desenhar o campo de dias do follow-up sem contato', () => {
  assert.deepEqual(GATILHOS.semContato.extras, [{ k: 'diasParado', tipo: 'numero', label: 'Parado há mais de (dias)', padrao: 7 }]);
  assert.match(cfg, /if\(x\.tipo === 'numero'\)\{/, 'a tela precisa saber desenhar um extra numérico');
  assert.match(cfg, /value="\$\{escR\(a\[x\.k\] \?\? x\.padrao \?\? 7\)\}"/, 'com o padrão do próprio motivo');
});
