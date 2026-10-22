// Formulários que o cliente preenche DENTRO do sistema, no portal.
//
// Por que aqui e não num formulário de fora: com link externo as respostas ficam na
// outra ferramenta, não entram na ficha do processo e a documentação não consegue
// usá-las na hora de montar o pacote. O escritório passaria a depender de duas telas.
//
// O do Visto T foi importado do formulário que o escritório já usava, campo a campo,
// na mesma ordem — ninguém redigitou nada e ninguém precisa reaprender a sequência.
//
// Tipos: titulo (só texto, separa as seções) · texto · longo · data · escolha
//        (com opcoes) · endereco · assinatura (nome digitado + declaração).
export const FORMULARIOS = [
  {
    id: 'visto-t',
    nome: 'Formulário de aplicação do Visto T',
    servico: 'Visto T',
    campos: [
    {"id": "qual_o_nome_da_pessoa_que_fez_seu_aten", "tipo": "texto", "rotulo": "Qual o nome da pessoa que fez seu atendimento?"},
    {"id": "nome_completo", "tipo": "texto", "rotulo": "Nome Completo"},
    {"id": "estado_civil", "tipo": "texto", "rotulo": "Estado Civil"},
    {"id": "ja_usou_outro_nome_no_passado_se_a_res", "tipo": "texto", "rotulo": "Já usou outro nome no passado? Se a resposta for sim, por favor, indique o(s) nome(s) que você usou:"},
    {"id": "telefone_principal", "tipo": "texto", "rotulo": "Telefone Principal"},
    {"id": "telefone_secundario", "tipo": "texto", "rotulo": "Telefone Secundário"},
    {"id": "melhor_e_mail", "tipo": "texto", "rotulo": "Melhor E-mail"},
    {"id": "qual_e_o_seu_status_migratorio_atual", "tipo": "texto", "rotulo": "Qual é o seu status migratório atual?"},
    {"id": "local_de_nascimento", "tipo": "texto", "rotulo": "Local de Nascimento"},
    {"id": "data_de_nascimento", "tipo": "data", "rotulo": "Data de Nascimento"},
    {"id": "qual_sua_nacionalidade", "tipo": "texto", "rotulo": "Qual sua Nacionalidade"},
    {"id": "outras_nacionalidades_se_houver", "tipo": "texto", "rotulo": "Outras Nacionalidades (se houver)"},
    {"id": "numero_do_seu_passaporte", "tipo": "texto", "rotulo": "Número do seu passaporte"},
    {"id": "emissao_do_passaporte", "tipo": "data", "rotulo": "Emissão do Passaporte"},
    {"id": "expiracao_do_seu_passaporte", "tipo": "data", "rotulo": "Expiração do seu passaporte"},
    {"id": "qual_e_a_sua_numeracao_a_caso_possua", "tipo": "texto", "rotulo": "Qual é a sua númeração A? (caso possua)"},
    {"id": "numero_do_i_94_se_tiver", "tipo": "texto", "rotulo": "Numero do I-94 (se tiver)"},
    {"id": "data_de_entrada_nos_eua", "tipo": "data", "rotulo": "Data de Entrada nos EUA:"},
    {"id": "local_de_entrada_nos_eua", "tipo": "texto", "rotulo": "Local de Entrada nos EUA:"},
    {"id": "forma_de_entrada_visto_utilizado_se_ho", "tipo": "texto", "rotulo": "Forma de Entrada (visto utilizado, se houver):"},
    {"id": "qual_e_a_sua_raca_ou_etnia", "tipo": "texto", "rotulo": "Qual é a sua raça ou etnia?"},
    {"id": "qual_e_seu_idioma_nativo", "tipo": "texto", "rotulo": "Qual é seu idioma nativo?"},
    {"id": "numero_drive_license_se_tiver", "tipo": "texto", "rotulo": "Número Drive License (se tiver)"},
    {"id": "endereco_atual", "tipo": "endereco", "rotulo": "Endereço atual"},
    {"id": "voce_possui_numero_de_seguro_social_ss", "tipo": "texto", "rotulo": "Você possui número de seguro social (SSN)? Caso tenha, por favor indique:"},
    {"id": "e_sua_primeira_entrada_nos_e_u_a_se_su", "tipo": "longo", "rotulo": "É sua primeira entrada nos E.U.A.? : Se sua resposta for NÃO, liste cada data e lugar de entrada, bem como as circunstancias em que entrou nos EUA nos últimos 5 anos? :"},
    {"id": "cooperacao_com_as_autoridades_voce_coo", "tipo": "texto", "rotulo": "Cooperação com as Autoridades Voce cooperou com as autodades na investigação do trafico? (sim/não):"},
    {"id": "detalhes_da_cooperacao_campo_aberto", "tipo": "texto", "rotulo": "Detalhes da cooperação (campo aberto):"},
    {"id": "numero_do_caso_ou_relatorio_policial_s", "tipo": "texto", "rotulo": "Numero do caso ou relatório policial (se disponível):"},
    {"id": "nome_da_agencia_de_investigacao", "tipo": "texto", "rotulo": "Nome da agencia de investigação:"},
    {"id": "por_favor_de_as_seguintes_informacaos_", "tipo": "titulo", "rotulo": "Por favor, dê as seguintes informaçãos sobre seu cônjuge:"},
    {"id": "nome_completo_conjuge", "tipo": "texto", "rotulo": "Nome completo Cônjuge:"},
    {"id": "data_de_nascimento_conjuge", "tipo": "data", "rotulo": "Data de nascimento Cônjuge:"},
    {"id": "numero_de_ssn_conjuge_se_tiver", "tipo": "texto", "rotulo": "Número de SSN cônjuge (se tiver):"},
    {"id": "status_migratorio_da_ultima_vez_que_fo", "tipo": "texto", "rotulo": "Status migratório da última vez que foi admitido aos Estados Unidos (Cônjuge):"},
    {"id": "numeracao_i_94_caso_possua", "tipo": "texto", "rotulo": "Numeração I-94 (caso possua):"},
    {"id": "por_favor_de_as_seguintes_informacaos__2", "tipo": "titulo", "rotulo": "Por favor, dê as seguintes informaçãos sobre seu filho(s)."},
    {"id": "voce_tem_filhos", "tipo": "escolha", "rotulo": "Você tem filhos?", "opcoes": ["Sim", "Não"]},
    {"id": "nome_completo_filho_1", "tipo": "texto", "rotulo": "Nome completo (Filho 1):"},
    {"id": "numero_de_seguro_social_filho_1", "tipo": "texto", "rotulo": "Número de Seguro Social (Filho 1)"},
    {"id": "data_de_nascimento_filho_1", "tipo": "data", "rotulo": "Data de Nascimento (Filho 1):"},
    {"id": "cidade_e_estado_se_for_nos_eua_ou_pais", "tipo": "texto", "rotulo": "Cidade e Estado (se for nos EUA) ou País de nascimento do (Filho 1):"},
    {"id": "status_migratorio_da_ultima_vez_que_fo_2", "tipo": "texto", "rotulo": "Status migratório da última vez que foi admitido aos Estados Unidos (Filho 1):"},
    {"id": "data_de_expiracao_do_status_filho_1", "tipo": "data", "rotulo": "Data de expiração do status (Filho 1):"},
    {"id": "numeracao_i_94_caso_possua_filho_1", "tipo": "texto", "rotulo": "Numeração I-94 caso possua (Filho 1):"},
    {"id": "nome_completo_filho_2", "tipo": "texto", "rotulo": "Nome completo (Filho 2):"},
    {"id": "numero_de_seguro_social_filho_2", "tipo": "texto", "rotulo": "Número de Seguro Social (Filho 2):"},
    {"id": "data_de_nascimento_filho_2", "tipo": "data", "rotulo": "Data de Nascimento (Filho 2):"},
    {"id": "cidade_e_estado_se_for_nos_eua_ou_pais_2", "tipo": "texto", "rotulo": "Cidade e Estado (se for nos EUA) ou País de nascimento do (Filho 2):"},
    {"id": "status_migratorio_da_ultima_vez_que_fo_3", "tipo": "texto", "rotulo": "Status migratório da última vez que foi admitido aos Estados Unidos (Filho 2):"},
    {"id": "data_de_expiracao_do_status_filho_2", "tipo": "data", "rotulo": "Data de expiração do status (Filho 2):"},
    {"id": "numeracao_i_94_caso_possua_filho_2", "tipo": "texto", "rotulo": "Numeração I-94 caso possua (Filho 2):"},
    {"id": "nome_completo_filho_3", "tipo": "texto", "rotulo": "Nome completo (Filho 3):"},
    {"id": "numero_de_seguro_social_filho_3", "tipo": "texto", "rotulo": "Número de Seguro Social (Filho 3)"},
    {"id": "data_de_nascimento_filho_3", "tipo": "data", "rotulo": "Data de Nascimento (Filho 3):"},
    {"id": "cidade_e_estado_se_for_nos_eua_ou_pais_3", "tipo": "texto", "rotulo": "Cidade e Estado (se for nos EUA) ou País de nascimento do (Filho 3):"},
    {"id": "status_migratorio_da_ultima_vez_que_fo_4", "tipo": "texto", "rotulo": "Status migratório da última vez que foi admitido aos Estados Unidos (Filho 3):"},
    {"id": "data_de_expiracao_do_status_filho_3", "tipo": "data", "rotulo": "Data de expiração do status (Filho 3):"},
    {"id": "numeracao_i_94_caso_possua_filho_3", "tipo": "texto", "rotulo": "Numeração I-94 caso possua (Filho 3):"},
    {"id": "voce_alguma_vez_teve_o_asilo_politico_", "tipo": "texto", "rotulo": "Você alguma vez teve o asilo político negado por um juiz de imigração ou pelo tribunal de apelações de imigração? Em quais dados?"},
    {"id": "depois_que_voce_saiu_do_seu_pais_de_or", "tipo": "longo", "rotulo": "Depois que você saiu do seu país de origem e chegou aos Estados Unidos, você voltou para o seu país? Se a resposta for sim, por favor descreva os detalhes de sua visita, como dados, propósito da viagem e o tempo em que você ficou no seu país de origem."},
    {"id": "declaro_que_todas_as_informacoes_forne", "tipo": "escolha", "rotulo": "Declaro que todas as informações fornecidas acima são verdadeiras e completas", "opcoes": ["VERDADEIRO", "FALSO"]},
    {"id": "assinatura", "tipo": "assinatura", "rotulo": "Assinatura*", "obrigatorio": true}
    ],
  },

  // ---------------------------------------------------------------------------
  // FOIA — o pedido do histórico imigratório ao governo americano.
  //
  // São as perguntas que o escritório já fazia por mensagem, uma a uma. Dentro
  // do sistema elas ficam no processo: a documentação lê as respostas na hora de
  // montar o pedido, em vez de caçar no WhatsApp.
  //
  // O último campo é livre, a pedido dela: "inclua também um campo no final para
  // o cliente explicar livremente qualquer situação imigratória anterior que não
  // tenha sido mencionada nas perguntas". É onde aparece o que nenhuma pergunta
  // alcança — e no FOIA é justamente isso que costuma mudar o caso.
  // ---------------------------------------------------------------------------
  {
    id: 'foia',
    nome: 'Formulário do FOIA (histórico imigratório)',
    servico: 'FOIA',
    campos: [
      { id: 'ja_entrou_nos_eua', tipo: 'escolha', rotulo: 'Já entrou nos Estados Unidos alguma vez?', opcoes: ['Sim', 'Não'] },
      { id: 'quantas_vezes_entrou', tipo: 'texto', rotulo: 'Quantas vezes entrou nos Estados Unidos?' },
      { id: 'data_primeira_entrada', tipo: 'data', rotulo: 'Data da primeira entrada nos EUA' },
      { id: 'data_ultima_entrada', tipo: 'data', rotulo: 'Data da última entrada nos EUA' },
      { id: 'cidade_estado_ultima_entrada', tipo: 'texto', rotulo: 'Cidade e estado da última entrada' },
      { id: 'como_entrou', tipo: 'texto', rotulo: 'Como entrou nos Estados Unidos? (visto, fronteira, parole ou outro)' },
      { id: 'detido_pela_imigracao', tipo: 'longo', rotulo: 'Já foi detido pela imigração (ICE ou CBP)? Quando e onde?' },
      { id: 'deportado_ou_removido', tipo: 'longo', rotulo: 'Já foi deportado, removido ou recebeu ordem de remoção?' },
      { id: 'audiencia_na_corte', tipo: 'longo', rotulo: 'Já teve audiência na Corte de Imigração? Qual cidade/estado?' },
      { id: 'beneficio_imigratorio', tipo: 'longo', rotulo: 'Já solicitou asilo, visto, Green Card ou outro benefício imigratório? Qual?' },
      { id: 'receipt_number', tipo: 'texto', rotulo: 'Possui algum número de processo (Receipt Number)?' },
      { id: 'outro_nome_ou_nascimento', tipo: 'longo', rotulo: 'Já utilizou outro nome ou outra data de nascimento em registros imigratórios?' },
      { id: 'foia_anterior', tipo: 'longo', rotulo: 'Já solicitou FOIA anteriormente? Possui número de controle?' },
      { id: 'registros_desejados', tipo: 'longo', rotulo: 'Quais registros deseja obter? (A-File completo, entrada na fronteira, processos anteriores etc.)' },
      { id: 'outras_situacoes', tipo: 'longo', rotulo: 'Há mais alguma situação imigratória anterior que não foi perguntada aqui? Conte com suas palavras — mesmo que pareça pequeno, pode ser importante para o pedido.' },
      { id: 'declaro', tipo: 'escolha', rotulo: 'Declaro que todas as informações fornecidas acima são verdadeiras e completas', opcoes: ['VERDADEIRO', 'FALSO'] },
      { id: 'assinatura', tipo: 'assinatura', rotulo: 'Assinatura*', obrigatorio: true },
    ],
  },
];

export const formularioPorId = (id) => FORMULARIOS.find(f => f.id === id) || null;
export const camposDoFormulario = (id) => (formularioPorId(id) || {}).campos || [];
