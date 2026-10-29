// A ficha que reaparecia em "Aguardando boas-vindas".
//
// Relato dela: "welington ramos ribeiro, o card de renovacao de passaporte
// coloco o card em recebendo documentos volta para boas vindas".
//
// Ninguém arrastava nada. A automação que cria ficha para contrato assinado
// perguntava "esta pessoa já tem ficha deste serviço?" comparando os nomes com
// `===` cru. "Renovação de Passaporte" na ficha e "Renovação de passaporte" no
// contrato são o MESMO serviço e davam diferente — então a ficha existente não
// contava, e uma nova nascia no começo do quadro a cada rodada.
//
// A adoção logo abaixo já comparava sem acento e sem maiúscula. Era a mesma
// pergunta feita de dois jeitos no mesmo arquivo.

import { test } from 'node:test';
import assert from 'node:assert';
process.env.DATABASE_URL ||= 'postgres://x:x@localhost:5432/x'; // db.js só exige que exista
const { fichaDoMesmoCliente } = await import('../src/automacoes.js');
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(join(AQUI, '../src/automacoes.js'), 'utf8');

test('a mesma pergunta é feita do mesmo jeito nos dois lugares', () => {
  assert.ok(/p\.contratoId === c\.id && semAc\(p\.servico \|\| ''\) === semAc\(sv\.nome\)/.test(fonte),
    'a checagem de "já existe ficha deste serviço" voltou a comparar texto cru');
});

// As variações que aparecem de verdade nos dados: acento, maiúscula e espaço
// sobrando. Vieram de três origens diferentes — Bling, Trello e digitação.
test('acento, maiúscula e espaço não fazem dois serviços de um', () => {
  const semAc = (t) => String(t || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const mesmos = [
    ['Renovação de Passaporte', 'Renovação de passaporte'],
    ['Extensão de Turista', 'extensao de turista'],
    ['F1 - Estudante ', 'F1 - Estudante'],
  ];
  for (const [a, b] of mesmos) {
    assert.strictEqual(semAc(a), semAc(b), `"${a}" e "${b}" deveriam ser o mesmo serviço`);
  }
  // E o que é diferente continua diferente: a trava não pode juntar serviços
  // que são de verdade dois.
  assert.notStrictEqual(semAc('F1 - Estudante'), semAc('F2 - Dependente'));
  assert.notStrictEqual(semAc('Extensão de Turista'), semAc('Renovação de Passaporte'));
});

// A adoção só alcança ficha ÓRFÃ. É por isso que a comparação acima precisa
// estar certa: a ficha do Welington já tinha contrato, então a adoção nunca
// ia salvá-la — o único freio era a pergunta que estava quebrada.
test('a adoção não pega ficha que já tem contrato', () => {
  const contrato = { id: 'c1', cliente: 'Welington Ramos Ribeiro', telefone: '(321) 555-0101', email: 'w@exemplo.com' };
  const comContrato = { id: 'f1', contratoId: 'c9', clienteNome: 'Welington Ramos Ribeiro',
    telefone: '(321) 555-0101', email: 'w@exemplo.com', servico: 'Renovação de Passaporte' };
  assert.strictEqual(fichaDoMesmoCliente([comContrato], contrato, 'Renovação de passaporte'), null,
    'ficha que já tem contrato não pode ser adotada por outro');
});

test('ficha órfã do mesmo serviço é adotada mesmo com acento diferente', () => {
  const contrato = { id: 'c1', cliente: 'Welington Ramos Ribeiro', telefone: '(321) 555-0101', email: 'w@exemplo.com' };
  const orfa = { id: 'f2', clienteNome: 'Welington Ramos Ribeiro', telefone: '(321) 555-0101',
    email: 'w@exemplo.com', servico: 'renovacao de passaporte' };
  const achou = fichaDoMesmoCliente([orfa], contrato, 'Renovação de Passaporte');
  assert.ok(achou && achou.ficha.id === 'f2', 'a ficha órfã do mesmo serviço deveria ter sido adotada');
});
