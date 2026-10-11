// As regras da migração do Trello, num lugar só: o importador e o pente fino
// leem daqui. Se ficassem duplicadas, uma correção entraria num e não no
// outro, e a conferência passaria a aprovar coisa errada.

// Cartões que são gabarito, não cliente.
const EH_MODELO = t => /NOME DO CLIENTE|^MODELO\b|^Modelo\b|MODELO$/i.test(String(t))
  || /^D-S160 VISA TURISTA$/i.test(String(t).trim());

// O serviço NÃO é o quadro: dentro de "LWG VISA T" há cartões de VAWA, MOTION
// e Green Card. Quando o título diz o serviço, é ele que vale.
// Testado de cima para baixo; o primeiro que casar ganha.
const PREFIXOS = [
  [/^VISTO T \(T VISA\)\s*[—–-]\s*/i,            'Visto T'],
  [/^T VISA\s*-\s*/i,                            'Visto T'],
  [/^VISTO DE ESTUDANTE F-1\s*-\s*/i,            'F1 - Estudante'],
  [/^RENOVAÇÃO DE PASSAPORTE BRASILEIRO\s*-\s*/i,'Renovação de Passaporte'],
  [/^WORK PERMIT E SOCIAL\s*-\s*/i,              'WORK PERMIT E SOCIAL'],
  [/^GREEN CARD POR CASAMENTO\s*-\s*/i,          'GreenCard Casamento'],
  [/^MUDANÇA DE ENDEREÇO\s*-\s*/i,               'Mudança de Endereço'],
  [/^PP?ETICAO FAMILIAR\s*[—–-]\s*/i,            'Petição Familiar'],
  [/^D-?S\s?160( VISA)?( TURISTA)?\s*-\s*/i,     'DS-160'],
  [/^EXTENSAO\s*-\s*/i,                          'Extensão de Turista'],
  [/^PERMIT\s*-\s*/i,                            'WORK PERMIT E SOCIAL'],
  [/^MOTION\s*[—–-]\s*/i,                        'MOTION'],
  [/^VAWA\s*-\s*/i,                              'VAWA'],
  [/^ASILO\s*-\s*/i,                             'Asilo'],
  [/^FOIA\s*-\s*/i,                              'FOIA'],
];

// Quando o título não diz o serviço, vale o quadro.
const SERVICO_DO_QUADRO = {
  'ASILO':'Asilo', 'FOIA':'FOIA', 'KAMMY ZUPPO':'Petição Familiar',
  'LGW F1 STUDENT':'F1 - Estudante', 'LWG DS160':'DS-160',
  'LWG EXTENSAO TURISTA':'Extensão de Turista', 'LWG VISA T':'Visto T',
  'MOTION':'MOTION', 'MUDANCA DE CORTE/ONLINE':'Mudança de Corte',
  'MUDANCA DE ENDERECO':'Mudança de Endereço', 'PASSAPORTES LGW':'Renovação de Passaporte',
  'REAGENDAMENTO DE FINGER':'Reagendamento de Finger', 'SOCIAL E PERMIT':'WORK PERMIT E SOCIAL',
};

// Listas que são NOME DE PESSOA viram responsável, não etapa — é o mesmo
// engano do Kommo, onde a coluna dizia ao mesmo tempo em que pé está o
// processo e de quem ele é.
const PESSOAS = ['ELAINE', 'VITORIA', 'PETERSON'];

const ETAPA = {
  'CLIENTES':'Aguardando boas-vindas','CLIENTES KAMMY':'Aguardando boas-vindas',
  'CLIENTES PASSAPORTE':'Aguardando boas-vindas','CONTRATO ASSINADO':'Aguardando boas-vindas',
  'CLIENTES DEVENDO':'Aguardando autorização financeira',
  'AGUARDANDO DOC':'Documentos solicitados','NAO ENVIAM DOC':'Documentos solicitados',
  'PROCESSO EM ANDAMENTO':'Recebendo documentos','LAUDO AGENDADO':'Recebendo documentos',
  'AGUARDANDO TRADUCOES':'Recebendo documentos','AGURADANDO TRADUCAO':'Recebendo documentos',
  'PEDIDO ENVIADO':'Protocolado','PROCESSO ENVIADO':'Protocolado','PROCESSO PROTOCOLADO':'Protocolado',
  'MOTION PROTOCOLADA':'Protocolado','PETICAO FAMILIAR':'Protocolado','CASAMENTO':'Protocolado',
  'I797C':'Em acompanhamento','NOTICE I797':'Em acompanhamento','FINGER PRINT':'Em acompanhamento',
  'REAGENDAMENTO':'Em acompanhamento','ENVIADO AO CLIENTE':'Em acompanhamento','MOTION':'Em acompanhamento',
  'PROCESSO FINALIZADO':'Em acompanhamento','FINALIZADO':'Em acompanhamento','FINALIZADOS':'Em acompanhamento',
  'MOTION FINALIZADA':'Em acompanhamento','APROVADO':'Em acompanhamento','APROVADOS':'Em acompanhamento',
  'FOIA RECEBIDO':'Em acompanhamento',
};

// Gente que o Trello chama de um jeito e o sistema de outro. A busca por nome
// aproximado (primeiro + último nome) não pega estes: ou o cartão tem só o
// primeiro nome ("ELIABE", "RITHIELE"), ou o sobrenome está escrito com uma
// letra diferente ("Gomide"/"Gomides", "Vales"/"Valles", "Wanderson"/"Wandersom").
// Sem esta tabela o sistema criaria a pessoa de novo e ela ficaria partida em
// dois cadastros. Cada par aqui foi conferido: em quase todos o serviço do
// cartão bate com o processo que a pessoa já tem no sistema.
const APELIDOS = {
  'ELIABE':                             'Eliabe Ferreira Silva',
  'ELIABE FERREIRA':                    'Eliabe Ferreira Silva',
  'RITHIELE':                           'Rithiele das Neves Guetler',
  'JONAS IMAI / JOJO':                  'Jonas Imai',
  'ROGERIO GOMIDE':                     'Rogerio Gomides',
  'GIRLAN NATUREZA':                    'Girlan Natureza da Silva',
  'FELIPE REBOLLEDO':                   'Felipe Aparecido Rebolledo Espinoza',
  'FRANCISCO ATILA':                    'Francisco Atila Costa Palosqui',
  'CELSO MUNIZ ANDRADE (PAI)':          'Celso Augusto Muniz de Andrade',
  'Bruno Carraro Vales':                'Bruno Carraro Valles',
  'ALISSON RICARDO DE OLIVEIRA SANTOS': 'Alison Ricardo de Oliveira dos Santos',
  'JOSE ENRIQUE RAMOS GONZALES':        'Jose Enrique Ramos Gonzalez',
  'WANDERSON ORLANDO DA COSTA':         'Wandersom Orlando da Costa',
  'Tiago Correia':                      'Tiago Correia Pires',
};

// Os lotes, do menor para o maior: erro aparece cedo e custa pouco.
const LOTES = {
  1: ['MUDANCA DE CORTE/ONLINE'],
  2: ['MOTION', 'ASILO', 'FOIA', 'MUDANCA DE ENDERECO', 'KAMMY ZUPPO'],
  3: ['LWG DS160', 'PASSAPORTES LGW', 'REAGENDAMENTO DE FINGER', 'SOCIAL E PERMIT'],
  4: ['LWG EXTENSAO TURISTA', 'LGW F1 STUDENT'],
  5: ['LWG VISA T'],     // 189 cartões, 2444 anexos — sai em partes
};

const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const PART = new Set(['de','da','do','das','dos','e','di','du','del']);
const fuzzy = n => { const p = norm(n).split(' ').filter(x => x.length > 2 && !PART.has(x));
  return p.length >= 2 ? p[0] + ' ' + p[p.length-1] : ''; };

module.exports = { EH_MODELO, PREFIXOS, SERVICO_DO_QUADRO, PESSOAS, ETAPA, APELIDOS, LOTES, norm, fuzzy };
